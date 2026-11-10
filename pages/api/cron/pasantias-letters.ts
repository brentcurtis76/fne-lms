import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { todayInChile } from '../../../lib/pasantias/panel/client';
import { readLetterAssetsState } from '../../../lib/pasantias/panel/documents';
import { sendLetter } from '../../../lib/pasantias/panel/letter-delivery';
import { loadPanel } from '../../../lib/pasantias/panel/server';
import { letterSendState } from '../../../lib/pasantias/panel/types';
import { getAppBaseUrl } from '../../../lib/utils/app-url';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

/**
 * Daily: emails each traveller's Carta de Invitación seven days before they
 * leave Santiago (the "Salida de SCL" date FNE enters in the panel).
 *
 * A letter goes out only when everything it needs exists — that date, the
 * traveller's email, Estimado/Estimada, the school's two letter lines and the
 * two letter images. Anyone missing something is skipped without a write; the
 * panel shows what is missing. A traveller who already left is never emailed.
 * A failed attempt is recorded and retried on the next run.
 *
 * At most `MAX_PER_RUN` letters per run, and the run stops starting new ones
 * after `TIME_BUDGET_MS`, so it always ends inside the function's time limit;
 * the rest go out on the next run.
 */
const MAX_PER_RUN = 60;
const TIME_BUDGET_MS = 40_000;

export const config = { maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isAllowedCronMethod(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  if (!authorizeCronRequest(req).ok) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const supabase = createServiceRoleClient();
    const [panel, assets] = await Promise.all([loadPanel(supabase), readLetterAssetsState(supabase)]);
    if (panel.ok === false || assets.ok === false) {
      console.error('[pasantias-letters] panel read failed');
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    const today = todayInChile();
    const detailsByRoster = new Map(panel.value.rosters.map((roster) => [roster.id, roster.details]));
    const due = panel.value.rows.filter((row) => {
      const details = detailsByRoster.get(row.rosterId);
      if (!details) return false;
      const state = letterSendState(row.participant.email, row.logistics, details, assets.value, today);
      return state.kind === 'scheduled' && state.on <= today;
    });

    const baseUrl = getAppBaseUrl(req);
    const started = Date.now();
    let sent = 0;
    let failed = 0;
    let attempted = 0;
    for (const row of due.slice(0, MAX_PER_RUN)) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      attempted += 1;
      const result = await sendLetter(supabase, row.participant.id, { actorId: null, force: false, baseUrl });
      if (result.status === 'sent') sent += 1;
      else if (result.status !== 'skipped') failed += 1;
    }
    // Counts only: no name, no address.
    return res.status(200).json({ ok: true, due: due.length, attempted, sent, failed });
  } catch {
    console.error('[pasantias-letters] run failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
