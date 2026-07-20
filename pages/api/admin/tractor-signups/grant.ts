import type { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { checkIsAdmin, createServiceRoleClient } from '../../../../lib/api-auth';
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

function getBaseUrl(req: NextApiRequest): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = req.headers.host || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

async function sendInviteEmail(params: {
  to: string;
  firstName: string;
  actionLink: string;
  bodyLine: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[tractor-signups grant] RESEND_API_KEY missing; invitation email not sent', {
      toDomain: params.to.split('@')[1] ?? 'unknown',
    });
    return { sent: false, fallback: true, error: 'RESEND_API_KEY no configurado' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const safeFirstName = escapeHtml(params.firstName);
  const safeActionLink = escapeHtml(params.actionLink);
  const safeBodyLine = escapeHtml(params.bodyLine);

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM_ADDRESS || 'Genera <notificaciones@nuevaeducacion.org>',
    to: params.to,
    subject: 'Activa tu acceso a Genera',
    html: `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#202020;">
          <div style="max-width:620px;margin:0 auto;background:#ffffff;">
            <div style="background:#0a0a0a;color:#ffffff;padding:28px 28px 22px;">
              <div style="color:#fbbf24;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
                Genera
              </div>
              <h1 style="margin:12px 0 0;font-size:26px;line-height:1.25;">
                Tu acceso está listo
              </h1>
            </div>
            <div style="padding:30px 28px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${safeFirstName},</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">
                ${safeBodyLine}
              </p>
              <p style="margin:26px 0;text-align:center;">
                <a href="${safeActionLink}" style="display:inline-block;background:#fbbf24;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:6px;padding:14px 22px;">
                  Establecer contraseña
                </a>
              </p>
              <p style="margin:0;color:#666;font-size:13px;line-height:1.6;">
                Si el botón no funciona, copia y pega el enlace de recuperación desde tu correo en el navegador.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('[tractor-signups grant] Resend failed:', error);
    return { sent: false, error: error.message };
  }

  return { sent: true };
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

      return res.status(200).json({
        success: true,
        status: 'granted',
        existingUser: true,
        linkedUserId: existingProfile.id,
        generation,
      });
    }

    let createdUserId: string | null = null;

    try {
      const temporaryPassword = generatePassword({ minLength: 16 });
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

      const redirectTo = `${getBaseUrl(req)}/reset-password`;
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });

      const actionLink = linkData?.properties?.action_link;
      if (linkError || !actionLink) {
        throw linkError || new Error('No se pudo generar el enlace de recuperación');
      }

      await refreshRolesCache(supabase);
      await markSignupGranted(supabase, signupId, createdUserId, adminUser.id);

      const emailResult = await sendInviteEmail({
        to: email,
        firstName: signupRow.first_name,
        actionLink,
        bodyLine: SIGNUP_SOURCE_INVITE_BODY[signupSource],
      });

      return res.status(200).json({
        success: true,
        status: 'granted',
        existingUser: false,
        linkedUserId: createdUserId,
        roleLabel: TRACTOR_ROLE_LABELS[role],
        email: emailResult,
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
