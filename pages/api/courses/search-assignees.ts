import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';
import { v4 as uuidv4 } from 'uuid';

interface SearchAssigneesRequest {
  courseId: string;
  query: string;
  schoolId?: string;
  page?: number;
  pageSize?: number;
}

interface SearchResult {
  id: string;
  name: string;
  email: string;
  school_name?: string;
  isAlreadyAssigned: boolean;
}

interface SearchAssigneesResponse {
  results: SearchResult[];
  hasMore: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userLimit.count++;
  return true;
}

// UUID validation helper
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Sanitize search query
function sanitizeQuery(query: string): string {
  // Remove special characters that could break SQL
  return query.replace(/[%_\\]/g, '\\$&').trim();
}

// Check if user has permission to assign courses
async function hasAssignPermission(supabaseClient: any, userId: string): Promise<boolean> {
  const { data: roles } = await supabaseClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!roles || roles.length === 0) return false;

  const userRoles = roles.map((r: any) => r.role_type);
  return userRoles.includes('admin') || userRoles.includes('consultor');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Generate request ID and start timer for observability
  const requestId = uuidv4();
  const startTime = Date.now();

  console.log(`[Course Search Assignees] Request started`, { requestId, method: req.method });

  // Only allow POST method
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);

  if (error || !user) {
    console.log(`[Course Search Assignees] Auth failed`, { requestId });
    return sendAuthError(res, 'Authentication required');
  }

  // Check rate limit
  if (!checkRateLimit(user.id)) {
    console.warn(`[Course Search Assignees] Rate limit exceeded`, {
      requestId,
      userId: user.id,
      durationMs: Date.now() - startTime
    });
    return res.status(429).json({
      error: 'Demasiadas solicitudes. Intentalo de nuevo en un momento.'
    });
  }

  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  // Declare variables outside try block for error handling
  let courseId: string = '';
  let query: string = '';
  let schoolId: string | undefined;
  let safePage: number = 1;
  let safePageSize: number = 20;

  try {
    // Check if user has permission to assign courses
    const hasPermission = await hasAssignPermission(supabaseClient, user.id);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'No tienes permiso para asignar cursos'
      });
    }

    // Validate request body
    const bodyData = req.body as SearchAssigneesRequest;
    courseId = bodyData.courseId;
    query = bodyData.query;
    schoolId = bodyData.schoolId;
    const page = bodyData.page || 1;
    const pageSize = bodyData.pageSize || 20;

    if (!courseId || typeof query !== 'string') {
      console.log(`[Course Search Assignees] Missing required fields`, { requestId });
      return res.status(400).json({
        error: 'courseId y query son requeridos'
      });
    }

    // Validate UUIDs
    if (!isValidUUID(courseId)) {
      console.log(`[Course Search Assignees] Invalid courseId UUID`, { requestId, courseId });
      return res.status(400).json({
        error: 'courseId invalido - debe ser un UUID valido'
      });
    }

    if (schoolId && !isValidUUID(schoolId) && !/^\d+$/.test(schoolId)) {
      console.log(`[Course Search Assignees] Invalid schoolId`, { requestId, schoolId });
      return res.status(400).json({
        error: 'schoolId invalido - debe ser un ID valido'
      });
    }

    // Cap page size to maximum 50
    safePageSize = Math.min(Math.max(1, pageSize || 20), 50);
    safePage = Math.max(1, page);

    // Sanitize query
    const sanitizedQuery = sanitizeQuery(query);

    // Verify the course exists
    const { data: course } = await supabaseClient
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .single();

    if (!course) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    // Calculate pagination with safe values
    const offset = (safePage - 1) * safePageSize;
    const searchQuery = sanitizedQuery.toLowerCase();

    let results: SearchResult[] = [];
    let totalCount = 0;

    // Search users with optional school filtering
    let users, count, usersError;

    if (schoolId) {
      // Filter by school with explicit two-step to avoid ambiguous embeds
      // Use service role client to bypass RLS on user_roles
      console.log(`[Course Search Assignees] Filtering users by school: ${schoolId}`);

      const serviceClient = createServiceRoleClient();
      const { data: userRoles, error: rolesError } = await serviceClient
        .from('user_roles')
        .select('user_id')
        .eq('school_id', schoolId)
        .eq('is_active', true);

      if (rolesError) {
        console.error('[Course Search Assignees] Failed to query user roles for school filter:', rolesError);
        throw new Error('No se pudo filtrar por colegio: error al consultar roles de usuario');
      }

      if (!userRoles || userRoles.length === 0) {
        console.log(`[Course Search Assignees] No users found for school: ${schoolId}`);
        users = [];
        count = 0;
        usersError = null;
      } else {
        console.log(`[Course Search Assignees] Found ${userRoles.length} users in school: ${schoolId}`);
        const userIds = userRoles.map(ur => ur.user_id);

        // Fetch school name once for display
        const { data: schoolRecord } = await serviceClient
          .from('schools')
          .select('name')
          .eq('id', schoolId)
          .single();
        const schoolName = schoolRecord?.name;

        // Get profiles for those users (no joins to avoid relationship ambiguity)
        const profileClient = createServiceRoleClient();
        let userQuery = profileClient
          .from('profiles')
          .select(
            `
              id,
              first_name,
              last_name,
              email
            `,
            { count: 'exact' }
          )
          .in('id', userIds);

        // Apply search filter if query is not empty
        if (searchQuery) {
          userQuery = userQuery.or(
            `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
          );
        }

        // Apply pagination
        const result = await userQuery
          .order('first_name')
          .range(offset, offset + safePageSize - 1);

        users = result.data?.map((u: any) => ({ ...u, school_name: schoolName })) || [];
        count = result.count;
        usersError = result.error;
      }
    } else {
      // No school filter - search all users
      let userQuery = supabaseClient
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email
        `, { count: 'exact' });

      // Apply search filter if query is not empty
      if (searchQuery) {
        userQuery = userQuery.or(
          `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
        );
      }

      // Apply pagination
      const result = await userQuery
        .order('first_name')
        .range(offset, offset + safePageSize - 1);

      users = result.data;
      count = result.count;
      usersError = result.error;
    }

    if (usersError) throw usersError;

    totalCount = count || 0;

    // Get existing assignments for these users
    const userIds = (users || []).map(u => u.id);

    let assignments = [];
    if (userIds.length > 0) {
      const { data: assignmentData, error: assignmentError } = await supabaseClient
        .from('course_assignments')
        .select('teacher_id')
        .eq('course_id', courseId)
        .in('teacher_id', userIds);

      if (assignmentError) {
        console.error('Assignment query error:', assignmentError);
      } else {
        assignments = assignmentData || [];
      }
    }

    const assignedUserIds = new Set(assignments.map(a => a.teacher_id));

    // Format results
    results = (users || []).map(user => {
      const schoolName = user.school_name || undefined;
      return {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`.trim(),
        email: user.email,
        school_name: schoolName,
        isAlreadyAssigned: assignedUserIds.has(user.id)
      };
    });

    // Calculate if there are more pages
    const hasMore = totalCount > offset + safePageSize;

    const response: SearchAssigneesResponse = {
      results,
      hasMore,
      totalCount,
      page: safePage,
      pageSize: safePageSize
    };

    console.log(`[Course Search Assignees] Success:`, {
      requestId,
      query: query || '(empty)',
      schoolId: schoolId || '(no filter)',
      resultsCount: results.length,
      totalCount,
      page: safePage,
      pageSize: safePageSize,
      hasMore,
      durationMs: Date.now() - startTime
    });

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('[Course Search Assignees] Error details:', {
      requestId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      courseId,
      query,
      schoolId,
      page: safePage,
      pageSize: safePageSize,
      durationMs: Date.now() - startTime
    });

    // Return more specific error messages
    if (error.message?.includes('No se pudo filtrar')) {
      return res.status(500).json({
        error: error.message,
        details: 'Error al aplicar el filtro de colegio'
      });
    }

    return res.status(500).json({
      error: error.message || 'Error al buscar usuarios',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
