import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceRoleClient } from '../../../lib/api-auth';
import { todayInChile } from '../../../lib/pasantias/panel/client';
import { DOCUMENTS_BUCKET } from '../../../lib/pasantias/panel/server';
import { authorizeCronRequest, isAllowedCronMethod } from '../../../lib/zoom/cron-auth';

/**
 * Daily retention sweep of the Pasantías panel: one month after a program ends
 * (28 Feb 2027 for both January programs) the travellers' stored files —
 * tickets, invitation letters, other documents — and the panel's change history
 * are deleted. The rule and its dates live in the SQL functions
 * `pasantias_panel_expired_document_paths` / `pasantias_panel_purge_expired`;
 * this job only passes today's date in Chile.
 *
 * Files first, rows second: if deleting the files fails, nothing is purged and
 * the next run starts again, so a row never outlives its file's deletion
 * attempt and no row is dropped while its file is known to remain.
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

    const { data: purged, error: purgeError } = await supabase.rpc('pasantias_panel_purge_expired', { p_as_of: asOf });
    if (purgeError || typeof purged !== 'number') {
      console.error('[pasantias-retention] purge failed');
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    return res.status(200).json({ ok: true, files: storagePaths.length, rows: purged });
  } catch {
    console.error('[pasantias-retention] run failed');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
