/**
 * «Ajustar horas descontadas» — the §11 admin override endpoint (Z7-4).
 *
 * POST applies an override (integer billable minutes, 0 = full waiver) or reverses
 * one (`reverses_override_id`). The route is auth → role check → validation → RPC,
 * per the repo pattern — but the SECURITY BOUNDARY is the RPC itself:
 * `public.apply_session_hour_override` derives its actor from `auth.uid()` inside
 * the function and aborts on NULL or non-admin, which is why it is called with the
 * ADMINISTRATOR'S OWN authenticated Supabase context and never the service client.
 * A webhook, job, or AI process has no session and structurally cannot reach it.
 *
 * `request_id` comes from the caller so a retry of the same intent is idempotent;
 * `payload_hash` is computed HERE from the canonical intent, so a replayed
 * `request_id` carrying different content is refused (409) rather than silently
 * applied — §11's tamper detection.
 */
import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createApiSupabaseClient } from '../../../../../lib/api-auth';

export const OVERRIDE_REASON_CATEGORIES = [
  'consultant_shortfall',
  'school_request',
  'technical_failure',
  'other',
] as const;

interface OverrideRequestBody {
  new_minutes?: unknown;
  reason?: unknown;
  reason_category?: unknown;
  request_id?: unknown;
  reverses_override_id?: unknown;
}

/** The canonical intent — what `payload_hash` protects against replay-tampering. */
export function overridePayloadHash(input: {
  sessionId: string;
  newMinutes: number | null;
  reason: string;
  reasonCategory: string;
  reversesOverrideId: string | null;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        session_id: input.sessionId,
        new_minutes: input.newMinutes,
        reason: input.reason,
        reason_category: input.reasonCategory,
        reverses_override_id: input.reversesOverrideId,
      })
    )
    .digest('hex');
}

/** The RPC's SQLSTATE taxonomy → HTTP. Anything unrecognised is a 500. */
const SQLSTATE_TO_HTTP: Record<string, number> = {
  P0400: 400,
  P0403: 403,
  P0404: 404,
  P0409: 409,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Route-level gate for a clean 403 — the RPC re-checks inside the database.
  const { isAdmin, user, error: authError } = await checkIsAdmin(req, res);
  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo un administrador puede ajustar horas descontadas' });
  }

  const sessionId = req.query.id;
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return res.status(400).json({ error: 'Identificador de sesión inválido' });
  }

  const body = (req.body ?? {}) as OverrideRequestBody;

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason === '') {
    return res.status(400).json({ error: 'El motivo del ajuste es obligatorio' });
  }

  const reasonCategory = typeof body.reason_category === 'string' ? body.reason_category : '';
  if (!(OVERRIDE_REASON_CATEGORIES as readonly string[]).includes(reasonCategory)) {
    return res.status(400).json({ error: 'Categoría de motivo inválida' });
  }

  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  if (requestId === '') {
    return res.status(400).json({ error: 'request_id es obligatorio' });
  }

  const reversesOverrideId =
    typeof body.reverses_override_id === 'string' && body.reverses_override_id.length > 0
      ? body.reverses_override_id
      : null;

  let newMinutes: number | null = null;
  if (reversesOverrideId === null) {
    // An APPLY: integer minutes, 0 permitted — §11's zero waiver ("Sesión eximida").
    if (
      typeof body.new_minutes !== 'number' ||
      !Number.isInteger(body.new_minutes) ||
      body.new_minutes < 0
    ) {
      return res
        .status(400)
        .json({ error: 'Los minutos ajustados deben ser un entero mayor o igual a 0' });
    }
    newMinutes = body.new_minutes;
  } else if (body.new_minutes !== undefined && body.new_minutes !== null) {
    // A reversal restores the reversed event's own previous value; a caller that
    // also supplies minutes is confused about which operation it is performing.
    return res
      .status(400)
      .json({ error: 'Una reversión no acepta minutos: restaura el valor anterior' });
  }

  const payloadHash = overridePayloadHash({
    sessionId,
    newMinutes,
    reason,
    reasonCategory,
    reversesOverrideId,
  });

  try {
    // The ADMIN'S OWN client: auth.uid() inside the function is this administrator.
    const supabase = await createApiSupabaseClient(req, res);
    const { data, error } = await supabase.rpc('apply_session_hour_override', {
      p_session_id: sessionId,
      p_new_minutes: newMinutes,
      p_reason: reason,
      p_reason_category: reasonCategory,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_reverses_override_id: reversesOverrideId,
    });

    if (error) {
      const status = SQLSTATE_TO_HTTP[error.code ?? ''] ?? 500;
      if (status === 500) {
        console.error('[hour-override] RPC failed:', error);
        return res.status(500).json({ error: 'Error interno' });
      }
      return res.status(status).json({ error: error.message });
    }

    return res.status(200).json({ data });
  } catch (error) {
    console.error('[hour-override] unexpected failure:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
}
