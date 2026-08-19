import type { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createServiceRoleClient } from '../../../../lib/api-auth';
import { getAppBaseUrl } from '../../../../lib/utils/app-url';
import {
  deliveryMessage,
  sendAccessGrantedEmail,
  sendPasswordSetupEmail,
  type DeliveryResult,
} from '../../../../lib/email/invitations';
import { generateRecoveryLink } from '../../../../lib/auth/recovery-link';
import { recordSecurityAudit } from '../../../../lib/security/audit';
import { generatePassword } from '../../../../utils/passwordGenerator';
import { isGlobalAdmin } from '../../../../utils/roleUtils';
import { teardownPlatformUser } from '../../../../lib/userTeardown';
import { logDataAccessEvent } from '../../../../lib/securityAuditLog';
import {
  GENERATION_WARNINGS,
  SIGNUP_SOURCE_INVITE_BODY,
  SignupSource,
  TRACTOR_ROLE_LABELS,
  TractorSignupRole,
  deriveGenerationOutcome,
  findGenerationForSchool,
  getFullName,
  isKnownSignupSource,
  isTractorSignupRole,
  isValidEmail,
  normalizeEmail,
} from '../../../../lib/signups';

type SignupRow = {
  id: string;
  source: string | null;
  first_name: string;
  last_name: string;
  email: string;
  email_normalized: string | null;
  school_id: number | string;
  generation_id: string | null;
  birth_date: string;
  profession: string;
  role: string;
  status: string;
  linked_user_id: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  school_id: number | null;
  generation_id: string | null;
  approval_status: string | null;
};

/**
 * The canonical public origin.
 *
 * Was a local `getBaseUrl` that read `NEXT_PUBLIC_BASE_URL || NEXT_PUBLIC_SITE_URL`
 * and otherwise fell back to `req.headers.host` — in production too. Two
 * problems: it did not recognise `NEXT_PUBLIC_APP_URL`, which is one of the
 * names the project uses; and `Host` is set by the caller, so a crafted request
 * could mint an invitation whose "Establecer contraseña" button pointed
 * anywhere, baked into an e-mail that outlives the request.
 *
 * `getAppBaseUrl` is the shared helper (`lib/utils/app-url.ts`), already used by
 * the .ics artifacts and reminder notifications for exactly this reason: it
 * accepts all three configured names, falls back to Vercel's own deployment
 * origin, and THROWS in production when neither is available rather than
 * trusting the header. A grant that cannot produce a trustworthy link fails
 * loudly instead of sending a link to somewhere else.
 */
async function rollbackCreatedUser(supabase: any, userId: string) {
  try {
    // Reuse the shared teardown so this stays in sync with delete-user.ts.
    await teardownPlatformUser(supabase, userId);
  } catch (rollbackError) {
    console.error('[tractor-signups grant] rollback failed:', rollbackError);
  }
}

async function getSchoolName(supabase: any, schoolId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.name ?? null;
}

async function findProfileByEmail(supabase: any, email: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, name, school_id, generation_id, approval_status')
    .eq('email', email)
    .limit(1);

  if (error) {
    throw error;
  }

  if (data?.[0]) {
    return data[0] as ProfileRow;
  }

  const { data: caseInsensitiveData, error: caseInsensitiveError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, name, school_id, generation_id, approval_status')
    .ilike('email', email)
    .limit(20);

  if (caseInsensitiveError) {
    throw caseInsensitiveError;
  }

  const matchingProfile = ((caseInsensitiveData ?? []) as ProfileRow[]).find(
    (profile) => normalizeEmail(profile.email) === email
  );

  return matchingProfile ?? null;
}

async function ensureRole(
  supabase: any,
  userId: string,
  role: TractorSignupRole,
  schoolId: number,
  assignedBy: string
) {
  const { data: existingRole, error: existingRoleError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role_type', role)
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .limit(1);

  if (existingRoleError) {
    throw existingRoleError;
  }

  if (existingRole?.[0]) {
    return 'existing';
  }

  const { error: roleError } = await supabase.from('user_roles').insert({
    user_id: userId,
    role_type: role,
    school_id: schoolId,
    is_active: true,
    assigned_by: assignedBy,
    assigned_at: new Date().toISOString(),
  });

  if (roleError) {
    throw roleError;
  }

  return 'created';
}

async function refreshRolesCache(supabase: any) {
  // Non-fatal: the materialized cache catches up on its next refresh.
  const { error } = await supabase.rpc('refresh_user_roles_cache');
  if (error) {
    console.error('[tractor-signups grant] refresh_user_roles_cache failed:', error);
  }
}

async function markSignupGranted(
  supabase: any,
  signupId: string,
  userId: string,
  adminId: string
) {
  const { error } = await supabase
    .from('tractor_signups')
    .update({
      status: 'granted',
      linked_user_id: userId,
      granted_by: adminId,
      granted_at: new Date().toISOString(),
    })
    .eq('id', signupId);

  if (error) {
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { isAdmin, user: adminUser, error: authError } = await checkIsAdmin(req, res);
  if (authError) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin || !adminUser?.id) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar estos registros' });
  }

  const signupId = typeof req.body?.signupId === 'string' ? req.body.signupId : '';
  const requestedAction = req.body?.action;
  const action =
    requestedAction === 'dismiss' || requestedAction === 'delete' ? requestedAction : 'grant';
  const deleteAccount = req.body?.deleteAccount === true;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signupId)) {
    return res.status(400).json({ error: 'signupId inválido' });
  }

  const supabase = createServiceRoleClient();

  try {
    const { data: signup, error: signupError } = await supabase
      .from('tractor_signups')
      .select('*')
      .eq('id', signupId)
      .maybeSingle();

    if (signupError) {
      if (signupError.code === '42P01') {
        return res.status(503).json({ error: 'La tabla tractor_signups no existe' });
      }
      throw signupError;
    }

    if (!signup || !isKnownSignupSource(signup.source)) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    const signupRow = signup as SignupRow;
    const signupSource: SignupSource = signup.source;

    if (action === 'delete') {
      // Optionally tear down the provisioned platform account. Only possible
      // when the signup is linked to a real user (linked_user_id is set at grant).
      if (deleteAccount && signupRow.linked_user_id) {
        // Never let this panel delete an admin account.
        const targetIsAdmin = await isGlobalAdmin(supabase, signupRow.linked_user_id);
        if (targetIsAdmin) {
          return res.status(403).json({
            error: 'No se puede eliminar una cuenta de administrador desde este panel.',
          });
        }

        try {
          const teardown = await teardownPlatformUser(supabase, signupRow.linked_user_id);
          logDataAccessEvent('USER_DELETED', {
            userId: adminUser.id,
            targetUserId: signupRow.linked_user_id,
            req,
            details: {
              linkedSignupId: signupId,
              rolesDeleted: teardown.rolesDeleted,
              authUserDeleted: teardown.authUserDeleted,
              via: 'tractor-signups',
            },
          });
        } catch (teardownError: any) {
          console.error('[tractor-signups grant] account teardown failed:', teardownError);
          return res
            .status(500)
            .json({ error: teardownError?.message || 'No se pudo eliminar la cuenta del usuario' });
        }
      }

      const { error: deleteError } = await supabase
        .from('tractor_signups')
        .delete()
        .eq('id', signupId);

      if (deleteError) {
        throw deleteError;
      }

      return res.status(200).json({
        success: true,
        status: 'deleted',
        deletedAccount: Boolean(deleteAccount && signupRow.linked_user_id),
      });
    }

    if (action === 'dismiss') {
      if (signupRow.status === 'granted') {
        return res.status(400).json({ error: 'No se puede descartar un registro ya otorgado' });
      }

      const { error: dismissError } = await supabase
        .from('tractor_signups')
        .update({ status: 'dismissed' })
        .eq('id', signupId);

      if (dismissError) {
        throw dismissError;
      }

      return res.status(200).json({ success: true, status: 'dismissed' });
    }

    if (signupRow.status === 'granted') {
      return res.status(200).json({ success: true, status: 'granted', alreadyGranted: true });
    }

    const email = normalizeEmail(signupRow.email_normalized || signupRow.email);
    const schoolId = Number(signupRow.school_id);
    if (!isValidEmail(email) || !Number.isSafeInteger(schoolId) || schoolId <= 0) {
      return res.status(400).json({ error: 'Registro inválido' });
    }

    if (!isTractorSignupRole(signupRow.role)) {
      return res.status(400).json({ error: 'Rol inválido en el registro' });
    }

    const role = signupRow.role;
    const schoolName = await getSchoolName(supabase, schoolId);

    // Resolve the signup's optional generation (async ownership check), then
    // let the pure contract in lib/signups decide what gets written where.
    // Fail-soft: a stale or school-mismatched generation never blocks the
    // grant itself, and only profiles.generation_id is ever touched —
    // user_roles.generation_id is reserved for lider_generacion.
    const resolution: { generationId: string | null; warning: string | null } = {
      generationId: null,
      warning: null,
    };
    if (signupRow.generation_id) {
      const belongsToSchool = await findGenerationForSchool(
        supabase,
        signupRow.generation_id,
        schoolId
      );
      if (belongsToSchool) {
        resolution.generationId = signupRow.generation_id;
      } else {
        resolution.warning = GENERATION_WARNINGS.stale;
        console.warn('[tractor-signups grant] signup generation no longer matches school', {
          signupId,
          generationId: signupRow.generation_id,
          schoolId,
        });
      }
    }

    const existingProfile = await findProfileByEmail(supabase, email);
    const { writeGenerationId, generation } = deriveGenerationOutcome(
      resolution,
      existingProfile,
      schoolId
    );

    if (existingProfile) {
      await ensureRole(supabase, existingProfile.id, role, schoolId, adminUser.id);

      const profileUpdates: Record<string, unknown> = {
        approval_status: 'approved',
      };

      if (!existingProfile.first_name) profileUpdates.first_name = signupRow.first_name;
      if (!existingProfile.last_name) profileUpdates.last_name = signupRow.last_name;
      if (!existingProfile.name) profileUpdates.name = getFullName(signupRow.first_name, signupRow.last_name);
      if (!existingProfile.school_id) {
        profileUpdates.school_id = schoolId;
        profileUpdates.school = schoolName;
      }
      if (writeGenerationId) {
        profileUpdates.generation_id = writeGenerationId;
      }

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', existingProfile.id);

      if (profileUpdateError) {
        throw profileUpdateError;
      }

      await refreshRolesCache(supabase);
      await markSignupGranted(supabase, signupId, existingProfile.id, adminUser.id);

      // S8: tell the person. This branch used to return here silently — access
      // and roles were attached to an established account and NOBODY was
      // notified, so the grant existed only in the admin panel. Deliberately an
      // approval notice with the canonical login URL, not a recovery link: the
      // password is fine, and mailing "restablece tu contraseña" to someone who
      // did not ask trains exactly the habit phishing relies on.
      const existingEmailResult: DeliveryResult = await sendAccessGrantedEmail({
        to: email,
        firstName: existingProfile.first_name || signupRow.first_name,
        loginUrl: `${getAppBaseUrl(req)}/login`,
        bodyLine: SIGNUP_SOURCE_INVITE_BODY[signupSource],
      });

      await recordSecurityAudit(supabase, {
        action: 'access_granted_existing_user',
        outcome: 'success',
        actorUserId: adminUser.id,
        actorRole: 'admin',
        targetUserId: existingProfile.id,
        schoolId,
        metadata: {
          role_type: role,
          signup_source: signupSource,
          email_sent: existingEmailResult.sent,
          email_failure_reason: existingEmailResult.reason ?? null,
        },
      });

      return res.status(200).json({
        success: true,
        status: 'granted',
        existingUser: true,
        linkedUserId: existingProfile.id,
        generation,
        // Same shape as the new-account branch so the panel can render one
        // delivery status for both, and offer the same retry for both.
        // `status` is the accurate word: `provider_accepted` is as far as this
        // process can see. See lib/email/invitations.ts for why "delivered" is
        // not a state anything here produces.
        email: {
          sent: existingEmailResult.sent,
          status: existingEmailResult.status,
          reason: existingEmailResult.reason ?? null,
        },
        emailMessage: deliveryMessage(existingEmailResult),
        canResend: true,
      });
    }

    let createdUserId: string | null = null;

    try {
      const temporaryPassword = generatePassword();
      const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          role,
          roles: [role],
        },
      });

      if (createUserError || !createdUser.user) {
        throw createUserError || new Error('No se pudo crear el usuario');
      }

      createdUserId = createdUser.user.id;

      const fullName = getFullName(signupRow.first_name, signupRow.last_name);
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: createdUserId,
          email,
          first_name: signupRow.first_name,
          last_name: signupRow.last_name,
          name: fullName,
          school_id: schoolId,
          school: schoolName,
          generation_id: writeGenerationId,
          approval_status: 'approved',
          must_change_password: true,
        },
        { onConflict: 'id' }
      );

      if (profileError) {
        throw profileError;
      }

      await ensureRole(supabase, createdUserId, role, schoolId, adminUser.id);

      // F2: the application's OWN `/reset-password?token_hash=…&type=recovery`
      // URL, built from `generateLink().properties.hashed_token` — not the
      // provider's `action_link`, whose landing format depends on a dashboard
      // setting and used to arrive as a legacy implicit fragment. See
      // lib/auth/recovery-link.ts.
      const link = await generateRecoveryLink(supabase, {
        email,
        baseUrl: getAppBaseUrl(req),
      });

      if (!link.ok) {
        throw new Error('No se pudo generar el enlace de recuperación');
      }

      await refreshRolesCache(supabase);
      await markSignupGranted(supabase, signupId, createdUserId, adminUser.id);

      const emailResult = await sendPasswordSetupEmail({
        to: email,
        firstName: signupRow.first_name,
        recoveryUrl: link.url,
        bodyLine: SIGNUP_SOURCE_INVITE_BODY[signupSource],
      });

      await recordSecurityAudit(supabase, {
        action: 'access_granted_new_user',
        outcome: 'success',
        actorUserId: adminUser.id,
        actorRole: 'admin',
        targetUserId: createdUserId,
        schoolId,
        metadata: {
          role_type: role,
          signup_source: signupSource,
          email_sent: emailResult.sent,
          email_delivery_status: emailResult.status,
          email_failure_reason: emailResult.reason ?? null,
        },
      });

      // S7: `email.sent === false` is no longer terminal. The signup stays
      // `granted` (the account exists and must not be created twice), and the
      // panel offers "Reenviar invitación", which mints a FRESH link. Before
      // this, a failed send stranded the person with an account they could
      // never reach and no operator action that could fix it.
      return res.status(200).json({
        success: true,
        status: 'granted',
        existingUser: false,
        linkedUserId: createdUserId,
        roleLabel: TRACTOR_ROLE_LABELS[role],
        // The action link is NOT here, and never is: `DeliveryResult` carries a
        // boolean and a coarse reason, and the link never leaves the mailer.
        email: {
          sent: emailResult.sent,
          status: emailResult.status,
          reason: emailResult.reason ?? null,
        },
        emailMessage: deliveryMessage(emailResult),
        canResend: true,
        generation,
      });
    } catch (provisionError) {
      if (createdUserId) {
        await rollbackCreatedUser(supabase, createdUserId);
      }
      throw provisionError;
    }
  } catch (error: any) {
    console.error('[tractor-signups grant] unexpected error:', error);

    // GoTrue's duplicate-user error: code 'email_exists', message
    // 'A user with this email address has already been registered'.
    if (
      error?.code === 'email_exists' ||
      error?.message?.includes('already been registered') ||
      error?.message?.includes('already exists')
    ) {
      return res.status(409).json({ error: 'Ya existe un usuario con este correo' });
    }

    return res.status(500).json({ error: error?.message || 'Error interno del servidor' });
  }
}
