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
      console.log('[overlay] No session found');
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Verify superadmin status using admin client
    const { data: isSuperadmin } = await supabaseAdmin
      .from('superadmins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!isSuperadmin) {
      console.log('[overlay] User is not superadmin:', session.user.id);
      return res.status(403).json({ error: 'Acceso denegado - solo superadministradores' });
    }

    const { role_type, permission_key, granted, reason, dry_run, idempotency_key } = req.body;

    // Validate required fields
    if (!role_type || !permission_key || typeof granted !== 'boolean') {
      return res.status(400).json({ 
        error: 'Campos requeridos: role_type, permission_key, granted' 
      });
    }

    console.log('[overlay] Processing request for:', { role_type, permission_key, granted, dry_run });

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

    // Step 1: Check current test mode state
    const { data: currentTestMode, error: testModeCheckError } = await supabase
      .from('test_mode_state')
      .select('enabled, test_run_id, expires_at')
      .eq('user_id', session.user.id)
      .single();

    console.log('[overlay] Current test mode state:', currentTestMode ? 'exists' : 'not found');

    let testRunId: string;
    let testModeExpires: string;

    // Step 2: Enable or update test mode if needed
    if (!currentTestMode?.enabled || !currentTestMode?.test_run_id) {
      // Generate new test run ID
      testRunId = crypto.randomUUID();
      const expires = new Date();
      expires.setHours(expires.getHours() + 24);
      testModeExpires = expires.toISOString();

      console.log('[overlay] Creating new test mode with test_run_id:', testRunId);

      // Upsert test mode state
      const { error: upsertError } = await supabase
        .from('test_mode_state')
        .upsert({
          user_id: session.user.id,
          enabled: true,
          test_run_id: testRunId,
          enabled_at: new Date().toISOString(),
          expires_at: testModeExpires
        });

      if (upsertError) {
        console.error('[overlay] Error upserting test mode:', upsertError);
        return res.status(500).json({ 
          error: 'Error al habilitar modo de prueba',
          details: upsertError.message,
          code: upsertError.code
        });
      }

      // CRITICAL: Re-fetch to confirm the test_run_id was saved
      const { data: confirmedTestMode, error: refetchError } = await supabase
        .from('test_mode_state')
        .select('enabled, test_run_id, expires_at')
        .eq('user_id', session.user.id)
        .single();

      if (refetchError || !confirmedTestMode?.test_run_id) {
        console.error('[overlay] Failed to confirm test mode after upsert:', refetchError);
        return res.status(500).json({ 
          error: 'Error al confirmar modo de prueba',
          details: refetchError?.message || 'test_run_id not found after upsert'
        });
      }

      testRunId = confirmedTestMode.test_run_id;
      testModeExpires = confirmedTestMode.expires_at;
      console.log('[overlay] Confirmed test_run_id:', testRunId);
    } else {
      // Use existing test mode
      testRunId = currentTestMode.test_run_id;
      testModeExpires = currentTestMode.expires_at;
      console.log('[overlay] Using existing test_run_id:', testRunId);
    }

    // Step 3: Handle dry run
    if (dry_run) {
      return res.status(200).json({
        preview: {
          role_type,
          permission_key,
          granted,
          reason,
          test_run_id: testRunId,
          would_create: true,
          expires_at: testModeExpires
        }
      });
    }

    // Step 4: Check for existing overlay
    const { data: existingOverlays, error: checkError } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role_type', role_type)
      .eq('permission_key', permission_key)
      .eq('test_run_id', testRunId)
      .eq('active', true);

    console.log('[overlay] Existing overlays found:', existingOverlays?.length || 0);

    // Step 5: Delete existing overlays if any (avoid unique constraint violation)
    if (existingOverlays && existingOverlays.length > 0) {
      console.log('[overlay] Deleting existing overlays');
      
      const { error: deleteError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_type', role_type)
        .eq('permission_key', permission_key)
        .eq('test_run_id', testRunId)
        .eq('active', true)
        .eq('is_test', true);

      if (deleteError) {
        console.error('[overlay] Error deleting existing overlays:', deleteError);
        // Continue anyway - the insert might still work
      }
    }

    // Step 6: Create new overlay
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    const finalReason = idempotency_key 
      ? `${reason} (idempotency:${idempotency_key})`
      : reason || 'Manual overlay';

    console.log('[overlay] Creating new overlay with test_run_id:', testRunId);

    const overlayData = {
      role_type,
      permission_key,
      granted,
      reason: finalReason,
      created_by: session.user.id,
      test_run_id: testRunId,
      is_test: true,
      active: true,
      expires_at: expires.toISOString()
    };

    console.log('[overlay] Insert payload:', JSON.stringify(overlayData, null, 2));

    const { data: overlay, error: insertError } = await supabase
      .from('role_permissions')
      .insert(overlayData)
      .select()
      .single();

    if (insertError) {
      console.error('[overlay] Insert error:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint
      });
      
      return res.status(500).json({ 
        error: 'Error al crear overlay de permisos',
        details: insertError.message,
        code: insertError.code,
        hint: insertError.hint
      });
    }

    console.log('[overlay] Successfully created overlay:', overlay?.id);

    // Return success with all relevant data
    return res.status(200).json({
      overlay,
      test_run_id: testRunId,
      expires_at: testModeExpires,
      change: existingOverlays?.length > 0 ? 'updated' : 'created'
    });

  } catch (error: any) {
    console.error('[overlay] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error?.message || 'Unknown error'
    });
  }
}