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
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import {
  LEAD_STATUSES,
  canTransitionLead,
  isLeadStatus,
  type LeadStatus,
} from '../../../../lib/pasantias/leads';

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

/** Case-insensitive `search` targets. */
const SEARCH_COLUMNS = ['first_name', 'last_name', 'email', 'institution'] as const;

/** The column is unbounded `text`; this is the only bound on an admin textarea. */
const NOTES_MAX_LENGTH = 2000;

/** A search term longer than this is a mistake, not a search. */
const SEARCH_MAX_LENGTH = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LeadStatusRow {
  status: string | null;
}

/** A query param arrives as `string | string[] | undefined`. */
function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
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

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01';
}

function missingTableResponse(res: NextApiResponse) {
  return res.status(503).json({
    error: 'La tabla de leads no existe. Aplica la migración antes de usar este panel.',
    migrationRequired: true,
  });
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  const statusParam = firstValue(req.query.status as string | string[] | undefined);
  if (statusParam !== undefined && statusParam !== '' && !isLeadStatus(statusParam)) {
    // An unknown value is a mistake worth surfacing, never a silent "all".
    return res.status(400).json({ error: 'El estado indicado no es válido.' });
  }

  const search = sanitizeSearchTerm(firstValue(req.query.search as string | string[] | undefined) ?? '');

  let query = supabase.from(TABLE).select(LEAD_COLUMNS).order('created_at', { ascending: false });
  if (isLeadStatus(statusParam)) {
    query = query.eq('status', statusParam);
  }
  if (search) {
    query = query.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.%${search}%`).join(','));
  }

  // The counts are computed over EVERY lead, never over the filtered set: tabs
  // whose numbers collapse the moment a filter is applied tell the admin
  // nothing about what is waiting for them.
  const [leadsResult, countsResult] = await Promise.all([
    query,
    supabase.from(TABLE).select('status'),
  ]);

  const { data: leads, error: leadsError } = leadsResult;
  const { data: statusRows, error: countsError } = countsResult;

  const failure = leadsError ?? countsError;
  if (failure) {
    if (isMissingTable(failure)) {
      return missingTableResponse(res);
    }
    console.error(`[${LOG_PREFIX}] lead fetch failed:`, failure);
    return res.status(500).json({ error: 'Error al cargar los leads' });
  }

  const counts: Record<LeadStatus | 'total', number> = {
    new: 0,
    contacted: 0,
    converted: 0,
    dismissed: 0,
    total: 0,
  };

  for (const row of (statusRows ?? []) as LeadStatusRow[]) {
    counts.total += 1;
    if (isLeadStatus(row.status)) {
      counts[row.status] += 1;
    }
  }

  return res.status(200).json({ leads: leads ?? [], counts });
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

  // Exactly two columns, listed by hand. Spreading the request body into a
  // service-role update is a write-anything primitive; `updated_at` is the
  // trigger's and is never written here.
  const update: { status?: LeadStatus; notes?: string | null } = {};

  if (hasStatus) {
    const next = body.status as LeadStatus;
    // D-03. `canTransitionLead(s, s)` is false by design, so re-sending the
    // status a lead already has is a denied transition, not a no-op success.
    if (!canTransitionLead((current as { status: string | null }).status, next)) {
      return res.status(400).json({
        error: 'Ese cambio de estado no está permitido para este lead.',
        allowed: LEAD_STATUSES.filter((candidate) =>
          canTransitionLead((current as { status: string | null }).status, candidate)
        ),
      });
    }
    update.status = next;
  }

  if (hasNotes) {
    update.notes = notes;
  }

  const { data: updated, error: updateError } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', id)
    .select(LEAD_COLUMNS)
    .maybeSingle();

  if (updateError) {
    if (isMissingTable(updateError)) {
      return missingTableResponse(res);
    }
    console.error(`[${LOG_PREFIX}] lead update failed:`, updateError);
    return res.status(500).json({ error: 'Error al guardar los cambios' });
  }

  return res.status(200).json({ lead: updated ?? null });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return handleMethodNotAllowed(res, ['GET', 'PATCH']);
  }

  const { isAdmin, error: authError } = await checkIsAdmin(req, res);
  if (authError) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden ver estos leads' });
  }

  try {
    const supabase = createServiceRoleClient();

    if (req.method === 'GET') {
      return await handleGet(req, res, supabase);
    }
    return await handlePatch(req, res, supabase);
  } catch (error) {
    console.error(`[${LOG_PREFIX}] unexpected error:`, error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
