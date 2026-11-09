/**
 * GET /api/admin/pasantias-panel — everything FNE's logistics panel shows.
 *
 * Global admins only, with the forced-password hold before any query (see
 * `lib/pasantias/participants/admin.ts`). Answers every roster of the cohort,
 * every traveller with FNE's tracking, and whether the two letter images are
 * uploaded. Never a token, a token hash or a storage path.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { authorizeIntakeAdmin } from '../../../../lib/pasantias/participants/admin';
import { logIntakeFailure } from '../../../../lib/pasantias/participants/server';
import { readLetterAssetsState } from '../../../../lib/pasantias/panel/documents';
import { loadPanel } from '../../../../lib/pasantias/panel/server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await authorizeIntakeAdmin(req, res, ['GET']);
  if (!auth) return;
  const { supabase } = auth;

  try {
    const panel = await loadPanel(supabase);
    // Explicit `=== false`: tsconfig has strict off, and without
    // strictNullChecks only equality narrows a boolean discriminant both ways.
    if (panel.ok === false) {
      logIntakeFailure('panel list failed', panel.error);
      return res.status(500).json({ error: 'Error al cargar el panel' });
    }
    const assets = await readLetterAssetsState(supabase);
    if (assets.ok === false) {
      logIntakeFailure('panel letter assets state failed', assets.error);
      return res.status(500).json({ error: 'Error al cargar el panel' });
    }
    return res.status(200).json({
      rosters: panel.value.rosters,
      rows: panel.value.rows,
      letterAssets: assets.value,
    });
  } catch (error) {
    logIntakeFailure('panel unexpected error', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
