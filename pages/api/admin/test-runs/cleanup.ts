import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Feature flag check
  if (process.env.FEATURE_SUPERADMIN_RBAC !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Dev mock mode
  if (process.env.RBAC_DEV_MOCK === 'true') {
    const { test_run_id, confirm } = req.body;
    
    if (!confirm) {
      return res.status(200).json({
        preview: {
          test_run_id,
          overlays_to_delete: 5,
          would_delete: true
        },
        is_mock: true
      });
    }

    return res.status(200).json({
      success: true,
      deleted_count: 5,
      test_run_id,
      is_mock: true
    });
  }

  try {
    // Get session-bound client for RLS enforcement
    const supabase = createServerSupabaseClient({ req, res });
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Verify superadmin status
    const { data: isSuperadmin } = await supabaseAdmin
      .rpc('auth_is_superadmin', { check_user_id: session.user.id });

    if (!isSuperadmin) {
      return res.status(403).json({ error: 'Acceso denegado - solo superadministradores' });
    }

    const { test_run_id, confirm } = req.body;

    if (!test_run_id) {
      return res.status(400).json({ error: 'test_run_id es requerido' });
    }

    // Get overlays for this test run
    const { data: overlays, error: fetchError } = await supabase
      .from('role_permissions')
      .select('id, role_type, permission_key, granted')
      .eq('test_run_id', test_run_id)
      .eq('is_test', true);

    if (fetchError) {
      console.error('Error fetching overlays:', fetchError);
      return res.status(500).json({ error: 'Error al obtener overlays' });
    }

    if (!overlays || overlays.length === 0) {
      return res.status(404).json({ 
        error: 'No se encontraron overlays para este test_run_id' 
      });
    }

    // Preview mode - just show what would be deleted
    if (!confirm) {
      return res.status(200).json({
        preview: {
          test_run_id,
          overlays_to_delete: overlays.length,
          overlays,
          would_delete: true
        }
      });
    }

    // Get test mode state
    const { data: testMode, error: testModeError } = await supabase
      .from('test_mode_state')
      .select('*')
      .eq('test_run_id', test_run_id)
      .single();

    if (testModeError || !testMode) {
      return res.status(404).json({ 
        error: 'Test run no encontrado' 
      });
    }

    // Enforce owner-only cleanup to align with RLS
    // RLS requires user_id = auth.uid() for UPDATE on test_mode_state
    if (testMode.user_id !== session.user.id) {
      return res.status(403).json({ 
        success: false,
        error: 'Solo puedes limpiar tus propios test runs'
      });
    }

    // Delete the overlays (RLS allows DELETE of own test overlays)
    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('test_run_id', test_run_id)
      .eq('is_test', true)
      .eq('created_by', session.user.id);

    if (deleteError) {
      console.error('Error deleting overlays:', deleteError);
      return res.status(500).json({ error: 'Error al eliminar overlays' });
    }

    // Disable test mode
    const { error: updateError } = await supabase
      .from('test_mode_state')
      .update({
        enabled: false,
        test_run_id: null,
        expires_at: null
      })
      .eq('user_id', session.user.id);

    if (updateError) {
      console.error('Error updating test mode:', updateError);
      return res.status(500).json({ error: 'Error al actualizar modo de prueba' });
    }

    // Audit log entry is handled by database trigger - no need to insert here
    // The audit_role_permission_change() trigger will automatically log deletions

    return res.status(200).json({
      success: true,
      deleted_count: overlays.length,
      test_run_id,
      message: `${overlays.length} overlays eliminados exitosamente`
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}