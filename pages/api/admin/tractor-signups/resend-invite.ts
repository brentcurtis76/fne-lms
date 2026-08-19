import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createServiceRoleClient } from '../../../../lib/api-auth';
import { rateLimit, RATE_LIMITS } from '../../../../lib/rateLimit';
import { getAppBaseUrl } from '../../../../lib/utils/app-url';
import {
  deliveryMessage,
  sendAccessGrantedEmail,
  sendPasswordSetupEmail,
  type DeliveryResult,
} from '../../../../lib/email/invitations';
import {
  findRecentSecurityAudit,
  recordSecurityAudit,
} from '../../../../lib/security/audit';
import {
  SIGNUP_SOURCE_INVITE_BODY,
  isKnownSignupSource,
  isValidEmail,
  normalizeEmail,
} from '../../../../lib/signups';

/**
 * Resend an invitation (S7).
 *
 * THE PROBLEM. Granting access to a NEW signup does four things: create the auth
 * user, upsert the profile, mark the signup `granted`, and e-mail a recovery
 * link so the person can set their first password. The last step is the only one
 * that can fail without failing the request — and when it did, the signup was
 * already `granted`, so:
 *
 *   - the admin panel refused to grant it again ("registro ya otorgado"),
 *   - the account existed with a random 16-character password nobody knows,
 *   - and there was no operator action anywhere in the product that could
 *     produce another link.
 *
 * The person was stranded permanently. In production this is not hypothetical:
 * `RESEND_API_KEY` is not set in the Vercel Production environment, so the send
 * has been returning `not_configured` for every grant.
 *
 * DESIGN NOTES worth knowing before changing this:
 *
 *   FRESH LINK, NEVER A REUSED ONE. A recovery link is one-time and expiring;
 *   re-sending the original would re-send something already dead. Each resend
 *   calls `generateLink` again. The previous link stops working, which is the
 *   correct behaviour for a credential-bearing URL.
 *
 *   WHICH E-MAIL is derived from state, not stored: an account still carrying
 *   `must_change_password` has never set a password and needs the recovery
 *   link; one that has cleared it has a working password and gets the
 *   access-granted notice with the login URL. No schema change, and it cannot
 *   go stale.
 *
 *   FAIL CLOSED ON AUDIT. Unlike every other operation in this remediation, this
 *   one refuses to proceed when the audit trail is unavailable — because here
 *   the audit row IS the rate-limit ledger. An unreadable trail must not become
 *   an unlimited allowance to mail recovery links at an address. Concretely:
 *   the ledger is READ first (an error → 503), then a `requested` row is written
 *   BEFORE the send (a failed write → 503, nothing sent), then the outcome row
 *   is written after. Two rows per resend, both true at the moment they were
 *   written.
 *
 *   THE LINK NEVER LEAVES. It is passed to the mailer and referenced nowhere
 *   else: not in the response, not in a log line, not in the audit metadata
 *   (where the storage-layer CHECK would refuse it anyway).
 */

/** Per-target cooldown. Long enough that "click it again" cannot mail-bomb. */
export const RESEND_COOLDOWN_MINUTES = 10;

/** Per-IP gate, on top of the per-target one. */
const rateLimitCheck = rateLimit(RATE_LIMITS.expensive, 'admin-resend-invite');

type SignupRow = {
  id: string;
  source: string | null;
  first_name: string;
  last_name: string;
  email: string;
  email_normalized: string | null;
  status: string;
  linked_user_id: string | null;
  school_id: number | string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  const { isAdmin, user: adminUser, error: authError } = await checkIsAdmin(req, res);
  if (authError) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin || !adminUser?.id) {
    return res.status(403).json({ error: 'Solo administradores pueden reenviar invitaciones' });
  }

  const signupId = typeof req.body?.signupId === 'string' ? req.body.signupId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signupId)) {
    return res.status(400).json({ error: 'signupId inválido' });
  }

  const supabase = createServiceRoleClient();

  try {
    const { data: signup, error: signupError } = await supabase
      .from('tractor_signups')
      .select('id, source, first_name, last_name, email, email_normalized, status, linked_user_id, school_id')
      .eq('id', signupId)
      .maybeSingle();

    if (signupError) {
      if (signupError.code === '42P01') {
        return res.status(503).json({ error: 'La tabla tractor_signups no existe' });
      }
      throw signupError;
    }

    if (!signup || !isKnownSignupSource(signup.source)) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const signupRow = signup as SignupRow;

    // Only a GRANTED signup has an account to invite into. A pending one has
    // no user yet — the answer there is "grant it", not "resend".
    if (signupRow.status !== 'granted' || !signupRow.linked_user_id) {
      return res.status(400).json({
        error:
          'Solo se puede reenviar la invitación de un registro con acceso ya otorgado. ' +
          'Otorga el acceso primero.',
        code: 'SIGNUP_NOT_GRANTED',
      });
    }

    const email = normalizeEmail(signupRow.email_normalized || signupRow.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'El registro no tiene un correo válido' });
    }

    const targetUserId = signupRow.linked_user_id;

    // --- Rate limit, read from the audit ledger (fail closed) ----------------
    const since = new Date(Date.now() - RESEND_COOLDOWN_MINUTES * 60 * 1000).toISOString();
    const recent = await findRecentSecurityAudit(supabase, {
      action: 'invitation_resent',
      targetUserId,
      since,
      // ANY attempt counts, successful or not. A provider rejection that reset
      // the counter would turn a retry loop into a mail-bomb.
      outcomes: ['success', 'failure', 'partial_failure'],
    });

    if (recent.error) {
      // Cannot tell whether a resend just happened → refuse. This is the one
      // fail-closed audit decision in the remediation; see the header.
      return res.status(503).json({
        error:
          'No pudimos verificar los envíos recientes. Inténtalo nuevamente en unos momentos.',
        code: 'AUDIT_UNAVAILABLE',
      });
    }

    if (recent.found) {
      return res.status(429).json({
        error: `Ya se envió una invitación hace poco. Espera ${RESEND_COOLDOWN_MINUTES} minutos antes de reenviar.`,
        code: 'RESEND_TOO_SOON',
        retryAfterMinutes: RESEND_COOLDOWN_MINUTES,
      });
    }

    // --- Reserve the slot BEFORE sending -------------------------------------
    // Written as a failure because, at this instant, that is what it is. If the
    // process dies between here and the send, the trail says an attempt was made
    // and did not succeed, which is true and errs toward the safe side.
    const reservation = await recordSecurityAudit(supabase, {
      action: 'invitation_resent',
      outcome: 'failure',
      actorUserId: adminUser.id,
      actorRole: 'admin',
      targetUserId,
      metadata: { stage: 'requested', signup_id: signupId },
    });

    if (!reservation.recorded) {
      return res.status(503).json({
        error:
          'No pudimos registrar el reenvío, así que no se envió nada. Inténtalo nuevamente.',
        code: 'AUDIT_UNAVAILABLE',
      });
    }

    // --- Which e-mail? Derived from state, never stored -----------------------
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, must_change_password')
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const firstName = profile?.first_name || signupRow.first_name;
    const needsPasswordSetup = profile?.must_change_password === true;
    const bodyLine = SIGNUP_SOURCE_INVITE_BODY[signupRow.source];

    let delivery: DeliveryResult;

    if (needsPasswordSetup) {
      // A FRESH link. The original is one-time and expiring; resending it would
      // resend something already dead.
      const redirectTo = `${getAppBaseUrl(req)}/reset-password`;
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });

      const actionLink = linkData?.properties?.action_link;
      if (linkError || !actionLink) {
        await recordSecurityAudit(supabase, {
          action: 'invitation_resent',
          outcome: 'failure',
          actorUserId: adminUser.id,
          actorRole: 'admin',
          targetUserId,
          metadata: { stage: 'generate_link', signup_id: signupId },
        });
        return res.status(502).json({
          error: 'No se pudo generar un enlace de recuperación nuevo. Inténtalo nuevamente.',
          code: 'LINK_GENERATION_FAILED',
        });
      }

      delivery = await sendPasswordSetupEmail({
        to: email,
        firstName,
        actionLink,
        bodyLine,
      });
    } else {
      // The account already has a working password. Sending a recovery link
      // here would invalidate it for no reason.
      delivery = await sendAccessGrantedEmail({
        to: email,
        firstName,
        loginUrl: `${getAppBaseUrl(req)}/login`,
        bodyLine,
      });
    }

    await recordSecurityAudit(supabase, {
      action: 'invitation_resent',
      outcome: delivery.sent ? 'success' : 'failure',
      actorUserId: adminUser.id,
      actorRole: 'admin',
      targetUserId,
      metadata: {
        stage: 'delivered',
        signup_id: signupId,
        kind: needsPasswordSetup ? 'password_setup' : 'access_granted',
        email_failure_reason: delivery.reason ?? null,
      },
    });

    // Accurate status, either way. A failed send is a 200 with `sent: false`
    // rather than an error, because the reservation and the audit DID happen
    // and the administrator's next step (fix the mail configuration, then
    // retry after the cooldown) depends on knowing which part failed.
    return res.status(200).json({
      success: delivery.sent,
      kind: needsPasswordSetup ? 'password_setup' : 'access_granted',
      // Never the link.
      email: { sent: delivery.sent, reason: delivery.reason ?? null },
      message: deliveryMessage(delivery),
      cooldownMinutes: RESEND_COOLDOWN_MINUTES,
    });
  } catch (error: any) {
    console.error('[tractor-signups resend-invite] unexpected error:', error?.message ?? error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
