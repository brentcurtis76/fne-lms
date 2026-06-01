import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdmin,
  createServiceRoleClient,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import {
  TRACTOR_ROLE_LABELS,
  TRACTOR_SIGNUP_SOURCE,
  TRACTOR_STATUS_LABELS,
  TractorSignupRole,
  TractorSignupStatus,
  getFullName,
  getSantaMartaSchools,
  isTractorSignupRole,
  isTractorSignupStatus,
  normalizeEmail,
} from '../../../../lib/tractorSignups';

const BATCH_SIZE = 100;

type SignupRow = {
  id: string;
  source: string | null;
  first_name: string;
  last_name: string;
  email: string;
  email_normalized: string | null;
  school_id: number | string;
  birth_date: string;
  profession: string;
  role: string;
  status: string;
  consent_accepted_at: string | null;
  linked_user_id: string | null;
  granted_by: string | null;
  granted_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  approval_status: string | null;
  school_id: number | null;
};

type RoleRow = {
  user_id: string;
  role_type: string;
  school_id: number | null;
};

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { isAdmin, error: authError } = await checkIsAdmin(req, res);
  if (authError) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdmin) {
    return res.status(403).json({ error: 'Solo administradores pueden ver estos registros' });
  }

  try {
    const supabase = createServiceRoleClient();

    const [schools, signupsResult] = await Promise.all([
      getSantaMartaSchools(supabase),
      supabase
        .from('tractor_signups')
        .select('*')
        .eq('source', TRACTOR_SIGNUP_SOURCE)
        .order('created_at', { ascending: false }),
    ]);

    const { data: signups, error: signupsError } = signupsResult;
    if (signupsError) {
      if (signupsError.code === '42P01') {
        return res.status(503).json({
          error: 'La tabla tractor_signups no existe. Aplica la migración antes de usar este panel.',
          migrationRequired: true,
        });
      }
      console.error('[tractor-signups API] signup fetch failed:', signupsError);
      return res.status(500).json({ error: 'Error al cargar registros' });
    }

    const signupRows = (signups ?? []) as SignupRow[];
    const emails = Array.from(
      new Set(
        signupRows
          .map((signup) => normalizeEmail(signup.email_normalized || signup.email))
          .filter(Boolean)
      )
    );

    const profilesByEmail = new Map<string, ProfileRow>();
    const allProfiles: ProfileRow[] = [];

    for (const emailBatch of chunk(emails, BATCH_SIZE)) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, name, approval_status, school_id')
        .in('email', emailBatch);

      if (profileError) {
        console.error('[tractor-signups API] profile fetch failed:', profileError);
        return res.status(500).json({ error: 'Error al reconciliar usuarios' });
      }

      for (const profile of (profiles ?? []) as ProfileRow[]) {
        const normalized = normalizeEmail(profile.email);
        if (normalized && !profilesByEmail.has(normalized)) {
          profilesByEmail.set(normalized, profile);
          allProfiles.push(profile);
        }
      }
    }

    const rolesByUserId = new Map<string, RoleRow[]>();
    const userIds = Array.from(new Set(allProfiles.map((profile) => profile.id).filter(Boolean)));

    for (const userIdBatch of chunk(userIds, BATCH_SIZE)) {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role_type, school_id')
        .in('user_id', userIdBatch)
        .eq('is_active', true);

      if (rolesError) {
        console.error('[tractor-signups API] role fetch failed:', rolesError);
        return res.status(500).json({ error: 'Error al reconciliar roles' });
      }

      for (const role of (roles ?? []) as RoleRow[]) {
        const existing = rolesByUserId.get(role.user_id) ?? [];
        existing.push(role);
        rolesByUserId.set(role.user_id, existing);
      }
    }

    const schoolNameById = new Map(schools.map((school) => [school.id, school.name]));

    const rows = signupRows.map((signup) => {
      const normalizedEmail = normalizeEmail(signup.email_normalized || signup.email);
      const existingProfile = profilesByEmail.get(normalizedEmail) ?? null;
      const existingRoles = existingProfile ? rolesByUserId.get(existingProfile.id) ?? [] : [];
      const role = isTractorSignupRole(signup.role) ? signup.role : 'docente';
      const status = isTractorSignupStatus(signup.status) ? signup.status : 'pending';
      const schoolId = Number(signup.school_id);

      return {
        id: signup.id,
        first_name: signup.first_name,
        last_name: signup.last_name,
        full_name: getFullName(signup.first_name, signup.last_name),
        email: signup.email,
        email_normalized: normalizedEmail,
        school_id: schoolId,
        school_name: schoolNameById.get(schoolId) ?? `Colegio ${schoolId}`,
        birth_date: signup.birth_date,
        profession: signup.profession,
        role,
        role_label: TRACTOR_ROLE_LABELS[role as TractorSignupRole],
        status,
        status_label: TRACTOR_STATUS_LABELS[status as TractorSignupStatus],
        consent_accepted_at: signup.consent_accepted_at,
        linked_user_id: signup.linked_user_id,
        granted_by: signup.granted_by,
        granted_at: signup.granted_at,
        created_at: signup.created_at,
        updated_at: signup.updated_at,
        is_existing_user: Boolean(existingProfile),
        existing_user_id: existingProfile?.id ?? null,
        existing_name:
          existingProfile?.name ||
          getFullName(existingProfile?.first_name, existingProfile?.last_name) ||
          null,
        existing_email: existingProfile?.email ?? null,
        existing_status: existingProfile?.approval_status ?? null,
        existing_school_id: existingProfile?.school_id ?? null,
        existing_roles: existingRoles.map((existingRole) => ({
          role_type: existingRole.role_type,
          school_id: existingRole.school_id,
        })),
      };
    });

    return res.status(200).json({ signups: rows, schools });
  } catch (error) {
    console.error('[tractor-signups API] unexpected error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
