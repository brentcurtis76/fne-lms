/**
 * Resend delivery evidence for password-recovery messages.
 *
 * Provider API acceptance is not delivery. Only a signature-verified
 * `email.delivered` or `email.bounced` webhook may advance the durable outbox
 * and write the corresponding audit outcome. The raw body is verified before
 * parsing, and no recipient, subject, or message body is logged or persisted.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Webhook } from 'svix';
import { createServiceRoleClient } from '../../../lib/api-auth';

export const config = { api: { bodyParser: false } };
export const MAX_RESEND_WEBHOOK_BYTES = 256 * 1024;

const TOO_LARGE = Symbol('too_large');

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readRawBody(
  req: NextApiRequest,
  limit: number
): Promise<Buffer | typeof TOO_LARGE> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const cleanup = () => {
      req.off?.('data', onData);
      req.off?.('end', onEnd);
      req.off?.('error', onError);
    };
    const onData = (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
      size += buffer.length;
      if (size > limit) {
        settled = true;
        cleanup();
        req.pause?.();
        resolve(TOO_LARGE);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/** Flush the 413 before tearing down an upload whose request body is unfinished. */
function discardRequestAfterResponse(req: NextApiRequest, res: NextApiResponse): void {
  let discarded = false;
  const discard = () => {
    if (discarded) return;
    discarded = true;
    req.destroy?.();
  };

  if (typeof res.on !== 'function') {
    discard();
    return;
  }
  res.on('finish', discard);
  res.on('close', discard);
}

interface ResendEvent {
  type?: unknown;
  data?: { email_id?: unknown };
}

/**
 * Persist one signature-verified event durably, whatever the ordering.
 *
 *   'recorded' — a matched outbox row changed state (audit row written in SQL)
 *   'pending'  — no outbox row carries this provider id YET; the evidence is
 *                stored and reconciled transactionally when acceptance commits
 *   'ignored'  — not a delivery/bounce event, or precedence refused the
 *                transition (idempotent duplicate; delivered after bounce)
 *   'failed'   — the DATABASE could not take the evidence. The route answers
 *                500 so the provider retries: a webhook we could not persist
 *                must never be acknowledged.
 */
export async function applyVerifiedResendEvent(
  admin: Pick<SupabaseClient, 'rpc'>,
  event: ResendEvent
): Promise<'recorded' | 'pending' | 'ignored' | 'failed'> {
  const outcome =
    event.type === 'email.delivered'
      ? 'delivered'
      : event.type === 'email.bounced'
        ? 'bounced'
        : null;
  const emailId = event.data?.email_id;
  if (!outcome || typeof emailId !== 'string' || emailId.length === 0) return 'ignored';

  try {
    const { data, error } = await admin.rpc('record_password_recovery_delivery', {
      p_provider_message_id: emailId,
      p_outcome: outcome,
    });
    if (error) {
      console.error('[resend-webhook] durable delivery transition failed', {
        code: (error as { code?: string }).code ?? null,
      });
      return 'failed';
    }
    if (data === 'applied') return 'recorded';
    if (data === 'pending') return 'pending';
    return 'ignored';
  } catch {
    console.error('[resend-webhook] durable delivery transition threw');
    return 'failed';
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return res.status(404).json({ error: 'No encontrado' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const rawBody = await readRawBody(req, MAX_RESEND_WEBHOOK_BYTES);
    if (rawBody === TOO_LARGE) {
      res.setHeader('Connection', 'close');
      discardRequestAfterResponse(req, res);
      return res.status(413).json({ error: 'Solicitud demasiado grande' });
    }

    let event: ResendEvent;
    try {
      event = new Webhook(secret).verify(rawBody, {
        'svix-id': header(req.headers['svix-id']) ?? '',
        'svix-timestamp': header(req.headers['svix-timestamp']) ?? '',
        'svix-signature': header(req.headers['svix-signature']) ?? '',
      }) as ResendEvent;
    } catch {
      console.warn('[resend-webhook] signature rejected');
      return res.status(401).json({ error: 'No autorizado' });
    }

    const result = await applyVerifiedResendEvent(createServiceRoleClient(), event);
    if (result === 'failed') return res.status(500).json({ error: 'Error interno del servidor' });
    return res.status(200).json({ ok: true });
  } catch {
    console.error('[resend-webhook] request failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
