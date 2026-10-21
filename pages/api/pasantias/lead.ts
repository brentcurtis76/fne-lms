/**
 * POST /api/pasantias/lead — public interest form for Pasantías INSPIRA.
 *
 * `pasantias_leads` grants NO write of any kind to `anon` or `authenticated`
 * (D-04): `anon` holds no privilege at all, so this route reads and writes
 * exclusively through a service-role client. That also makes this route the
 * place where the D-03 transition graph is enforced — see `canTransitionLead`.
 *
 * Anti-enumeration: a first-time submission and a resubmission of an address
 * already on file return the identical `200 {success:true}`, so the endpoint
 * never reveals whether an address is known. The honeypot path returns the
 * same body too, without touching the table.
 *
 * Consent is split evidence (D-12). Processing consent is required and
 * re-stamped on every submission; the marketing opt-in is optional, defaults
 * to false, and is written all-or-nothing so the table's CHECK constraint can
 * never see a half-set row.
 *
 * January 2027 (PASANT-B002b) takes a different write path: one submission is
 * one program interest, written by exactly ONE call to the service-role RPC
 * `pasantias_submit_program_interest` (contact + interest in one transaction,
 * the same contact/consent/triage rules as below, enforced in SQL). Its reply
 * suppression is the interest's own claim (`pasantias_claim_program_reply` /
 * `pasantias_settle_program_reply`), never `brochure_sent_at`. See
 * `docs/plan/evidence/pasant-january/b002-database-contract.md`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit } from '../../../lib/rateLimit';
import { normalizeText } from '../../../lib/signups';
import { PRIVACY_NOTICE_VERSION } from '../../../lib/legal/privacy-notice';
import {
  canTransitionLead,
  validateLeadSubmission,
  type JanuaryProgramId,
  type LeadSubmissionBody,
  type ValidatedLead,
} from '../../../lib/pasantias/leads';
import {
  autoReplyClaimCutoff,
  buildBrochureUrl,
  canReleaseAutoReplyClaim,
  programReplyOutcome,
  sendLeadAutoReply,
  sendLeadNotification,
  sendLeadProgramAutoReply,
  type LeadEmailPayload,
  type LeadEmailResult,
} from '../../../lib/pasantias/emails';

const LOG_PREFIX = 'pasantias-lead';

// Best-effort dampening only (D-04) — the durable controls are structural.
// Matches the other public form endpoints (contact, tractor-signup).
const leadRateLimit = rateLimit({ limit: 5, windowMs: 60 * 1000 }, 'pasantias-lead');

/**
 * The columns the dedup read needs, and nothing more.
 *
 * `marketing_opt_in` is deliberately NOT among them. Nothing may decide a
 * marketing write from a snapshot taken before the write (see
 * `marketingColumns`), and the cheapest way to keep that true is to never have
 * the value in hand. `brochure_sent_at` is read only to be restored if a claimed
 * auto-reply fails — the claim itself re-reads it inside the statement.
 */
const EXISTING_COLUMNS = 'id, status, brochure_sent_at';

interface ExistingLead {
  id: string;
  status: string | null;
  brochure_sent_at: string | null;
}

/** Contact columns, identical on the insert and the update path. */
function contactColumns(lead: ValidatedLead, nowIso: string) {
  return {
    first_name: lead.firstName,
    last_name: lead.lastName,
    email: lead.email,
    email_normalized: lead.emailNormalized,
    institution: lead.institution,
    phone: lead.phone,
    role_title: lead.roleTitle,
    num_people: lead.numPeople,
    message: lead.message,
    utm_source: lead.utmSource,
    utm_medium: lead.utmMedium,
    utm_campaign: lead.utmCampaign,
    // Processing consent (D-12): required, server clock, re-stamped every
    // time the person submits, because each submission is fresh evidence.
    consent_accepted_at: nowIso,
    consent_notice_version: PRIVACY_NOTICE_VERSION,
  };
}

/**
 * Marketing columns (D-12), written all-or-nothing.
 *
 * Opting in refreshes the evidence. NOT opting in never clears an opt-in —
 * withdrawing consent is unsubscribe's job, and a form submitted with the box
 * unchecked is not a withdrawal.
 *
 * The decision reads ONLY this submission, never the row we selected earlier.
 * An earlier version consulted `existing.marketing_opt_in` and wrote the
 * complete false tuple when that snapshot said false — which loses the update
 * if another submission (or an admin) sets the flag between our SELECT and our
 * UPDATE. That is a consent regression, not an ordinary lost update: the person
 * opted in and the record would say they did not. So on `update` the columns are
 * simply absent unless this submission is itself the opt-in, and no snapshot can
 * influence the payload.
 *
 * `insert` still writes the complete false tuple, because there is no prior
 * state to lose and `false / null / null` is the safe non-assertion D-12 asks
 * for on a brand-new row.
 */
function marketingColumns(
  lead: ValidatedLead,
  mode: 'insert' | 'update',
  nowIso: string
): Record<string, unknown> {
  if (lead.marketingOptIn) {
    return {
      marketing_opt_in: true,
      marketing_opt_in_at: nowIso,
      marketing_notice_version: PRIVACY_NOTICE_VERSION,
    };
  }

  if (mode === 'update') {
    return {};
  }

  return {
    marketing_opt_in: false,
    marketing_opt_in_at: null,
    marketing_notice_version: null,
  };
}

/**
 * `source_path` (attribution), written only when this submission actually
 * reported a usable one.
 *
 * On INSERT there is nothing to lose, so the column is always written — null
 * included. On UPDATE the column is left out entirely unless a fresh path
 * arrived: a resubmission from a page that sends no `sourcePath`, or one whose
 * value `sanitizeSourcePath` refused, must not erase where the lead first came
 * from. Same idiom as `marketingColumns` — an empty object leaves the column
 * untouched.
 */
function sourcePathColumns(lead: ValidatedLead): Record<string, unknown> {
  return lead.sourcePath ? { source_path: lead.sourcePath } : {};
}

function toEmailPayload(lead: ValidatedLead): LeadEmailPayload {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    institution: lead.institution,
    phone: lead.phone,
    roleTitle: lead.roleTitle,
    numPeople: lead.numPeople,
    message: lead.message,
    marketingOptIn: lead.marketingOptIn,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    program: lead.program,
  };
}

/**
 * Take the right to send this lead's auto-reply, atomically.
 *
 * The window is `brochure_sent_at IS NULL OR brochure_sent_at < cutoff`, but it
 * is claimed with TWO single-predicate statements rather than one `or` filter.
 * PostgREST rejects `or` filters on UPDATE for non-PK columns — it accepts them
 * on SELECT, so no fake or unit test can catch the difference, and this repo has
 * already paid for that once (see the incident note on
 * `lib/bots/store.ts:claimSessionTransition`). `.eq`/`.is`/`.lt` on UPDATE are
 * the proven form.
 *
 * Splitting the disjunction costs nothing in correctness. Each statement is
 * atomic on its own, and whichever one succeeds sets the column to `now` — which
 * satisfies neither predicate — so a concurrent request that reaches either
 * statement afterwards matches no row. Exactly one caller can get `true`.
 */
async function claimAutoReplyWindow(
  supabase: ReturnType<typeof createServiceRoleClient>,
  leadId: string,
  nowIso: string,
  cutoff: string
): Promise<boolean> {
  // Never sent.
  const fresh = await supabase
    .from('pasantias_leads')
    .update({ brochure_sent_at: nowIso })
    .eq('id', leadId)
    .is('brochure_sent_at', null)
    .select('id');

  if (fresh.error) {
    console.error(`[${LOG_PREFIX}] auto-reply claim (unsent) failed:`, fresh.error);
    return false;
  }
  if (Array.isArray(fresh.data) && fresh.data.length > 0) {
    return true;
  }

  // Sent, but longer ago than the dedup window.
  const expired = await supabase
    .from('pasantias_leads')
    .update({ brochure_sent_at: nowIso })
    .eq('id', leadId)
    .lt('brochure_sent_at', cutoff)
    .select('id');

  if (expired.error) {
    console.error(`[${LOG_PREFIX}] auto-reply claim (expired) failed:`, expired.error);
    return false;
  }
  return Array.isArray(expired.data) && expired.data.length > 0;
}

/**
 * The auto-reply, deduped by an ATOMIC CLAIM rather than a check-then-act read.
 *
 * The claim IS the dedup: PostgreSQL evaluates the predicate against the row it
 * has locked, so of N simultaneous submissions exactly one wins and exactly one
 * message goes out. The previous shape — read the timestamp, decide in
 * application memory, send, then stamp — could not give that guarantee: two
 * requests read the same null and both sent, and a send whose stamp then failed
 * made the next request send again.
 *
 * Order matters. The brochure URL is resolved BEFORE the claim, so a
 * configuration throw costs no claim and leaves the window open for the next
 * submission.
 *
 * If the send fails after a won claim, `canReleaseAutoReplyClaim` decides
 * whether the window re-opens: yes when nothing can have left this process, no
 * when the transport threw and the provider may already hold the message. The
 * release is itself guarded on `brochure_sent_at` still being our own stamp, so
 * it can never stomp a claim someone else has taken in the meantime.
 *
 * Nothing here throws into the caller — the lead is already saved, and the
 * visitor's 200 does not depend on any of it.
 */
async function runAutoReply(
  supabase: ReturnType<typeof createServiceRoleClient>,
  existing: ExistingLead,
  lead: ValidatedLead,
  now: Date,
  nowIso: string
): Promise<void> {
  try {
    const brochureUrl = buildBrochureUrl();

    const claimed = await claimAutoReplyWindow(
      supabase,
      existing.id,
      nowIso,
      autoReplyClaimCutoff(now)
    );

    if (!claimed) {
      // Another submission owns this 24h window, or the claim itself failed.
      // Skip silently — a refused claim is the dedup working, not an error.
      return;
    }

    const result = await sendLeadAutoReply({
      to: lead.email,
      firstName: lead.firstName,
      brochureUrl,
    });

    if (!canReleaseAutoReplyClaim(result)) {
      return;
    }

    // Restore what the row held before we claimed it. That value is null or an
    // already-expired timestamp — either way the row becomes claimable again.
    const { error: releaseError } = await supabase
      .from('pasantias_leads')
      .update({ brochure_sent_at: existing.brochure_sent_at })
      .eq('id', existing.id)
      .eq('brochure_sent_at', nowIso);

    if (releaseError) {
      console.error(`[${LOG_PREFIX}] auto-reply claim release failed:`, releaseError);
    }
  } catch (autoReplyError) {
    console.error(`[${LOG_PREFIX}] auto-reply step failed:`, autoReplyError);
  }
}

/* ---------------------------------------------------- January (B002b) path */

const SUBMIT_PROGRAM_INTEREST_RPC = 'pasantias_submit_program_interest';
const CLAIM_PROGRAM_REPLY_RPC = 'pasantias_claim_program_reply';
const SETTLE_PROGRAM_REPLY_RPC = 'pasantias_settle_program_reply';

/**
 * PostgREST errors meaning the January objects are not deployed: no matching
 * function signature (`PGRST202`), or the function/table missing underneath.
 * Same answer as the October path's missing table.
 */
const PROGRAM_RPC_UNAVAILABLE_CODES = new Set(['PGRST202', '42883', '42P01']);

/** One row of `pasantias_submit_program_interest`. */
interface ProgramSubmission {
  lead_id: string;
  interest_id: string;
  lead_created: boolean;
  interest_created: boolean;
}

/** One row of `pasantias_claim_program_reply`. */
interface ProgramReplyClaim {
  claimed: boolean;
  claim_token: string | null;
  claimed_at: string | null;
}

/** A set-returning RPC answers with an array; take its single row. */
function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as T | null;
}

/**
 * The submit RPC's body. PostgREST resolves a function by its argument NAMES,
 * and the accepted signature has no defaults, so all eighteen keys are always
 * sent — optional values as `null`. A missing key is not "use the default", it
 * is PGRST202.
 *
 * The values are `validateLeadSubmission` output, which the SQL re-validates
 * with the same caps and patterns; it is the second guard, not the first.
 * Processing consent is `true` because validation refused every other value;
 * the function refuses anything else again. The notice versions are the
 * server's, never the caller's (D-12).
 */
function programSubmissionArgs(lead: ValidatedLead, program: JanuaryProgramId) {
  return {
    p_cohort: lead.cohort,
    p_program: program,
    p_first_name: lead.firstName,
    p_last_name: lead.lastName,
    p_email: lead.email,
    p_institution: lead.institution,
    p_phone: lead.phone,
    p_role_title: lead.roleTitle,
    p_num_people: lead.numPeople,
    p_message: lead.message,
    p_source_path: lead.sourcePath,
    p_utm_source: lead.utmSource,
    p_utm_medium: lead.utmMedium,
    p_utm_campaign: lead.utmCampaign,
    p_processing_consent: true,
    p_consent_notice_version: PRIVACY_NOTICE_VERSION,
    p_marketing_opt_in: lead.marketingOptIn,
    p_marketing_notice_version: lead.marketingOptIn ? PRIVACY_NOTICE_VERSION : null,
  };
}

/**
 * The January acknowledgement for the ONE interest this request submitted,
 * deduped by that interest's own claim.
 *
 * The claim is an atomic conditional UPDATE inside the RPC: of N simultaneous
 * submissions for the same contact AND program exactly one wins a 24 h window.
 * The other program of the same contact has its own interest row and its own
 * window. Only the winner sends, and it settles exactly the claim it holds,
 * identified by the token the claim returned:
 *
 * - provider accepted → `provider_accepted` (not a delivery stamp);
 * - known not sent (`not_configured`, `rejected`) → `not_sent`, which restores
 *   the pre-claim value so the next submission can try again;
 * - anything else, a throw included → `ambiguous`: the window is kept.
 *
 * A settle answered `false` means the token is no longer the open one (this
 * request's claim expired and someone else's replaced it); the RPC has changed
 * nothing, and neither does this. A settle that errors leaves the claim open,
 * which still suppresses for its 24 h — the conservative side.
 *
 * Nothing here throws into the caller, and nothing here reads or writes
 * `pasantias_leads` — `brochure_sent_at` stays October's.
 */
async function runProgramAutoReply(
  supabase: ReturnType<typeof createServiceRoleClient>,
  interestId: string,
  lead: ValidatedLead,
  program: JanuaryProgramId
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc(CLAIM_PROGRAM_REPLY_RPC, {
      p_interest_id: interestId,
    });

    if (error) {
      console.error(`[${LOG_PREFIX}] program reply claim failed:`, { code: error.code });
      return;
    }

    const claim = firstRow<ProgramReplyClaim>(data);
    if (!claim?.claimed || !claim.claim_token) {
      // This interest's window is held. The dedup working, not an error.
      return;
    }

    let result: LeadEmailResult;
    try {
      result = await sendLeadProgramAutoReply({
        to: lead.email,
        firstName: lead.firstName,
        program,
      });
    } catch (sendError) {
      console.error(`[${LOG_PREFIX}] program auto-reply threw:`, sendError);
      result = { sent: false, error: 'Error inesperado', failure: 'unknown' };
    }

    const { data: settled, error: settleError } = await supabase.rpc(SETTLE_PROGRAM_REPLY_RPC, {
      p_interest_id: interestId,
      p_claim_token: claim.claim_token,
      p_outcome: programReplyOutcome(result),
    });

    if (settleError) {
      console.error(`[${LOG_PREFIX}] program reply settle failed:`, { code: settleError.code });
    } else if (settled !== true) {
      console.error(`[${LOG_PREFIX}] program reply settle refused: claim no longer held`);
    }
  } catch (autoReplyError) {
    console.error(`[${LOG_PREFIX}] program auto-reply step failed:`, autoReplyError);
  }
}

/**
 * A January submission: exactly one program interest, exactly one atomic RPC.
 *
 * There is no list form and no second write: either the contact and this
 * interest are both stored or neither is, and the request answers accordingly.
 * Interest in the other program is another submission with the same address,
 * which lands on the same contact.
 *
 * Anti-enumeration holds as on the October path: `lead_created` and
 * `interest_created` never reach the response, so a first submission, a repeat
 * and a second program all return the identical `200 {success:true}`. The body
 * says nothing about mail either — success means stored, not mailed.
 */
async function handleProgramSubmission(
  supabase: ReturnType<typeof createServiceRoleClient>,
  lead: ValidatedLead,
  program: JanuaryProgramId,
  res: NextApiResponse
) {
  const { data, error } = await supabase.rpc(
    SUBMIT_PROGRAM_INTEREST_RPC,
    programSubmissionArgs(lead, program)
  );

  if (error) {
    if (PROGRAM_RPC_UNAVAILABLE_CODES.has(error.code)) {
      return res.status(503).json({ error: 'Formulario temporalmente no disponible' });
    }
    if (error.code === '22023') {
      // The SQL refused a value `validateLeadSubmission` accepted — the two
      // validators drifted. Nothing was written. The reason names a field,
      // never a value, so it is safe to log.
      console.error(`[${LOG_PREFIX}] program submission refused:`, { message: error.message });
      return res.status(400).json({ error: 'Revisa los datos del formulario.' });
    }
    console.error(`[${LOG_PREFIX}] program submission failed:`, { code: error.code });
    return res.status(500).json({ error: 'Error al guardar la solicitud' });
  }

  const submission = firstRow<ProgramSubmission>(data);
  if (!submission?.interest_id) {
    // Committed or not, there is no interest to claim a reply for. Repeating
    // the submission is safe (the RPC is idempotent), so say it failed.
    console.error(`[${LOG_PREFIX}] program submission returned no row`);
    return res.status(500).json({ error: 'Error al guardar la solicitud' });
  }

  // Best-effort from here: the interest is stored.
  await runProgramAutoReply(supabase, submission.interest_id, lead, program);

  try {
    await sendLeadNotification({
      lead: toEmailPayload(lead),
      isNewLead: submission.lead_created === true,
    });
  } catch (notificationError) {
    console.error(`[${LOG_PREFIX}] notification failed:`, notificationError);
  }

  return res.status(200).json({ success: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await leadRateLimit(req, res);
  if (!allowed) {
    return; // 429 already sent by the limiter
  }

  try {
    const body = (req.body ?? {}) as LeadSubmissionBody;

    // Honeypot: answer exactly as a real submission would, store nothing.
    if (normalizeText(body.website).length > 0) {
      return res.status(200).json({ success: true });
    }

    const validation = validateLeadSubmission(body);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'Revisa los datos del formulario.',
        fields: validation.errors,
      });
    }

    const lead = validation.value;
    const supabase = createServiceRoleClient();

    // January: one program, one atomic RPC. Validation sets `program` exactly
    // for the January cohort, so the October path below is unchanged.
    if (lead.program) {
      return await handleProgramSubmission(supabase, lead, lead.program, res);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const { data: found, error: existingError } = await supabase
      .from('pasantias_leads')
      .select(EXISTING_COLUMNS)
      .eq('email_normalized', lead.emailNormalized)
      .eq('cohort', lead.cohort)
      .maybeSingle();

    if (existingError) {
      if (existingError.code === '42P01') {
        return res.status(503).json({ error: 'Formulario temporalmente no disponible' });
      }
      console.error(`[${LOG_PREFIX}] existing lookup failed:`, existingError);
      return res.status(500).json({ error: 'Error al procesar la solicitud' });
    }

    let existing = (found ?? null) as ExistingLead | null;
    let isNewLead = existing === null;

    if (!existing) {
      const { data: inserted, error: insertError } = await supabase
        .from('pasantias_leads')
        .insert({
          cohort: lead.cohort,
          status: 'new',
          source_path: lead.sourcePath,
          ...contactColumns(lead, nowIso),
          ...marketingColumns(lead, 'insert', nowIso),
        })
        .select(EXISTING_COLUMNS)
        .maybeSingle();

      if (insertError) {
        // A concurrent submission won the unique index on
        // (email_normalized, cohort). That is the duplicate path, not an
        // error: re-read the row and update it exactly as if we had seen it.
        if (insertError.code !== '23505') {
          console.error(`[${LOG_PREFIX}] insert failed:`, insertError);
          return res.status(500).json({ error: 'Error al guardar la solicitud' });
        }

        const { data: raced, error: racedError } = await supabase
          .from('pasantias_leads')
          .select(EXISTING_COLUMNS)
          .eq('email_normalized', lead.emailNormalized)
          .eq('cohort', lead.cohort)
          .maybeSingle();

        if (racedError || !raced) {
          console.error(`[${LOG_PREFIX}] duplicate re-read failed:`, racedError);
          return res.status(500).json({ error: 'Error al guardar la solicitud' });
        }

        existing = raced as ExistingLead;
        isNewLead = false;
      } else {
        existing = (inserted ?? null) as ExistingLead | null;
      }
    }

    if (!isNewLead && existing) {
      // D-03 at the API boundary: a dismissed lead re-opens when the person
      // asks again, and only because `dismissed → new` is a legal edge. Every
      // other status keeps the one it has — the column is left unwritten.
      const reopen = canTransitionLead(existing.status, 'new');

      const { error: updateError } = await supabase
        .from('pasantias_leads')
        .update({
          ...contactColumns(lead, nowIso),
          ...marketingColumns(lead, 'update', nowIso),
          ...sourcePathColumns(lead),
          ...(reopen ? { status: 'new' } : {}),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error(`[${LOG_PREFIX}] update failed:`, updateError);
        return res.status(500).json({ error: 'Error al guardar la solicitud' });
      }
    }

    // Everything below is best-effort: the lead is already persisted, so no
    // mail problem may change the response the visitor sees.
    //
    // The two messages are INDEPENDENT and get one try/catch each. Sharing one
    // meant that a throw while preparing the auto-reply — `buildBrochureUrl`
    // throws when a production origin is missing or invalid — also skipped the
    // internal notification, silently costing FNE the lead alert over a problem
    // that has nothing to do with it.
    if (existing) {
      await runAutoReply(supabase, existing, lead, now, nowIso);
    }

    try {
      await sendLeadNotification({ lead: toEmailPayload(lead), isNewLead });
    } catch (notificationError) {
      console.error(`[${LOG_PREFIX}] notification failed:`, notificationError);
    }

    // Identical for the new and the existing path (anti-enumeration).
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(`[${LOG_PREFIX}] unexpected error:`, error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
