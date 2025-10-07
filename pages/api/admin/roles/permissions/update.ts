import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

interface PermissionChange {
  role_type: string;
  permission_key: string;
  granted: boolean;
}

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

  try {
    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check superadmin status
    const { data: isSuperadmin } = await supabaseAdmin
      .rpc('auth_is_superadmin', { check_user_id: user.id });

    if (!isSuperadmin) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Get changes from request body
    const { changes } = req.body as { changes: PermissionChange[] };

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron cambios' });
    }

    // Validate changes
    for (const change of changes) {
      if (!change.role_type || !change.permission_key || typeof change.granted !== 'boolean') {
        return res.status(400).json({ error: 'Formato de cambios inválido' });
      }
    }

    // Apply changes to database
    const updates = [];
    const auditLogs = [];

    for (const change of changes) {
      // Update the permission
      const { error: updateError } = await supabaseAdmin
        .from('role_permissions')
        .update({ granted: change.granted })
        .eq('role_type', change.role_type)
        .eq('permission_key', change.permission_key)
        .eq('is_test', false)
        .eq('active', true);

      if (updateError) {
        console.error('Error updating permission:', updateError);
        return res.status(500).json({
          error: `Error al actualizar ${change.role_type}.${change.permission_key}: ${updateError.message}`
        });
      }

      updates.push(change);

      // Create audit log entry
      const { error: auditError } = await supabaseAdmin
        .from('permission_audit_log')
        .insert({
          action: 'permission_updated',
          user_id: user.id,
          role_type: change.role_type,
          permission_key: change.permission_key,
          old_value: !change.granted, // We assume it was toggled
          new_value: change.granted,
          performed_by: user.id,
          reason: 'Manual update via RBAC UI',
          is_test: false,
          diff: {
            role: change.role_type,
            permission: change.permission_key,
            from: !change.granted,
            to: change.granted
          }
        });

      if (auditError) {
        console.error('Error creating audit log:', auditError);
        // Continue anyway - audit log is not critical
      } else {
        auditLogs.push(change);
      }
    }

    return res.status(200).json({
      success: true,
      message: `${updates.length} permisos actualizados exitosamente`,
      updates: updates.length,
      audit_logs: auditLogs.length
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
