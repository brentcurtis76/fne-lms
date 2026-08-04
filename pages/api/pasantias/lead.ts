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
  buildBrochureUrl,
  sendLeadAutoReply,
  sendLeadNotification,
  shouldSendAutoReply,
  type LeadEmailPayload,
} from '../../../lib/pasantias/emails';

const LOG_PREFIX = 'pasantias-lead';

// Best-effort dampening only (D-04) — the durable controls are structural.
// Matches the other public form endpoints (contact, tractor-signup).
const leadRateLimit = rateLimit({ limit: 5, windowMs: 60 * 1000 }, 'pasantias-lead');

/** The columns the dedup read needs, and nothing more. */
const EXISTING_COLUMNS = 'id, status, marketing_opt_in, brochure_sent_at';

interface ExistingLead {
  id: string;
  status: string | null;
  marketing_opt_in: boolean | null;
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
 * Opting in refreshes the evidence. NOT opting in never clears an opt-in that
 * is already on file — withdrawing consent is unsubscribe's job, and a form
 * submitted with the box unchecked is not a withdrawal. The returned object is
 * empty in that case, which leaves all three columns untouched.
 */
function marketingColumns(
  lead: ValidatedLead,
  existing: ExistingLead | null,
  nowIso: string
): Record<string, unknown> {
  if (lead.marketingOptIn) {
    return {
      marketing_opt_in: true,
      marketing_opt_in_at: nowIso,
      marketing_notice_version: PRIVACY_NOTICE_VERSION,
    };
  }

  if (existing?.marketing_opt_in) {
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
          ...marketingColumns(lead, null, nowIso),
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
          ...marketingColumns(lead, existing, nowIso),
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
    try {
      if (existing && shouldSendAutoReply(existing.brochure_sent_at, now)) {
        const autoReply = await sendLeadAutoReply({
          to: lead.email,
          firstName: lead.firstName,
          brochureUrl: buildBrochureUrl(),
        });

        if (autoReply.sent) {
          const { error: stampError } = await supabase
            .from('pasantias_leads')
            .update({ brochure_sent_at: nowIso })
            .eq('id', existing.id);

          if (stampError) {
            console.error(`[${LOG_PREFIX}] brochure_sent_at stamp failed:`, stampError);
          }
        }
      }

      await sendLeadNotification({ lead: toEmailPayload(lead), isNewLead });
    } catch (emailError) {
      console.error(`[${LOG_PREFIX}] notification step failed:`, emailError);
    }

    // Identical for the new and the existing path (anti-enumeration).
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(`[${LOG_PREFIX}] unexpected error:`, error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
