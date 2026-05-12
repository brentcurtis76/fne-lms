import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdminOrEquipoDirectivo, createServiceRoleClient, isValidSchoolIdInput } from '../../../lib/api-auth';
import { Validators } from '../../../lib/types/api-auth.types';
import { rateLimit, RATE_LIMITS } from '../../../lib/rateLimit';
import {
  ED_FORBIDDEN_TARGET_ROLES_SET,
  SCHOOL_SCOPED_ROLES_SET,
} from '../../../utils/roleUtils';

// Two-stage rate limiting to avoid contention between admin and ED traffic on
// the same source IP (shared NAT / office network). The helper buckets are
// keyed `IP:identifier`, so different identifiers create independent buckets
// without changing `lib/rateLimit.ts`.
//
// Stage 1 (pre-auth, api-tier 30/min): a relaxed global gate at this endpoint
// to absorb unauthenticated abuse before we know the requester's role. Higher
// than the auth tier because legitimate authenticated traffic from a shared
// IP also passes through here.
//
// Stage 2 (post-auth, auth-tier 10/min, per-role identifier): the actual
// strict bucket, scoped by role so admin and ED do not consume each other's
// budget. Email change is an account-takeover primitive (mirrors
// reset-password.ts), hence the auth-tier cap per role.
const preAuthRateLimit = rateLimit(RATE_LIMITS.api, 'admin-update-user');
const adminPostAuthRateLimit = rateLimit(RATE_LIMITS.auth, 'admin-update-user:admin');
const edPostAuthRateLimit = rateLimit(RATE_LIMITS.auth, 'admin-update-user:equipo_directivo');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const preAuthAllowed = await preAuthRateLimit(req, res);
  if (!preAuthAllowed) return;

  try {
    const {
      isAuthorized,
      role: requesterRole,
      schoolId: edSchoolId,
      user: requestingUser,
      error: authError,
    } = await checkIsAdminOrEquipoDirectivo(req, res);

    if (authError || !requestingUser) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden editar usuarios' });
    }

    if (requesterRole === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    // Stage 2 rate limit: per-role bucket so admin and ED traffic share neither
    // bucket nor 429 fate on the same source IP. See module-load comment above.
    const postAuthRateLimit =
      requesterRole === 'admin' ? adminPostAuthRateLimit : edPostAuthRateLimit;
    const postAuthAllowed = await postAuthRateLimit(req, res);
    if (!postAuthAllowed) return;

    const { userId, email, first_name, last_name, school, external_school_affiliation } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario requerido' });
    }

    // Normalize email up front so every downstream branch sees the same value.
    // Presence is keyed off `req.body.email !== undefined` so null and empty
    // string are treated as intent-to-set (and then rejected), not omission.
    const hasEmail = req.body.email !== undefined;
    let trimmedEmail = '';
    if (hasEmail) {
      trimmedEmail = typeof email === 'string' ? email.trim() : '';
      if (trimmedEmail === '') {
        return res.status(400).json({ error: 'Email no puede estar vacío' });
      }
      if (!Validators.isEmail(trimmedEmail)) {
        return res.status(400).json({ error: 'Email inválido' });
      }
    }

    const supabaseAdmin = createServiceRoleClient();

    // Server-fetched prior profile — the only safe source for rollback/audit.
    // Never trust req.body.* echoes: a client could omit them or send junk
    // and corrupt profile fields if the auth-side update fails. We need ALL
    // mutable fields (not just email) so the rollback on auth-email failure
    // fully restores the row to its pre-update state.
    let currentEmail: string | null | undefined;
    let previousProfile: {
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      school: string | null;
      external_school_affiliation: string | null;
    } | null = null;

    if (requesterRole === 'equipo_directivo') {
      if (req.body.school !== undefined && req.body.school !== null && req.body.school !== '') {
        return res.status(400).json({ error: 'No se puede modificar el colegio' });
      }
      if (req.body.school_id !== undefined && req.body.school_id !== null) {
        if (!isValidSchoolIdInput(req.body.school_id)) {
          return res.status(400).json({ error: 'school_id inválido' });
        }
        const coercedSchoolId = Number(req.body.school_id);
        if (coercedSchoolId !== edSchoolId) {
          return res.status(400).json({ error: 'No se puede modificar el colegio' });
        }
      }

      const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
        .from('profiles')
        .select('school_id, email, first_name, last_name, school, external_school_affiliation')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (targetProfile.school_id !== edSchoolId) {
        return res.status(403).json({ error: 'No autorizado para editar este usuario' });
      }

      currentEmail = targetProfile.email;
      previousProfile = {
        email: targetProfile.email ?? null,
        first_name: targetProfile.first_name ?? null,
        last_name: targetProfile.last_name ?? null,
        school: targetProfile.school ?? null,
        external_school_affiliation: targetProfile.external_school_affiliation ?? null,
      };

      // Note: this is a TOCTOU read. Concurrent role grants between this
      // check and the update write below could let a global-role escalation
      // slip through. Both admin and equipo_directivo can reach this code
      // path, widening the exposure beyond admin-only tooling. Tracked in
      // PR #19 follow-ups as "TOCTOU residual risk hardening (Postgres
      // function or partial unique index)".
      // Defense-in-depth: reject if the target holds any active role either
      // (a) in ED_FORBIDDEN_TARGET_ROLES (admin/consultor/community_manager/
      // supervisor_de_red) or (b) school-scoped but tied to a different
      // school. Two conceptually distinct gates: forbidden-role membership
      // vs. cross-school scope. Profile and user_roles can diverge (stale
      // or cross-school role rows), so this gate is enforced independently.
      const { data: targetRoles, error: rolesLookupError } = await supabaseAdmin
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (rolesLookupError) {
        return res.status(500).json({ error: 'Error verificando roles del usuario' });
      }
      const hasForbiddenRole = (targetRoles ?? []).some(
        (r: { role_type: string }) => ED_FORBIDDEN_TARGET_ROLES_SET.has(r.role_type),
      );
      const hasCrossSchoolRole = (targetRoles ?? []).some(
        (r: { role_type: string; school_id: number | null }) =>
          SCHOOL_SCOPED_ROLES_SET.has(r.role_type) &&
          r.school_id !== null &&
          r.school_id !== edSchoolId,
      );
      if (hasForbiddenRole || hasCrossSchoolRole) {
        return res.status(403).json({ error: 'No autorizado para editar este usuario' });
      }
    }

    if (requesterRole === 'admin' && hasEmail) {
      const { data: targetProfile, error: profileLookupError } = await supabaseAdmin
        .from('profiles')
        .select('email, first_name, last_name, school, external_school_affiliation')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookupError) {
        return res.status(500).json({ error: 'Error verificando usuario' });
      }
      if (!targetProfile) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      currentEmail = targetProfile.email;
      previousProfile = {
        email: targetProfile.email ?? null,
        first_name: targetProfile.first_name ?? null,
        last_name: targetProfile.last_name ?? null,
        school: targetProfile.school ?? null,
        external_school_affiliation: targetProfile.external_school_affiliation ?? null,
      };
    }

    // Build conditionally so callers can update a subset of fields without
    // accidentally nulling the others. A field is only written when its key
    // is present in the body — for name/school fields explicit `''` still
    // nulls (intentional clear), but omission preserves the existing value.
    // Email is the exception: presence is validated above, so by here
    // `trimmedEmail` is always a non-empty, well-formed address.
    const updateData: Record<string, unknown> = {};
    if (first_name !== undefined) updateData.first_name = first_name?.trim() || null;
    if (last_name !== undefined) updateData.last_name = last_name?.trim() || null;
    if (hasEmail) updateData.email = trimmedEmail;
    if (external_school_affiliation !== undefined) {
      updateData.external_school_affiliation = external_school_affiliation || null;
    }
    if (requesterRole === 'admin' && school !== undefined) {
      updateData.school = school?.trim() || null;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      return res.status(500).json({ error: 'Error al actualizar el perfil' });
    }

    // Intentional policy: ED is permitted to update a target user's email
    // (both profiles.email and auth.users.email) for same-school targets
    // that have only school-scoped roles. The school + target-role gates
    // above (school_id match, no global roles) enforce that scope. See
    // `__tests__/api/admin/update-user.test.ts` — test "ED: can update
    // email of a same-school target with no global roles" — and the
    // user-management plan at
    // `.claude/plans/i-want-you-to-precious-riddle.md`. Be aware this is
    // an account-takeover capability inside the school scope (combined
    // with reset-password). Tightening requires product approval.
    if (hasEmail) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { email: trimmedEmail }
      );

      if (authUpdateError) {
        console.error('Error updating auth email:', authUpdateError);

        // Invariant: whenever `hasEmail` is true, `previousProfile` MUST be
        // populated — admin and ED branches both snapshot it before this
        // point. If it is missing, the snapshot path is broken; rolling back
        // with whatever happens to be in scope would write `email: undefined`
        // (treated as null by PostgREST) and silently null the profile. Fail
        // loudly and refuse to write the rollback instead.
        if (!previousProfile) {
          console.error('[update-user] CRITICAL: rollback_invariant_violated_missing_previous_profile', {
            userId,
            requester_user_id: requestingUser.id,
            requester_role: requesterRole,
            auth_update_error: authUpdateError,
            timestamp: new Date().toISOString(),
          });

          // Best-effort audit row so the skipped-rollback event is recoverable
          // from `audit_logs` (the CRITICAL log line alone is easy to miss).
          // Failure here must NOT change the 500 response shape — the user
          // mutation is already torn and that is the signal the caller acts on.
          try {
            const { error: skippedAuditError } = await supabaseAdmin
              .from('audit_logs')
              .insert({
                user_id: requestingUser.id,
                action: 'profile_rollback_skipped',
                table_name: 'profiles',
                record_id: userId,
                details: {
                  userId,
                  requester_user_id: requestingUser.id,
                  requester_role: requesterRole,
                  attempted_update_keys: Object.keys(updateData),
                  timestamp: new Date().toISOString(),
                },
              });
            if (skippedAuditError) {
              console.error('audit_log_insert_failed', {
                action: 'profile_rollback_skipped',
                record_id: userId,
                requester_user_id: requestingUser.id,
                requester_role: requesterRole,
                error: skippedAuditError,
              });
            }
          } catch (err) {
            console.error('audit_log_insert_failed', {
              action: 'profile_rollback_skipped',
              record_id: userId,
              requester_user_id: requestingUser.id,
              requester_role: requesterRole,
              error: err,
            });
          }

          return res.status(500).json({ error: 'Error interno del servidor' });
        }

        // Rollback only the fields the forward path actually mutated, to the
        // server-fetched prior values. Mirrors the conditional updateData
        // shape so an unchanged column is never touched.
        // Rollback failure is critical: the row is now in a torn state
        // (profile email mutated, auth email unchanged). Surface it loudly via
        // console.error with enough structured context to reconcile manually.
        let rollbackError: unknown = null;
        const rollbackUpdate: Record<string, unknown> = {};
        if ('email' in updateData) rollbackUpdate.email = previousProfile.email;
        if ('first_name' in updateData) rollbackUpdate.first_name = previousProfile.first_name;
        if ('last_name' in updateData) rollbackUpdate.last_name = previousProfile.last_name;
        if ('external_school_affiliation' in updateData) {
          rollbackUpdate.external_school_affiliation = previousProfile.external_school_affiliation;
        }
        if ('school' in updateData) rollbackUpdate.school = previousProfile.school;
        if (Object.keys(rollbackUpdate).length > 0) {
          const { error } = await supabaseAdmin
            .from('profiles')
            .update(rollbackUpdate)
            .eq('id', userId);
          rollbackError = error ?? null;
        }

        if (rollbackError) {
          console.error('[update-user] CRITICAL: profile_rollback_failed', {
            userId,
            requester_user_id: requestingUser.id,
            requester_role: requesterRole,
            previous_profile: previousProfile,
            auth_update_error: authUpdateError,
            rollback_error: rollbackError,
            timestamp: new Date().toISOString(),
          });
        }

        return res.status(500).json({ error: 'Error al actualizar el email: ' + authUpdateError.message });
      }
    }

    // Log the update in audit_logs. `requester_role` distinguishes
    // admin-initiated changes from ED-initiated changes — important because
    // ED can perform account-takeover operations (email + password reset)
    // within their school scope. Only fields actually mutated by this
    // request are recorded; omitted body keys do not appear in the audit.
    const updatedFields: Record<string, unknown> = {};
    if ('email' in updateData && trimmedEmail !== currentEmail) {
      updatedFields.email = { from: currentEmail, to: trimmedEmail };
    }
    if ('first_name' in updateData) updatedFields.first_name = first_name;
    if ('last_name' in updateData) updatedFields.last_name = last_name;
    if ('school' in updateData) updatedFields.school = school;
    if ('external_school_affiliation' in updateData) {
      updatedFields.external_school_affiliation = external_school_affiliation;
    }

    // Audit inserts are best-effort: the user mutation already committed, so a
    // failed audit row must not roll the request back to 500. But silent
    // failures break reconciliation, so both thrown exceptions and returned
    // `{ error }` results are surfaced via console.error with enough context
    // (action, target, requester, fields touched) to reconstruct the event
    // from logs. Passwords and raw request bodies are not logged.
    try {
      const { error: updateAuditError } = await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: requestingUser.id,
          action: 'update_user',
          table_name: 'profiles',
          record_id: userId,
          details: {
            requester_role: requesterRole,
            requester_user_id: requestingUser.id,
            updated_fields: updatedFields,
          },
        });
      if (updateAuditError) {
        console.error('audit_log_insert_failed', {
          action: 'update_user',
          record_id: userId,
          requester_user_id: requestingUser.id,
          requester_role: requesterRole,
          updated_field_keys: Object.keys(updatedFields),
          error: updateAuditError,
        });
      }
    } catch (err) {
      console.error('audit_log_insert_failed', {
        action: 'update_user',
        record_id: userId,
        requester_user_id: requestingUser.id,
        requester_role: requesterRole,
        updated_field_keys: Object.keys(updatedFields),
        error: err,
      });
    }

    // Dedicated audit row for email transitions — pairs with the
    // `password_reset` row in reset-password.ts so account-takeover events
    // are surfaceable in queries without parsing `updated_fields` blobs.
    if (hasEmail && trimmedEmail !== currentEmail) {
      try {
        const { error: emailAuditError } = await supabaseAdmin
          .from('audit_logs')
          .insert({
            user_id: requestingUser.id,
            action: 'email_change',
            table_name: 'profiles',
            record_id: userId,
            details: {
              requester_role: requesterRole,
              requester_user_id: requestingUser.id,
              from: currentEmail ?? null,
              to: trimmedEmail,
              timestamp: new Date().toISOString(),
            },
          });
        if (emailAuditError) {
          console.error('audit_log_insert_failed', {
            action: 'email_change',
            record_id: userId,
            requester_user_id: requestingUser.id,
            requester_role: requesterRole,
            from: currentEmail ?? null,
            to: trimmedEmail,
            error: emailAuditError,
          });
        }
      } catch (err) {
        console.error('audit_log_insert_failed', {
          action: 'email_change',
          record_id: userId,
          requester_user_id: requestingUser.id,
          requester_role: requesterRole,
          from: currentEmail ?? null,
          to: trimmedEmail,
          error: err,
        });
      }
    }

    return res.status(200).json({ success: true, message: 'Usuario actualizado exitosamente' });

  } catch (error) {
    console.error('Error in update-user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
