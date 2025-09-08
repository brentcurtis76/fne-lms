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
    const { role_type, permission_key, granted, reason, dry_run } = req.body;
    
    if (dry_run) {
      return res.status(200).json({
        preview: {
          role_type,
          permission_key,
          granted,
          reason,
          would_create: true
        }
      });
    }

    return res.status(200).json({
      overlay: {
        id: 'mock-overlay-id',
        role_type,
        permission_key,
        granted,
        reason,
        test_run_id: 'mock-test-run-id',
        is_test: true,
        created_at: new Date().toISOString()
      },
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

    const { role_type, permission_key, granted, reason, dry_run, idempotency_key } = req.body;

    // Validate required fields
    if (!role_type || !permission_key || typeof granted !== 'boolean') {
      return res.status(400).json({ 
        error: 'Campos requeridos: role_type, permission_key, granted' 
      });
    }

    // Check if idempotency key already used
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('role_permissions')
        .select('id')
        .eq('reason', `idempotency:${idempotency_key}`)
        .single();

      if (existing) {
        return res.status(200).json({
          overlay: existing,
          idempotent: true
        });
      }
    }

    // Enable test mode if not already enabled
    const { data: testMode, error: testModeError } = await supabase
      .from('test_mode_state')
      .select('enabled, test_run_id, expires_at')
      .eq('user_id', session.user.id)
      .single();

    let testRunId = testMode?.test_run_id;

    if (!testMode?.enabled || !testRunId) {
      // Enable test mode with 24-hour TTL
      testRunId = crypto.randomUUID();
      const expires = new Date();
      expires.setHours(expires.getHours() + 24);

      const { error: enableError } = await supabase
        .from('test_mode_state')
        .upsert({
          user_id: session.user.id,
          enabled: true,
          test_run_id: testRunId,
          enabled_at: new Date().toISOString(),
          expires_at: expires.toISOString()
        });

      if (enableError) {
        console.error('Error enabling test mode:', enableError);
        return res.status(500).json({ error: 'Error al habilitar modo de prueba' });
      }
    }

    // Dry run - just preview
    if (dry_run) {
      return res.status(200).json({
        preview: {
          role_type,
          permission_key,
          granted,
          reason,
          test_run_id: testRunId,
          would_create: true,
          expires_at: testMode?.expires_at
        }
      });
    }

    // Check for existing overlay for this permission
    const { data: existing } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role_type', role_type)
      .eq('permission_key', permission_key)
      .eq('test_run_id', testRunId)
      .eq('active', true)
      .single();

    // Determine what change is being made
    let change = 'no_change';
    if (!existing) {
      change = granted ? 'grant_new' : 'revoke_new';
    } else if (existing.granted !== granted) {
      change = granted ? 'grant_override' : 'revoke_override';
    }

    // Delete existing active test overlay if there is one (RLS allows DELETE of test rows)
    if (existing && change !== 'no_change' && existing.is_test) {
      const { error: deleteError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_type', role_type)
        .eq('permission_key', permission_key)
        .eq('active', true)
        .eq('is_test', true)
        .eq('test_run_id', testRunId);

      if (deleteError) {
        console.error('Error deleting existing overlay:', deleteError);
      }
    }

    // Create new overlay (only if change needed)
    if (change !== 'no_change') {
      const expires = new Date();
      expires.setHours(expires.getHours() + 24);

      const finalReason = idempotency_key 
        ? `${reason} (idempotency:${idempotency_key})`
        : reason;

      const { data: overlay, error: insertError } = await supabase
        .from('role_permissions')
        .insert({
          role_type,
          permission_key,
          granted,
          reason: finalReason,
          created_by: session.user.id,
          test_run_id: testRunId,
          is_test: true,
          active: true,
          expires_at: expires.toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating overlay:', insertError);
        return res.status(500).json({ error: 'Error al crear overlay de permisos' });
      }

      // Audit log entry is handled by database trigger - no need to insert here
      // The audit_role_permission_change() trigger will automatically log this

      return res.status(200).json({
        overlay,
        change,
        test_run_id: testRunId
      });
    }

    return res.status(200).json({
      message: 'Sin cambios necesarios',
      existing,
      change
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}