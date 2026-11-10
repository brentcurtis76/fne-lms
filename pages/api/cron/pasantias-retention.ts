import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { todayInChile } from '../../../lib/pasantias/panel/client';
import { DOCUMENTS_BUCKET } from '../../../lib/pasantias/panel/server';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

/**
 * Daily retention sweep of the Pasantías panel: one month after a program ends
 * (28 Feb 2027 for both January programs) the travellers' stored files —
 * tickets, invitation letters, other documents — and the panel's change history
 * are deleted. The rule and its dates live in two read-only SQL functions,
 * `pasantias_panel_expired_document_paths` and
 * `pasantias_panel_expired_participants`; this job passes today's date in
 * Chile and removes what they list. (The removal is here and not in a SQL
 * function because the publisher that applies migrations to Production accepts
 * no migration that contains a DELETE.)
 *
 * Files first, rows second: if deleting the files fails, nothing else is
 * removed and the next run starts again, so no row is dropped while its file
 * is known to remain. Documents go before history, so a run that stops halfway
 * is finished by the next one.
 */
const REMOVE_BATCH = 100;

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
    const asOf = todayInChile();

    const { data: paths, error: pathsError } = await supabase.rpc('pasantias_panel_expired_document_paths', {
      p_as_of: asOf,
    });
    if (pathsError || !Array.isArray(paths)) {
      console.error('[pasantias-retention] expired list failed');
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    const storagePaths = paths.filter((path): path is string => typeof path === 'string');
    for (let index = 0; index < storagePaths.length; index += REMOVE_BATCH) {
      const { error: removeError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .remove(storagePaths.slice(index, index + REMOVE_BATCH));
      if (removeError) {
        console.error('[pasantias-retention] file removal failed');
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
    }

    const { data: expired, error: expiredError } = await supabase.rpc('pasantias_panel_expired_participants', {
      p_as_of: asOf,
    });
    if (expiredError || !Array.isArray(expired)) {
      console.error('[pasantias-retention] expired travellers list failed');
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    const ids = expired.filter((id): id is string => typeof id === 'string');
    let rows = 0;
    for (let index = 0; index < ids.length; index += REMOVE_BATCH) {
      const batch = ids.slice(index, index + REMOVE_BATCH);
      const documents = await supabase
        .from('pasantias_panel_documents')
        .delete({ count: 'exact' })
        .in('participant_id', batch);
      if (documents.error) {
        console.error('[pasantias-retention] document rows removal failed');
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
      const history = await supabase
        .from('pasantias_panel_activity')
        .delete({ count: 'exact' })
        .in('participant_id', batch);
      if (history.error) {
        console.error('[pasantias-retention] history removal failed');
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
      rows += (documents.count ?? 0) + (history.count ?? 0);
    }
    return res.status(200).json({ ok: true, files: storagePaths.length, rows });
  } catch {
    console.error('[pasantias-retention] run failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
