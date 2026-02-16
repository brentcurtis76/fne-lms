/**
 * Facilitator Integrity Validation Utility
 * Shared validation logic for enforcing BR-1 through BR-4:
 * - Non-empty facilitators array
 * - Exactly one lead facilitator
 * - All facilitators have active consultor role for target school
 * - School scoping (school_id matches or is null for global scope)
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface FacilitatorValidationInput {
  user_id: string;
  is_lead: boolean;
  facilitator_role?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates facilitator integrity for a session.
 *
 * Returns { valid: true, errors: [] } if all checks pass.
 * Returns { valid: false, errors: [list of Spanish error messages] } if any check fails.
 *
 * Checks performed:
 * 1. Facilitators array is non-empty (>= 1)
 * 2. Exactly one facilitator has is_lead = true
 * 3. Each facilitator user_id has an active consultor role in user_roles
 *    where (school_id matches OR school_id is null) AND is_active = true
 */
export async function validateFacilitatorIntegrity(
  serviceClient: SupabaseClient,
  facilitators: FacilitatorValidationInput[] | undefined,
  schoolId: number
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Check 1: Facilitators array is non-empty
  if (!facilitators || !Array.isArray(facilitators) || facilitators.length === 0) {
    errors.push('Debe asignar al menos un facilitador a la sesión');
    return { valid: false, errors };
  }

  // Check 2: Exactly one lead facilitator
  const leadCount = facilitators.filter((f) => f.is_lead).length;
  if (leadCount !== 1) {
    errors.push('Debe haber exactamente un facilitador principal (is_lead: true)');
    return { valid: false, errors };
  }

  // Check 3: All facilitators have active consultor role for target school
  try {
    // Extract unique facilitator user IDs
    const facilitatorUserIds = facilitators.map((f) => f.user_id);

    // Query user_roles to find active consultor roles for these users
    // that either match the school_id or are globally scoped (school_id IS NULL)
    const { data: validConsultors, error: queryError } = await serviceClient
      .from('user_roles')
      .select('user_id')
      .in('user_id', facilitatorUserIds)
      .eq('role_type', 'consultor')
      .eq('is_active', true)
      .or(`school_id.eq.${schoolId},school_id.is.null`);

    if (queryError) {
      console.error('Database error validating facilitator roles:', queryError);
      errors.push('Error al verificar roles de facilitadores');
      return { valid: false, errors };
    }

    // Build set of valid user IDs
    const validUserIds = new Set((validConsultors || []).map((row: any) => row.user_id));

    // Check each facilitator has a valid role
    for (const facilitator of facilitators) {
      if (!validUserIds.has(facilitator.user_id)) {
        errors.push(
          `El usuario ${facilitator.user_id} no tiene un rol activo de consultor para esta escuela`
        );
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  } catch (error: any) {
    console.error('Unexpected error validating facilitator integrity:', error);
    errors.push('Error inesperado al validar facilitadores');
    return { valid: false, errors };
  }
}
