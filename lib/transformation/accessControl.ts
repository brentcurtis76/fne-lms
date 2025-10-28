/**
 * Transformation Access Control Library
 *
 * Manages Growth Community access to Transformation Vías (7 vías package)
 *
 * Features:
 * - Check if a GC has transformation access
 * - Assign transformation access (all 7 vías as package)
 * - Revoke access (auto-archives active assessments)
 * - Query audit log for support/traceability
 *
 * @author Claude (with Brent Curtis)
 * @date 2025-01-27
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Verifica si una Growth Community tiene acceso a Vías de Transformación
 *
 * Lee de growth_community_transformation_access, con fallback temporal a
 * transformation_enabled durante el período de migración.
 *
 * @param supabase - Supabase client instance
 * @param communityId - Growth Community UUID
 * @returns true si la GC tiene acceso activo
 */
export async function hasTransformationAccess(
  supabase: SupabaseClient,
  communityId: string
): Promise<boolean> {
  // Primero verificar nueva tabla
  const { data: access, error } = await supabase
    .from('growth_community_transformation_access')
    .select('is_active')
    .eq('growth_community_id', communityId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[accessControl] Error checking transformation access:', error);
  }

  if (access) {
    return true;
  }

  // Fallback temporal al flag viejo durante migración
  // Este código se puede eliminar después de la migración 023
  const { data: community, error: communityError } = await supabase
    .from('growth_communities')
    .select('transformation_enabled')
    .eq('id', communityId)
    .single();

  if (communityError) {
    console.error('[accessControl] Error checking fallback flag:', communityError);
    return false;
  }

  return community?.transformation_enabled === true;
}

/**
 * Asigna acceso a Vías de Transformación a una Growth Community
 *
 * Crea o actualiza el registro en growth_community_transformation_access.
 * Las 7 vías se asignan como paquete completo.
 *
 * @param supabase - Supabase client instance
 * @param communityId - Growth Community UUID
 * @param assignedBy - User ID del admin que asigna el acceso
 * @param notes - Notas opcionales sobre la asignación
 * @returns Resultado de la operación
 */
export async function assignTransformationAccess(
  supabase: SupabaseClient,
  communityId: string,
  assignedBy: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('growth_community_transformation_access')
    .upsert({
      growth_community_id: communityId,
      is_active: true,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
      notes: notes || 'Asignación de paquete completo (7 vías)',
    }, {
      onConflict: 'growth_community_id',
    });

  if (error) {
    console.error('[accessControl] Error assigning transformation access:', error);
    return { success: false, error: error.message };
  }

  // 🔧 CRITICAL FIX: Keep legacy flag in sync until cleanup migration (023)
  // Without this, fallback will fail after revocation
  const { error: flagError } = await supabase
    .from('growth_communities')
    .update({ transformation_enabled: true })
    .eq('id', communityId);

  if (flagError) {
    console.warn('[accessControl] Failed to update legacy flag (non-critical):', flagError);
    // Don't fail the operation, new table is source of truth
  }

  console.log('✅ Transformation access assigned:', {
    communityId,
    assignedBy,
  });

  return { success: true };
}

/**
 * Revoca acceso a Vías de Transformación de una Growth Community
 *
 * Desactiva el registro en growth_community_transformation_access.
 * El trigger de base de datos archivará automáticamente todos los assessments
 * activos (status: in_progress, completed) de esta comunidad.
 *
 * ⚠️ IMPORTANTE: Los assessments archivados NO se reactivan automáticamente
 * si se reasigna el acceso más adelante.
 *
 * @param supabase - Supabase client instance
 * @param communityId - Growth Community UUID
 * @returns Resultado con count e IDs de assessments archivados
 */
export async function revokeTransformationAccess(
  supabase: SupabaseClient,
  communityId: string
): Promise<{
  success: boolean;
  archivedCount?: number;
  archivedIds?: string[];
  error?: string;
}> {
  // 1. Obtener assessments que serán archivados (para logging)
  const { data: assessments, error: fetchError } = await supabase
    .from('transformation_assessments')
    .select('id, area, status')
    .eq('growth_community_id', communityId)
    .in('status', ['in_progress', 'completed']);

  if (fetchError) {
    console.error('[accessControl] Error fetching assessments to archive:', fetchError);
    return { success: false, error: fetchError.message };
  }

  const archivedIds = assessments?.map(a => a.id) || [];
  const archivedCount = archivedIds.length;

  // 2. Desactivar acceso (trigger archivará automáticamente via SQL)
  // 🔧 CRITICAL: Filter by is_active = true to prevent repeated revocations
  const { data: updateResult, error: revokeError } = await supabase
    .from('growth_community_transformation_access')
    .update({ is_active: false })
    .eq('growth_community_id', communityId)
    .eq('is_active', true) // Only update if currently active
    .select();

  // 🔧 MEDIUM FIX: Check if any row was actually updated
  if (revokeError) {
    console.error('[accessControl] Error revoking transformation access:', revokeError);
    return { success: false, error: revokeError.message };
  }

  if (!updateResult || updateResult.length === 0) {
    console.warn('[accessControl] No active access record found to revoke:', communityId);
    return {
      success: false,
      error: 'Esta comunidad no tiene un registro de acceso activo para revocar.',
    };
  }

  // 3. 🔧 CRITICAL FIX: Keep legacy flag in sync until cleanup migration (023)
  const { error: flagError } = await supabase
    .from('growth_communities')
    .update({ transformation_enabled: false })
    .eq('id', communityId);

  if (flagError) {
    console.warn('[accessControl] Failed to update legacy flag (non-critical):', flagError);
    // Don't fail the operation, new table is source of truth
  }

  // 4. Log para soporte (también se registra en audit_log via trigger SQL)
  console.log('🔍 Transformation access revoked:', {
    communityId,
    archivedCount,
    archivedIds,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    archivedCount,
    archivedIds,
  };
}

/**
 * Obtiene el historial de auditoría de asignaciones/revocaciones
 * para una Growth Community específica
 *
 * Útil para soporte: permite rastrear exactamente qué assessments
 * fueron archivados y cuándo.
 *
 * @param supabase - Supabase client instance
 * @param communityId - Growth Community UUID
 * @param limit - Número máximo de registros a retornar (default: 20)
 * @returns Array de registros de auditoría
 */
export async function getAccessAuditLog(
  supabase: SupabaseClient,
  communityId: string,
  limit: number = 20
): Promise<Array<{
  action: 'assigned' | 'revoked';
  performedAt: string;
  performedBy: string | null;
  assessmentCount: number;
  affectedIds: string[];
  notes: string | null;
}>> {
  const { data, error } = await supabase
    .from('transformation_access_audit_log')
    .select('action, performed_at, performed_by, assessment_count, affected_assessment_ids, notes')
    .eq('growth_community_id', communityId)
    .order('performed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[accessControl] Error fetching audit log:', error);
    return [];
  }

  return data?.map(log => ({
    action: log.action as 'assigned' | 'revoked',
    performedAt: log.performed_at,
    performedBy: log.performed_by,
    assessmentCount: log.assessment_count || 0,
    affectedIds: log.affected_assessment_ids || [],
    notes: log.notes,
  })) || [];
}

/**
 * Obtiene lista de Growth Communities con acceso activo a Transformación
 *
 * Útil para admin UI que muestra qué comunidades tienen el paquete de vías asignado.
 *
 * @param supabase - Supabase client instance
 * @returns Array de communities con acceso
 */
export async function getCommunitiesWithAccess(
  supabase: SupabaseClient
): Promise<Array<{
  communityId: string;
  communityName: string;
  assignedAt: string;
  assignedBy: string | null;
}>> {
  const { data, error } = await supabase
    .from('growth_community_transformation_access')
    .select(`
      growth_community_id,
      assigned_at,
      assigned_by,
      growth_communities (
        id,
        name
      )
    `)
    .eq('is_active', true)
    .order('assigned_at', { ascending: false });

  if (error) {
    console.error('[accessControl] Error fetching communities with access:', error);
    return [];
  }

  return data?.map(row => ({
    communityId: row.growth_community_id,
    communityName: (row.growth_communities as any)?.name || 'Comunidad sin nombre',
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
  })) || [];
}

/**
 * Verifica si un usuario es admin (para usar en API routes)
 *
 * @param supabase - Supabase client instance
 * @param userId - User ID a verificar
 * @returns true si el usuario es admin o consultor
 */
export async function isUserAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    console.error('[accessControl] Error checking user roles:', error);
    return false;
  }

  const userRoles = roles?.map(r => r.role_type) || [];
  return userRoles.includes('admin') || userRoles.includes('consultor');
}
