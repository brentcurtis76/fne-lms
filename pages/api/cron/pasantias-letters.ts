import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { todayInChile } from '../../../lib/pasantias/panel/client';
import { readLetterAssetsState } from '../../../lib/pasantias/panel/documents';
import { alertAdmins, sendLetter, type LetterAttention } from '../../../lib/pasantias/panel/letter-delivery';
import { loadPanel } from '../../../lib/pasantias/panel/server';
import { programById } from '../../../lib/pasantias/cohort-public';
import {
  LETTER_SEND_DAYS_BEFORE,
  LETTER_SEND_ERRORS,
  addDays,
  letterSendState,
} from '../../../lib/pasantias/panel/types';
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
 * Then FNE's global admins get ONE email listing every letter that should be
 * going out and has not: a send that failed in this run, or a traveller still
 * missing something. "Should be going out" is the seven days before the
 * traveller's "Salida de SCL"; for someone with no such date yet, the nine
 * days before their program starts. The email repeats daily until it is empty.
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
    const rosterById = new Map(panel.value.rosters.map((roster) => [roster.id, roster]));
    const stateOf = (row: (typeof panel.value.rows)[number]) => {
      const roster = rosterById.get(row.rosterId);
      return roster ? letterSendState(row.participant.email, row.logistics, roster.details, assets.value, today) : null;
    };
    const due = panel.value.rows.filter((row) => {
      const state = stateOf(row);
      return state !== null && state.kind === 'scheduled' && state.on <= today;
    });
    const attention: LetterAttention[] = [];
    const note = (row: (typeof panel.value.rows)[number], reason: string) => {
      attention.push({
        fullName: `${row.participant.firstNames} ${row.participant.lastNames}`,
        schoolName: rosterById.get(row.rosterId)?.schoolName ?? '',
        reason,
      });
    };
    // Travellers who lack something, once their letter should be going out.
    for (const row of panel.value.rows) {
      const state = stateOf(row);
      const roster = rosterById.get(row.rosterId);
      if (!state || !roster || state.kind !== 'blocked') continue;
      const departure = row.logistics.sclDepartureDate;
      const until = departure ?? programById(roster.program).startDate;
      const since = addDays(until, departure ? -LETTER_SEND_DAYS_BEFORE : -(LETTER_SEND_DAYS_BEFORE + 2));
      if (today >= since && today <= until) note(row, `falta ${state.missing.join('; ')}`);
    }

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
      else if (result.status !== 'skipped') {
        failed += 1;
        note(row, result.status === 'failed' ? LETTER_SEND_ERRORS[result.error] : 'el envío falló');
      }
    }

    const alert = await alertAdmins(supabase, attention, baseUrl);
    if (alert.ok === false) console.error('[pasantias-letters] admin alert failed');
    // Counts only: no name, no address.
    return res.status(200).json({
      ok: true,
      due: due.length,
      attempted,
      sent,
      failed,
      needAttention: attention.length,
      alerted: alert.ok ? alert.sent : 0,
    });
  } catch {
    console.error('[pasantias-letters] run failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
