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
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit } from '../../../lib/rateLimit';
import { normalizeText } from '../../../lib/signups';
import { PRIVACY_NOTICE_VERSION } from '../../../lib/legal/privacy-notice';
import {
  canTransitionLead,
  validateLeadSubmission,
  type LeadSubmissionBody,
  type ValidatedLead,
} from '../../../lib/pasantias/leads';
import {
  autoReplyClaimCutoff,
  buildBrochureUrl,
  canReleaseAutoReplyClaim,
  sendLeadAutoReply,
  sendLeadNotification,
  type LeadEmailPayload,
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
