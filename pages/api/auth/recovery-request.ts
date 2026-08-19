import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import { generateRecoveryLink, isRecoveryLinkRefusal } from '../../../lib/auth/recovery-link';
import { sendPasswordRecoveryEmail, linkGenerationFailed } from '../../../lib/email/invitations';
import { getAppBaseUrl } from '../../../lib/utils/app-url';
import { recordSecurityAudit } from '../../../lib/security/audit';

/**
 * "Olvidé mi contraseña" — the self-service recovery REQUEST.
 *
 * WHY THIS ENDPOINT EXISTS. `/login` used to call
 * `supabase.auth.resetPasswordForEmail()` from the browser, which sends
 * SUPABASE'S template with SUPABASE'S link. Three problems followed:
 *
 *   1. The landing format depended on a dashboard setting nobody on this project
 *      chose. It arrived as an implicit `#access_token=` fragment or a PKCE
 *      `?code=` — and neither of those can be turned into server-verifiable,
 *      purpose-bound, one-time proof, which is what the recovery ceremony now
 *      requires. The invitation path had already moved to `?token_hash=`; the
 *      self-service path had not, so the two halves of the same page were being
 *      asked to support two different security stories.
 *   2. The mandatory e2e could not read the message that was actually sent, so
 *      its recovery stage rebuilt an equivalent link with the product's own
 *      helper. Same code, same format — a different message.
 *   3. Anti-enumeration was left to the provider, and the browser then leaked the
 *      difference anyway by having the provider's error in hand.
 *
 * Now every recovery link this platform sends — invitation, resend and
 * self-service — is minted by `lib/auth/recovery-link.ts` and delivered by
 * `lib/email/invitations.ts`, in one format, from the server.
 *
 * ANTI-ENUMERATION. The response is byte-identical in every outcome: unknown
 * address, known address, provider down, link generation failed. It carries no
 * status field a caller could differentiate on, and the timing difference between
 * branches is not something this endpoint tries to hide — that is stated as a
 * limitation rather than papered over. Operators get the detail in the log and in
 * the audit trail.
 *
 * NOTHING SENSITIVE LEAVES. The recovery URL is passed straight into the mailer
 * and is never logged, never returned and never audited. The audit row carries the
 * account id when there is one, and the address never.
 */

// Auth-level traffic: 10 requests a minute per IP.
const rateLimitCheck = rateLimit(RATE_LIMITS.auth, 'recovery-request');

/** Identical on every path. es-CL. */
export const RECOVERY_REQUEST_ACKNOWLEDGEMENT =
  'Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. ' +
  'Revisa tu bandeja de entrada y la carpeta de spam.';

function acknowledge(res: NextApiResponse) {
  return res.status(200).json({ message: RECOVERY_REQUEST_ACKNOWLEDGEMENT });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  const rawEmail = (req.body ?? {})?.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Still the same answer: a malformed address must not be distinguishable
    // from an address with no account.
    return acknowledge(res);
  }

  const admin = createServiceRoleClient();

  try {
    // The profile lookup is for the greeting and for the audit row's target id.
    // Its ABSENCE is not reported: the acknowledgement is the same either way.
    const { data: profile } = await admin
      .from('profiles')
      .select('id, first_name')
      .eq('email', email)
      .maybeSingle();

    const link = await generateRecoveryLink(admin, {
      email,
      baseUrl: getAppBaseUrl(req),
    });

    if (isRecoveryLinkRefusal(link)) {
      // Covers both "no such account" (generateLink refuses) and a real provider
      // failure. The two are not distinguished to the caller on purpose.
      const outcome = linkGenerationFailed();
      console.warn('[recovery-request] no recovery link was minted', {
        toDomain: email.split('@')[1] ?? 'unknown',
        reason: link.reason,
        status: outcome.status,
      });
      if (profile?.id) {
        await recordSecurityAudit(admin, {
          action: 'password_recovery_requested',
          outcome: 'failure',
          actorUserId: profile.id,
          targetUserId: profile.id,
          metadata: { stage: 'generate_link', delivery_status: outcome.status },
        });
      }
      return acknowledge(res);
    }

    const delivery = await sendPasswordRecoveryEmail({
      to: email,
      firstName: profile?.first_name || 'Hola',
      recoveryUrl: link.url,
    });

    if (profile?.id) {
      await recordSecurityAudit(admin, {
        action: 'password_recovery_requested',
        outcome: delivery.sent ? 'success' : 'failure',
        actorUserId: profile.id,
        targetUserId: profile.id,
        // `provider_accepted`, not `delivered`. See lib/email/invitations.ts.
        metadata: {
          delivery_status: delivery.status,
          provider_message_id: delivery.providerMessageId ?? null,
        },
      });
    }

    return acknowledge(res);
  } catch (error: any) {
    console.error('[recovery-request] unexpected error:', error?.message ?? error);
    // Even an internal failure answers identically. An error page here would be
    // an enumeration oracle for whatever made it fail.
    return acknowledge(res);
  }
}
