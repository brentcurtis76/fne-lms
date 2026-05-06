import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdminOrEquipoDirectivo,
  createServiceRoleClient,
  handleMethodNotAllowed,
  logApiRequest,
  sendApiError,
} from '../../../../lib/api-auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const MAX_TEACHERS_MIN = 2;
const MAX_TEACHERS_MAX = 16;
const MAX_TEACHERS_DEFAULT = 16;

const FORBIDDEN_MESSAGE = 'No tienes permiso para crear comunidades';

interface SchoolRow {
  id: number | string;
  has_generations: boolean | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'admin/growth-communities');

  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  const { isAuthorized, role, schoolId: edSchoolId, user, error: authError } =
    await checkIsAdminOrEquipoDirectivo(req, res);
  if (authError) {
    return sendApiError(res, 'Unauthorized', 401, authError.message);
  }
  if (!isAuthorized || !user) {
    return res.status(403).json({ error: FORBIDDEN_MESSAGE });
  }

  const body = (req.body ?? {}) as {
    name?: unknown;
    school_id?: unknown;
    generation_id?: unknown;
    max_teachers?: unknown;
    description?: unknown;
  };

  const rawName = body.name;
  if (typeof rawName !== 'string') {
    return sendApiError(res, 'name is required and must be a string', 400);
  }
  const name = rawName.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    return sendApiError(res, `name must be 1-${NAME_MAX} characters`, 400);
  }

  const rawSchoolId = body.school_id;
  let schoolId: number;
  if (typeof rawSchoolId === 'number' && Number.isFinite(rawSchoolId)) {
    schoolId = rawSchoolId;
  } else if (typeof rawSchoolId === 'string' && rawSchoolId.trim() !== '' && Number.isFinite(Number(rawSchoolId))) {
    schoolId = Number(rawSchoolId);
  } else {
    return sendApiError(res, 'school_id is required', 400);
  }
  if (!Number.isInteger(schoolId)) {
    return sendApiError(res, 'school_id must be an integer', 400);
  }

  const rawGenerationId = body.generation_id;
  let generationId: string | null = null;
  if (rawGenerationId !== undefined && rawGenerationId !== null && rawGenerationId !== '') {
    if (typeof rawGenerationId !== 'string' || !UUID_REGEX.test(rawGenerationId)) {
      return sendApiError(res, 'generation_id must be a UUID', 400);
    }
    generationId = rawGenerationId;
  }

  const rawMaxTeachers = body.max_teachers;
  let maxTeachers: number;
  if (rawMaxTeachers === undefined || rawMaxTeachers === null) {
    maxTeachers = MAX_TEACHERS_DEFAULT;
  } else if (typeof rawMaxTeachers === 'number') {
    maxTeachers = rawMaxTeachers;
  } else {
    return sendApiError(res, `max_teachers must be an integer between ${MAX_TEACHERS_MIN} and ${MAX_TEACHERS_MAX}`, 400);
  }
  if (!Number.isInteger(maxTeachers) || maxTeachers < MAX_TEACHERS_MIN || maxTeachers > MAX_TEACHERS_MAX) {
    return sendApiError(res, `max_teachers must be an integer between ${MAX_TEACHERS_MIN} and ${MAX_TEACHERS_MAX}`, 400);
  }

  const rawDescription = body.description;
  let description: string | null = null;
  if (rawDescription !== undefined && rawDescription !== null) {
    if (typeof rawDescription !== 'string') {
      return sendApiError(res, 'description must be a string', 400);
    }
    if (rawDescription.length > DESCRIPTION_MAX) {
      return sendApiError(res, `description must be at most ${DESCRIPTION_MAX} characters`, 400);
    }
    description = rawDescription;
  }

  if (role === 'equipo_directivo') {
    if (typeof edSchoolId !== 'number' || edSchoolId !== schoolId) {
      return res.status(403).json({ error: FORBIDDEN_MESSAGE });
    }
  }

  const supabase = createServiceRoleClient();

  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('id, has_generations')
    .eq('id', schoolId)
    .single<SchoolRow>();

  if (schoolError || !school) {
    return sendApiError(res, 'School not found', 404, schoolError?.message);
  }

  const schoolHasGenerations = school.has_generations === true;

  let finalGenerationId: string | null;
  if (schoolHasGenerations) {
    if (!generationId) {
      return res.status(400).json({
        error: 'generation_required',
        message: 'Esta escuela utiliza generaciones. Debe seleccionar una generación.',
      });
    }
    const { data: generation, error: generationError } = await supabase
      .from('generations')
      .select('id')
      .eq('id', generationId)
      .eq('school_id', schoolId)
      .single();
    if (generationError || !generation) {
      return res.status(400).json({
        error: 'generation_invalid',
        message: 'La generación seleccionada no es válida para esta escuela.',
      });
    }
    finalGenerationId = generationId;
  } else {
    if (generationId) {
      console.warn(
        '[admin/growth-communities POST] generation_id provided for school without generations; ignoring',
        { schoolId, generationId },
      );
    }
    finalGenerationId = null;
  }

  const insertPayload = {
    name,
    school_id: schoolId,
    generation_id: finalGenerationId,
    max_teachers: maxTeachers,
    description,
  };

  const { data: community, error: insertError } = await supabase
    .from('growth_communities')
    .insert(insertPayload)
    .select('id, name, school_id, generation_id, max_teachers, description')
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === '23505') {
      return res.status(409).json({
        error: 'duplicate_name',
        message: `Ya existe una comunidad con el nombre "${name}" en esta escuela.`,
      });
    }
    return sendApiError(res, 'create_failed', 500, insertError.message);
  }

  return res.status(201).json({ community });
}
