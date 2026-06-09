// Telegram webhook for the expense receipt bot.
//
// One-time setup (per bot, dev and prod):
//   1. @BotFather → /newbot → token → TELEGRAM_BOT_TOKEN
//   2. openssl rand -hex 32 → TELEGRAM_WEBHOOK_SECRET
//   3. curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//        -d "url=https://<host>/api/bots/telegram" \
//        -d "secret_token=<SECRET>" \
//        -d 'allowed_updates=["message","callback_query"]'
//   4. curl "https://api.telegram.org/bot<TOKEN>/setMyCommands" -H 'Content-Type: application/json' -d '{
//        "commands": [
//          {"command":"start","description":"Vincular cuenta y empezar"},
//          {"command":"reportes","description":"Ver tus reportes y totales"},
//          {"command":"enviar","description":"Enviar un reporte a aprobación"},
//          {"command":"cancelar","description":"Cancelar la operación pendiente"},
//          {"command":"ayuda","description":"Cómo usar el bot"}
//        ]}'
//
// Processing is inline (no fire-and-forget): Pages Router lambdas may freeze
// after res.end(), and Telegram redeliveries are absorbed by the
// bot_processed_updates claim, so a slow extraction is safe.

import type { NextApiRequest, NextApiResponse } from 'next';
import { timingSafeEqual } from 'crypto';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { TelegramAdapter } from '../../../lib/bots/telegram-adapter';
import { BotStore } from '../../../lib/bots/store';
import { ExpenseService } from '../../../lib/bots/expense-service';
import { extractReceipt } from '../../../lib/bots/receipt-extraction';
import { handleInbound } from '../../../lib/bots/engine';

function secretMatches(header: string | string[] | undefined): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!secretMatches(req.headers['x-telegram-bot-api-secret-token'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const adapter = new TelegramAdapter();
  const message = adapter.parseUpdate(req.body);
  if (!message) {
    return res.status(200).json({ ok: true });
  }

  try {
    const supabase = createServiceRoleClient();
    const store = new BotStore(supabase);

    // Atomic idempotency claim BEFORE any side effect: a Telegram redelivery
    // (e.g. retry during a slow Claude call) must not create duplicate cards.
    const claimed = await store.claimUpdate(message.platform, message.updateId);
    if (!claimed) {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    await handleInbound(
      { adapter, store, expenses: new ExpenseService(supabase), extract: extractReceipt },
      message
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    // Always 200 once parsed — a 5xx would make Telegram redeliver a poison
    // update. The user already got (or will get) a friendly error message.
    console.error('[Bot] webhook processing failed:', error);
    return res.status(200).json({ ok: true });
  }
}
