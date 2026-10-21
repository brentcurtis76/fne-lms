/**
 * GET / PATCH /api/admin/pasantia-leads — the admin triage surface over
 * `public.pasantias_leads`.
 *
 * `pasantias_leads` grants NO authenticated write of any kind (D-04): the one
 * policy on the table is admin SELECT, and the migration REVOKEs everything
 * else. So a browser-side write is not merely discouraged here, it is
 * impossible — both verbs run through a service-role client behind
 * `checkIsAdmin`, which is the same `isGlobalAdmin` predicate the page's
 * `getServerSideProps` uses.
 *
 * D-03 lives at this boundary and nowhere else: the table's CHECK constrains
 * the SET of legal statuses and says nothing about legal MOVES, so every status
 * change here asks `canTransitionLead` first and a denied move answers 400 with
 * the moves that were legal.
 *
 * Ley 21.719: leads are adult professionals, but they are still PII. Nothing in
 * this file logs a lead's name, e-mail, phone, institution or message — error
 * objects only, as `pages/api/pasantias/lead.ts` does.
 *
 * PASANT-B004 (C009). A contact is one `pasantias_leads` row; each January
 * program it asked about is one `pasantias_lead_program_interests` row. GET
 * therefore pages CONTACTS — interests travel embedded, as a JSON array per
 * contact, so a contact with both programs is one row and counts never inflate.
 * Every number this route answers is an exact database count: the old
 * `select('status')` tally and the unpaginated list were both silently cut at
 * PostgREST's `max_rows` (1000), which is precisely the scale C009 is about.
 *
 * The forced-password gate is asked here as well as in the middleware: a caller
 * authenticated only by `Authorization: Bearer` never meets the middleware's
 * cookie branch, and this route reads and writes PII with a service-role
 * client. It runs after the admin decision and before ANY lead, interest or
 * count query, with the shared verdict and response helpers unchanged.
 *
 * C009 snapshot fix. The CSV export is `GET ?export=1`: ONE call to
 * `pasantias_admin_leads_export` (migration 20261021180000), which returns the
 * matching total and every matching contact with its interests from a single
 * database snapshot. The export never walks pages and never falls back to
 * them: separate PostgREST statements each see their own snapshot, so a write
 * committing between them could drop a contact that matched the whole time.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  handleMethodNotAllowed,
  sendForcedPasswordChangeResponse,
} from '../../../../lib/api-auth';
import type { ForcedChangeVerdict } from '../../../../lib/auth/forced-password-change';
import {
  JANUARY_PROGRAM_IDS,
  LEAD_STATUSES,
  canTransitionLead,
  isJanuaryProgramId,
  isLeadStatus,
  type JanuaryProgramId,
  type LeadStatus,
} from '../../../../lib/pasantias/leads';

/**
 * Only the export needs these. It streams every matching contact in one
 * response, up to the 100 000-contact ceiling: `responseLimit: false` lifts
 * Next's 4 MB API response guard, and Vercel's 4.5 MB body limit does not apply
 * to a streamed response
 * (https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
 * The screen GET and PATCH answer one page or one contact and are unaffected.
 */
export const config = {
  api: { responseLimit: false },
  maxDuration: 60,
};

const LOG_PREFIX = 'pasantia-leads admin';
const TABLE = 'pasantias_leads';

/**
 * The columns the admin surface reads, written out rather than `*` so a column
 * added to the table later reaches this response only when somebody decides it
 * should.
 */
const LEAD_COLUMNS = [
  'id',
  'cohort',
  'first_name',
  'last_name',
  'email',
  'institution',
  'phone',
  'role_title',
  'num_people',
  'message',
  'notes',
  'status',
  'source_path',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'consent_accepted_at',
  'consent_notice_version',
  'marketing_opt_in',
  'marketing_opt_in_at',
  'brochure_sent_at',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Every interest of the contact, embedded. Consent evidence travels with each
 * interest because each one was its own consent; the `reply_*` claim columns
 * stay out — a claim time is not a delivery and the admin has no use for it.
 */
const INTERESTS_EMBED =
  'program_interests:pasantias_lead_program_interests(program, consent_accepted_at, consent_notice_version, created_at)';

/**
 * The program FILTER, as a second embed of the same relation under its own
 * alias. `!inner` drops contacts without a matching interest, and filtering the
 * alias rather than `program_interests` is what leaves the contact's OTHER
 * interest in the response: an admin filtering by Mirada Profunda must still
 * see that the same person also asked about INSPIRA. Never returned.
 */
const PROGRAM_MATCH_ALIAS = 'program_match';
const PROGRAM_MATCH_EMBED = `${PROGRAM_MATCH_ALIAS}:pasantias_lead_program_interests!inner(program)`;

/** Contacts with no interest row: the pre-January history and anything unclassified. */
const NO_PROGRAM_FILTER = 'sin-programa';

type ProgramFilter = JanuaryProgramId | typeof NO_PROGRAM_FILTER;

/** Case-insensitive `search` targets. */
const SEARCH_COLUMNS = ['first_name', 'last_name', 'email', 'institution'] as const;

/** The column is unbounded `text`; this is the only bound on an admin textarea. */
const NOTES_MAX_LENGTH = 2000;

/** A search term longer than this is a mistake, not a search. */
const SEARCH_MAX_LENGTH = 120;

/**
 * Page bounds. The maximum stays well under PostgREST's `max_rows` (1000,
 * `supabase/config.toml`): a page the server truncated would be a page that
 * LOOKS complete, which is the exact failure this unit removes. The screen uses
 * the default; the export does not page at all.
 */
export const LEADS_DEFAULT_PAGE_SIZE = 50;
export const LEADS_MAX_PAGE_SIZE = 500;
/** 500 × 10 000 contacts is far past any cohort; a larger page number is a mistake. */
export const LEADS_MAX_PAGE = 10_000;

/** The one database read behind the export (see the file comment). */
const EXPORT_RPC = 'pasantias_admin_leads_export';

/**
 * The export's ceiling, unchanged from the paged export (500 per page × 200
 * pages). The function decides it inside the same snapshot; the route only
 * checks that its answer agrees.
 */
export const LEADS_EXPORT_MAX_CONTACTS = 100_000;

/** The 413 code of an export past the ceiling. */
export const LEADS_EXPORT_TOO_LARGE_CODE = 'LEADS_EXPORT_TOO_LARGE';

/**
 * PostgREST errors meaning the export is not deployed: no matching function
 * signature (`PGRST202`), or the function or a table under it missing. The
 * `pages/api/pasantias/lead.ts` set.
 */
const EXPORT_RPC_UNAVAILABLE_CODES = new Set(['PGRST202', '42883', '42P01']);

/** The function's result keys, exactly (migration 20261021180000). */
const EXPORT_RESULT_KEYS = ['total', 'too_large_rows', 'too_large_bytes', 'bytes', 'leads'] as const;

/** Characters buffered per write of the streamed export body. */
const EXPORT_CHUNK_CHARS = 64 * 1024;

/** A positive decimal integer, written plainly: no sign, no leading zero, no exponent. */
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]{0,5}$/;

/** PostgREST's answer to a range that starts past the last row (HTTP 416). */
const RANGE_NOT_SATISFIABLE = 'PGRST103';

/** The 409 code of a read during which some contact was written (see `handleGet`). */
export const LEADS_CHANGED_DURING_READ_CODE = 'LEADS_CHANGED_DURING_READ';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProgramInterestRow {
  program: string;
  consent_accepted_at: string | null;
  consent_notice_version: string | null;
  created_at: string | null;
}

interface LeadFilters {
  status: LeadStatus | null;
  search: string;
  program: ProgramFilter | null;
}

/** A query param arrives as `string | string[] | undefined`. */
function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * A pagination param: absent means the default; anything else must be exactly
 * one plain positive integer no larger than `max`. A repeated param is refused
 * rather than resolved, because "which one did the server use" is not a
 * question an export should ever have to ask.
 */
function parsePositiveInteger(
  value: string | string[] | undefined,
  fallback: number,
  max: number
): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !POSITIVE_INTEGER_PATTERN.test(value)) return null;
  const parsed = Number(value);
  return parsed <= max ? parsed : null;
}

function isProgramFilter(value: unknown): value is ProgramFilter {
  return value === NO_PROGRAM_FILTER || isJanuaryProgramId(value);
}

/** Interests in contract order, so every surface lists a contact's programs identically. */
function sortInterests(interests: unknown): ProgramInterestRow[] {
  const rows = Array.isArray(interests) ? (interests as ProgramInterestRow[]) : [];
  const rank = (program: string) => {
    const index = (JANUARY_PROGRAM_IDS as readonly string[]).indexOf(program);
    return index === -1 ? JANUARY_PROGRAM_IDS.length : index;
  };
  return [...rows].sort((a, b) => rank(a.program) - rank(b.program));
}

/** The response row: every listed column, all interests, and never the filter alias. */
function toLeadResponse(row: Record<string, unknown>) {
  const { [PROGRAM_MATCH_ALIAS]: _filterOnly, program_interests: interests, ...lead } = row;
  return { ...lead, program_interests: sortInterests(interests) };
}

/**
 * The forced-password verdict, failing closed. The shared reader already maps a
 * query ERROR to `unavailable`; a THROW (network, client construction) is the
 * same unreadable flag and must not fall through to a 500 that a client could
 * mistake for something worth retrying past.
 */
async function readForcedChangeVerdict(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string
): Promise<ForcedChangeVerdict> {
  try {
    return await getForcedPasswordChangeVerdict(supabase, userId);
  } catch (error) {
    console.error(`[${LOG_PREFIX}] password-change state unreadable:`, error);
    return 'unavailable';
  }
}

/**
 * Make a visitor-supplied search term safe to place inside a PostgREST `or=()`
 * expression.
 *
 * PostgREST parses `or=(...)` as a comma-separated list of filters wrapped in
 * parentheses, and `"` / `\` are how a value inside it is quoted and escaped.
 * A term carrying any of those characters can therefore re-partition the
 * expression into filters the caller wrote rather than the four this route
 * intends — the defect that still sits at `pages/api/admin/users.ts:295` and is
 * tracked in the backlog. They are DROPPED rather than escaped: they are
 * punctuation nobody searches a name or an institution by, and dropping cannot
 * produce a second interpretation the way hand-rolled escaping can.
 *
 * Two characters are deliberately LEFT ALONE, because they are `ilike` pattern
 * syntax rather than filter structure and can only widen a match inside a search
 * this same admin typed, on a route that only ever reads:
 *   - `%` and `_` — the LIKE wildcards. An admin who types `%` gets the wildcard.
 * One is dropped for the opposite reason:
 *   - `*` — PostgREST rewrites it to `%` inside an `ilike` pattern, so keeping it
 *     would be a wildcard the admin cannot see in what they typed.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw.trim().slice(0, SEARCH_MAX_LENGTH).replace(/[,()"\\*]/g, ' ').trim();
}

type WatermarkRead =
  | { ok: true; watermark: string | null }
  | { ok: false; error: { code?: string } };

/**
 * The newest `updated_at` over EVERY contact, or `null` for an empty table.
 * Inserts stamp it (`DEFAULT now()`) and updates bump it (trigger), so it moves
 * whenever a contact is written — as seen by this one statement.
 */
async function readWatermark(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<WatermarkRead> {
  const result = await supabase
    .from(TABLE)
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (result.error) return { ok: false, error: result.error };
  return {
    ok: true,
    watermark: ((result.data ?? []) as { updated_at: string | null }[])[0]?.updated_at ?? null,
  };
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01';
}

function missingTableResponse(res: NextApiResponse) {
  return res.status(503).json({
    error: 'La tabla de leads no existe. Aplica la migración antes de usar este panel.',
    migrationRequired: true,
  });
}

/**
 * One filtered query over contacts. The list and its fallback count both come
 * from here, so they can never disagree about what "matching" means.
 *
 * `select` must carry the embed a program filter refers to: PostgREST filters an
 * embedded resource only when the request also embeds it.
 */
function filteredLeads(
  supabase: ReturnType<typeof createServiceRoleClient>,
  filters: LeadFilters,
  select: string,
  options?: { count: 'exact'; head?: boolean }
) {
  let query = supabase.from(TABLE).select(select, options);
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.search) {
    query = query.or(
      SEARCH_COLUMNS.map((column) => `${column}.ilike.%${filters.search}%`).join(',')
    );
  }
  if (filters.program === NO_PROGRAM_FILTER) {
    // Embedded-null filtering: contacts whose interest array is empty.
    query = query.is('program_interests', null);
  } else if (filters.program) {
    query = query.eq(`${PROGRAM_MATCH_ALIAS}.program`, filters.program);
  }
  return query;
}

/** The embeds a filter set needs on top of whatever the caller selects. */
function filterEmbeds(filters: LeadFilters): string {
  if (filters.program === NO_PROGRAM_FILTER) return `, ${INTERESTS_EMBED}`;
  if (filters.program) return `, ${PROGRAM_MATCH_EMBED}`;
  return '';
}

/** The page's select: every listed column, every interest, plus the filter embed if any. */
function listSelect(filters: LeadFilters): string {
  const matchEmbed =
    filters.program && filters.program !== NO_PROGRAM_FILTER ? `, ${PROGRAM_MATCH_EMBED}` : '';
  return `${LEAD_COLUMNS}, ${INTERESTS_EMBED}${matchEmbed}`;
}

type FiltersParse = { ok: true; filters: LeadFilters } | { ok: false; error: string };

/**
 * The status, search and program filters, read the same way for the screen and
 * the export, so the two can never disagree about what "matching" means.
 */
function parseLeadFilters(query: NextApiRequest['query']): FiltersParse {
  const statusParam = firstValue(query.status as string | string[] | undefined);
  if (statusParam !== undefined && statusParam !== '' && !isLeadStatus(statusParam)) {
    // An unknown value is a mistake worth surfacing, never a silent "all".
    return { ok: false, error: 'El estado indicado no es válido.' };
  }

  // `program` is new with this unit, so it has no inherited first-value
  // behaviour to keep: a repeated one is refused rather than resolved. Taking
  // the first would show one program's contacts to an admin who asked for two,
  // and this route offers no "either program" filter. `status` and `search`
  // keep their existing first-value reading.
  const rawProgram = query.program as string | string[] | undefined;
  if (Array.isArray(rawProgram)) {
    return { ok: false, error: 'Indica un solo programa.' };
  }
  const programParam = rawProgram;
  if (programParam !== undefined && programParam !== '' && !isProgramFilter(programParam)) {
    return { ok: false, error: 'El programa indicado no es válido.' };
  }

  return {
    ok: true,
    filters: {
      status: isLeadStatus(statusParam) ? statusParam : null,
      search: sanitizeSearchTerm(firstValue(query.search as string | string[] | undefined) ?? ''),
      program: isProgramFilter(programParam) ? programParam : null,
    },
  };
}

/**
 * Microseconds since the epoch for a `timestamptz` as PostgreSQL renders it in
 * JSON, or `null`. The page's `timestampMicros` reading: `Date.parse` keeps
 * milliseconds only, and contacts inserted together differ below that.
 */
function timestampMicros(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
    value
  );
  if (!match) return null;
  const offset =
    match[3] === 'Z'
      ? 'Z'
      : match[3].length === 3
        ? `${match[3]}:00`
        : `${match[3].slice(0, 3)}:${match[3].slice(-2)}`;
  const millis = Date.parse(`${match[1].replace(' ', 'T')}${offset}`);
  if (Number.isNaN(millis)) return null;
  return millis * 1000 + Number((match[2] ?? '').padEnd(6, '0').slice(0, 6));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

type ExportSnapshot =
  | { kind: 'rows'; total: number; leads: Record<string, unknown>[] }
  | { kind: 'too_large' }
  | { kind: 'malformed'; reason: string };

/**
 * The function's answer, checked whole before a single byte is sent. Anything
 * short of exactly the contract is `malformed`: a 500, never a partial or
 * repaired export. The reasons are fixed text; no row value reaches the log.
 */
function readExportSnapshot(data: unknown): ExportSnapshot {
  const malformed = (reason: string): ExportSnapshot => ({ kind: 'malformed', reason });

  if (!isRecord(data)) return malformed('result is not an object');
  const keys = Object.keys(data);
  if (
    keys.length !== EXPORT_RESULT_KEYS.length ||
    !EXPORT_RESULT_KEYS.every((key) => keys.includes(key))
  ) {
    return malformed('result keys differ from the contract');
  }

  const { total, too_large_rows: tooLargeRows, too_large_bytes: tooLargeBytes, bytes, leads } = data;
  if (!isNonNegativeSafeInteger(total)) return malformed('total is not a non-negative safe integer');
  if (tooLargeRows !== (total > LEADS_EXPORT_MAX_CONTACTS)) {
    return malformed('too_large_rows disagrees with the ceiling');
  }
  // The route asks for no byte limit (`p_max_bytes` null), so a byte refusal
  // cannot be a genuine answer.
  if (tooLargeBytes !== false) return malformed('too_large_bytes is not false');
  if (!Array.isArray(leads)) return malformed('leads is not an array');

  if (tooLargeRows) {
    return leads.length === 0 && bytes === null
      ? { kind: 'too_large' }
      : malformed('a refusal past the ceiling carries rows');
  }

  if (!isNonNegativeSafeInteger(bytes)) return malformed('bytes is not a non-negative safe integer');
  if (leads.length !== total) return malformed('leads length differs from total');

  const seen = new Set<string>();
  let previous: { id: string; createdAt: number } | null = null;
  for (const lead of leads) {
    if (!isRecord(lead) || typeof lead.id !== 'string' || !UUID_PATTERN.test(lead.id)) {
      return malformed('a lead has no uuid id');
    }
    if (seen.has(lead.id)) return malformed('a lead id repeats');
    if (!Array.isArray(lead.program_interests)) return malformed('a lead has no interests array');
    const createdAt = timestampMicros(lead.created_at);
    if (createdAt === null) return malformed('a lead has an unreadable created_at');
    // `created_at desc, id desc`, strictly: an equal pair would be a repeat.
    if (
      previous &&
      !(previous.createdAt > createdAt || (previous.createdAt === createdAt && previous.id > lead.id))
    ) {
      return malformed('leads are out of order');
    }
    seen.add(lead.id);
    previous = { id: lead.id, createdAt };
  }

  return { kind: 'rows', total, leads: leads as Record<string, unknown>[] };
}

/**
 * One write, honouring backpressure: `false` once the client has gone, whether
 * before the write or while waiting for the socket to drain. Waiting on `drain`
 * alone would hang a closed connection until `maxDuration`.
 */
function writeExportChunk(
  res: NextApiResponse,
  chunk: string,
  isClosed: () => boolean
): Promise<boolean> {
  if (isClosed() || res.destroyed) return Promise.resolve(false);
  if (res.write(chunk) !== false) return Promise.resolve(true);
  return new Promise((resolve) => {
    const settle = (drained: boolean) => {
      res.removeListener('drain', onDrain);
      res.removeListener('close', onClose);
      resolve(drained);
    };
    const onDrain = () => settle(true);
    const onClose = () => settle(false);
    res.on('drain', onDrain);
    res.on('close', onClose);
  });
}

/**
 * The validated snapshot as one JSON body, `{"snapshot":true,"total":N,"leads":[…]}`,
 * written in chunks rather than built as one string.
 *
 * Once the status line is out there is no honest way left to say "failed"
 * except cutting the body: a client that goes away stops the writes, and a
 * write that fails destroys the response. Either way the body never closes its
 * JSON, and the page reads an unparseable body as an incomplete export.
 */
async function streamExport(
  res: NextApiResponse,
  total: number,
  leads: Record<string, unknown>[],
  isClosed: () => boolean
) {
  const closedEarly = () =>
    console.warn(`[${LOG_PREFIX}] lead export closed by the client before it ended`);

  try {
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    let buffer = `{"snapshot":true,"total":${total},"leads":[`;
    for (let index = 0; index < leads.length; index += 1) {
      buffer += `${index === 0 ? '' : ','}${JSON.stringify(toLeadResponse(leads[index]))}`;
      if (buffer.length >= EXPORT_CHUNK_CHARS) {
        if (!(await writeExportChunk(res, buffer, isClosed))) return closedEarly();
        buffer = '';
      }
    }
    if (isClosed() || res.destroyed) return closedEarly();
    res.end(`${buffer}]}`);
  } catch (error) {
    console.error(`[${LOG_PREFIX}] lead export stream failed:`, error);
    res.destroy();
  }
}

/**
 * `GET ?export=1`: every contact matching the filters, from one snapshot, or a
 * refusal. Auth and the forced-password gate have already run (handler).
 */
async function handleExport(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  if (req.query.export !== '1') {
    return res.status(400).json({ error: 'La exportación se pide con export=1.' });
  }
  if (req.query.page !== undefined || req.query.pageSize !== undefined) {
    return res.status(400).json({ error: 'La exportación no se pagina: quita page y pageSize.' });
  }
  const parsed = parseLeadFilters(req.query);
  if (parsed.ok !== true) {
    return res.status(400).json({ error: parsed.error });
  }
  const { filters } = parsed;

  // Listening before the read, so a client that leaves while the database works
  // is not answered with a body nobody will read.
  let closed = false;
  const onClose = () => {
    closed = true;
  };
  res.on('close', onClose);

  try {
    // `p_status` and `p_program` are null when unused, never ''. `p_search` is
    // the sanitized term, '' meaning no search. No byte limit: a streamed
    // response keeps the full ceiling.
    const { data, error } = await supabase.rpc(EXPORT_RPC, {
      p_status: filters.status,
      p_search: filters.search,
      p_program: filters.program,
      p_max_bytes: null,
    });

    if (error) {
      if (EXPORT_RPC_UNAVAILABLE_CODES.has(error.code)) {
        return res.status(503).json({
          error: 'La exportación de leads no está disponible. Aplica la migración antes de exportar.',
          migrationRequired: true,
        });
      }
      console.error(`[${LOG_PREFIX}] lead export failed:`, { code: error.code });
      return res.status(500).json({ error: 'Error al exportar los leads' });
    }

    const snapshot = readExportSnapshot(data);
    if (snapshot.kind === 'too_large') {
      return res.status(413).json({
        error: 'Hay demasiados leads para exportar de una vez. Aplica un filtro y vuelve a intentarlo.',
        code: LEADS_EXPORT_TOO_LARGE_CODE,
      });
    }
    if (snapshot.kind === 'malformed') {
      console.error(`[${LOG_PREFIX}] lead export snapshot rejected: ${snapshot.reason}`);
      return res.status(500).json({ error: 'Error al exportar los leads' });
    }

    return await streamExport(res, snapshot.total, snapshot.leads, () => closed);
  } finally {
    res.removeListener('close', onClose);
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  // The export is its own read: one snapshot, no pages, no watermark.
  if (req.query.export !== undefined) {
    return handleExport(req, res, supabase);
  }

  const parsed = parseLeadFilters(req.query);
  if (parsed.ok !== true) {
    return res.status(400).json({ error: parsed.error });
  }
  const { filters } = parsed;

  const page = parsePositiveInteger(
    req.query.page as string | string[] | undefined,
    1,
    LEADS_MAX_PAGE
  );
  const pageSize = parsePositiveInteger(
    req.query.pageSize as string | string[] | undefined,
    LEADS_DEFAULT_PAGE_SIZE,
    LEADS_MAX_PAGE_SIZE
  );
  if (page === null || pageSize === null) {
    return res.status(400).json({
      error: `La paginación no es válida: página entre 1 y ${LEADS_MAX_PAGE}, tamaño entre 1 y ${LEADS_MAX_PAGE_SIZE}.`,
    });
  }

  // The watermark is read BEFORE the page and read again AFTER every data read
  // (below); the response carries it only if both reads agree, so a write the
  // second read sees refuses the page. It is detection over `updated_at`, not
  // a snapshot, and the export no longer relies on it (`handleExport`).
  const before = await readWatermark(supabase);
  if (before.ok !== true) {
    if (isMissingTable(before.error)) {
      return missingTableResponse(res);
    }
    console.error(`[${LOG_PREFIX}] lead watermark failed:`, before.error);
    return res.status(500).json({ error: 'Error al cargar los leads' });
  }
  const watermark = before.watermark;

  const from = (page - 1) * pageSize;

  // `created_at` alone is not an order: rows inserted in one statement share a
  // timestamp, and an offset page boundary that falls inside such a run can
  // repeat one contact and skip another. `id` makes the order total.
  const listQuery = filteredLeads(supabase, filters, listSelect(filters), { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1);

  // The tab counts are computed over EVERY contact, never over the filtered
  // set: tabs whose numbers collapse the moment a filter is applied tell the
  // admin nothing about what is waiting for them. Exact HEAD counts, never a
  // tally of fetched rows, which `max_rows` would cut at 1000.
  const globalCount = (status: LeadStatus | null) => {
    const query = supabase.from(TABLE).select('id', { count: 'exact', head: true });
    return status ? query.eq('status', status) : query;
  };

  const [listResult, totalResult, ...statusResults] = await Promise.all([
    listQuery,
    globalCount(null),
    ...LEAD_STATUSES.map((status) => globalCount(status)),
  ]);

  const countFailure =
    totalResult.error ?? statusResults.find((result) => result.error)?.error ?? null;
  const listFailure =
    listResult.error && listResult.error.code !== RANGE_NOT_SATISFIABLE ? listResult.error : null;
  const failure = listFailure ?? countFailure;
  if (failure) {
    if (isMissingTable(failure)) {
      return missingTableResponse(res);
    }
    console.error(`[${LOG_PREFIX}] lead fetch failed:`, failure);
    return res.status(500).json({ error: 'Error al cargar los leads' });
  }

  let leads = (listResult.data ?? []) as unknown as Record<string, unknown>[];
  let total = listResult.count;

  if (listResult.error) {
    // The page starts past the last matching contact — a stale link, or the
    // filter set shrank while the admin was on its last page. Not an error: an
    // empty page plus the real total, so the screen can step back.
    const recount = await filteredLeads(supabase, filters, `id${filterEmbeds(filters)}`, {
      count: 'exact',
      head: true,
    });
    if (recount.error) {
      console.error(`[${LOG_PREFIX}] lead recount failed:`, recount.error);
      return res.status(500).json({ error: 'Error al cargar los leads' });
    }
    leads = [];
    total = recount.count;
  }

  // Every data read is done. Each one ran as its own PostgREST statement, so
  // this is detection, not a snapshot: it catches a write whose `updated_at` is
  // newer than the first read saw, and it cannot see a transaction that began
  // before the first read and commits during this request with an older stamp.
  // An unreadable second watermark is a failure, never a pass.
  const after = await readWatermark(supabase);
  if (after.ok !== true) {
    console.error(`[${LOG_PREFIX}] lead watermark re-read failed:`, after.error);
    return res.status(500).json({ error: 'Error al cargar los leads' });
  }
  if (after.watermark !== watermark) {
    return res.status(409).json({
      error: 'Los leads cambiaron mientras se leían',
      code: LEADS_CHANGED_DURING_READ_CODE,
    });
  }

  const counts = { total: totalResult.count } as Record<LeadStatus | 'total', number | null>;
  LEAD_STATUSES.forEach((status, index) => {
    counts[status] = statusResults[index].count;
  });

  // `count: 'exact'` always answers a number. If it ever does not, the honest
  // response is a failure — a guessed total is the defect this route replaces.
  if (typeof total !== 'number' || Object.values(counts).some((value) => typeof value !== 'number')) {
    console.error(`[${LOG_PREFIX}] exact count missing from a successful response`);
    return res.status(500).json({ error: 'Error al cargar los leads' });
  }

  return res.status(200).json({
    leads: leads.map(toLeadResponse),
    counts,
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize),
    },
    watermark,
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!UUID_PATTERN.test(id)) {
    return res.status(400).json({ error: 'Identificador de lead inválido.' });
  }

  const hasStatus = body.status !== undefined;
  const hasNotes = body.notes !== undefined;
  if (!hasStatus && !hasNotes) {
    return res.status(400).json({ error: 'No hay cambios que guardar.' });
  }

  if (hasStatus && !isLeadStatus(body.status)) {
    return res.status(400).json({ error: 'El estado indicado no es válido.' });
  }

  let notes: string | null = null;
  if (hasNotes) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return res.status(400).json({ error: 'Las notas deben ser texto.' });
    }
    const text = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (text.length > NOTES_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Las notas no pueden superar los ${NOTES_MAX_LENGTH} caracteres.` });
    }
    notes = text.length > 0 ? text : null;
  }

  const { data: current, error: currentError } = await supabase
    .from(TABLE)
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (currentError) {
    if (isMissingTable(currentError)) {
      return missingTableResponse(res);
    }
    console.error(`[${LOG_PREFIX}] lead lookup failed:`, currentError);
    return res.status(500).json({ error: 'Error al cargar el lead' });
  }

  if (!current) {
    return res.status(404).json({ error: 'No encontramos este lead.' });
  }

  const currentStatus = (current as { status: string | null }).status;

  // Exactly two columns, listed by hand. Spreading the request body into a
  // service-role update is a write-anything primitive; `updated_at` is the
  // trigger's and is never written here.
  const update: { status?: LeadStatus; notes?: string | null } = {};

  if (hasStatus) {
    const next = body.status as LeadStatus;
    // D-03. `canTransitionLead(s, s)` is false by design, so re-sending the
    // status a lead already has is a denied transition, not a no-op success.
    if (!canTransitionLead(currentStatus, next)) {
      return res.status(400).json({
        error: 'Ese cambio de estado no está permitido para este lead.',
        allowed: LEAD_STATUSES.filter((candidate) => canTransitionLead(currentStatus, candidate)),
      });
    }
    update.status = next;
  }

  if (hasNotes) {
    update.notes = notes;
  }

  // The status this write was validated against travels INTO the write, so
  // PostgreSQL evaluates D-03's precondition against the row it has locked
  // rather than against what this route read a moment ago. Without it two admins
  // on one `contacted` lead can commit `contacted→converted` and
  // `contacted→dismissed` from the same snapshot, and the table lands on a move
  // out of `converted` — which D-03 gives no outgoing edges at all. This
  // boundary is the only place that invariant exists (D-04: the table's CHECK
  // constrains the set of statuses, never the moves).
  //
  // `.eq`, never `.or`: PostgREST accepts `or=()` on SELECT but REJECTS it on
  // UPDATE for non-PK columns, so an `or`-shaped guard passes every mocked test
  // and fails only in production (Decision Log 2026-08-03; the incident note on
  // `lib/bots/store.ts:claimSessionTransition`). It is the same atomic-claim
  // shape `claimAutoReplyWindow` uses in `pages/api/pasantias/lead.ts`.
  //
  // A notes-only PATCH carries the guard too: `currentStatus` is still the value
  // the row must still hold for this write to be the one we decided on.
  const { data: updated, error: updateError } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', id)
    .eq('status', currentStatus)
    .select(LEAD_COLUMNS)
    .maybeSingle();

  if (updateError) {
    if (isMissingTable(updateError)) {
      return missingTableResponse(res);
    }
    console.error(`[${LOG_PREFIX}] lead update failed:`, updateError);
    return res.status(500).json({ error: 'Error al guardar los cambios' });
  }

  if (!updated) {
    // The row exists — we read it — so no match means somebody moved it between
    // our read and our write. Never a 200 with a null body, and never a retry:
    // the decision this request carried was made against a status the lead no
    // longer has. `status` is that guard value, i.e. what the lead held when
    // this request was validated (the D-07 409 shape).
    return res.status(409).json({
      error: 'Este lead cambió mientras lo editabas. Recarga la página e inténtalo de nuevo.',
      status: currentStatus,
    });
  }

  return res.status(200).json({ lead: updated });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return handleMethodNotAllowed(res, ['GET', 'PATCH']);
  }

  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden ver estos leads' });
  }

  try {
    const supabase = createServiceRoleClient();

    // Before any lead, interest or count query and before the export's RPC, for
    // GET (screen pages and the export alike) and PATCH, whichever way the
    // caller authenticated.
    const verdict = await readForcedChangeVerdict(supabase, user.id);
    if (sendForcedPasswordChangeResponse(res, verdict)) return;

    if (req.method === 'GET') {
      return await handleGet(req, res, supabase);
    }
    return await handlePatch(req, res, supabase);
  } catch (error) {
    console.error(`[${LOG_PREFIX}] unexpected error:`, error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
