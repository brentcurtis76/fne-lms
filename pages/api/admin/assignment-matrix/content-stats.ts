import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/admin/assignment-matrix/content-stats
 *
 * Returns courses and learning paths with assignment counts for the Content Batch View.
 *
 * Query params:
 * - contentType: 'courses' | 'learning_paths' | 'all' (default: 'all')
 * - search: search query for title/description
 * - page: page number (default: 1)
 * - pageSize: items per page (default: 20, max: 50)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Método ${req.method} no permitido` });
  }

  try {
    const supabaseClient = createPagesServerClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is admin or consultor
    const { data: userRoles } = await supabaseService
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const isAdmin = userRoles?.some(r => r.role_type === 'admin');
    const isConsultor = userRoles?.some(r => r.role_type === 'consultor');

    if (!isAdmin && !isConsultor) {
      return res.status(403).json({ error: 'Solo administradores y consultores pueden acceder' });
    }

    // Parse query params
    const contentType = (req.query.contentType as string) || 'all';
    const search = (req.query.search as string)?.trim() || '';
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const pageSizeParam = Math.max(parseInt((req.query.pageSize as string) || '20', 10), 1);
    const pageSize = Math.min(pageSizeParam, 50);
    const offset = (page - 1) * pageSize;

    const result: {
      courses?: CourseWithStats[];
      learningPaths?: LearningPathWithStats[];
      totalCourses?: number;
      totalLearningPaths?: number;
      page: number;
      pageSize: number;
    } = { page, pageSize };

    // Fetch courses with assignment stats
    if (contentType === 'all' || contentType === 'courses') {
      const coursesData = await fetchCoursesWithStats(supabaseService, search, offset, pageSize);
      result.courses = coursesData.courses;
      result.totalCourses = coursesData.total;
    }

    // Fetch learning paths with assignment stats
    if (contentType === 'all' || contentType === 'learning_paths') {
      const lpData = await fetchLearningPathsWithStats(supabaseService, search, offset, pageSize);
      result.learningPaths = lpData.learningPaths;
      result.totalLearningPaths = lpData.total;
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[content-stats API] Error:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener estadísticas de contenido' });
  }
}

interface CourseWithStats {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  instructorName: string | null;
  createdAt: string;
  // Assignment stats
  directAssigneeCount: number;
  lpAssigneeCount: number;
  totalAssigneeCount: number;
  learningPathCount: number;
}

interface LearningPathWithStats {
  id: string;
  name: string;
  description: string | null;
  courseCount: number;
  createdAt: string;
  // Assignment stats
  directAssigneeCount: number;
  groupAssigneeCount: number;
  totalAssigneeCount: number;
}

async function fetchCoursesWithStats(
  supabase: any,
  search: string,
  offset: number,
  pageSize: number
): Promise<{ courses: CourseWithStats[]; total: number }> {
  // Build base query for courses
  let query = supabase
    .from('courses')
    .select(`
      id,
      title,
      description,
      thumbnail_url,
      created_at,
      instructor:instructors(full_name)
    `, { count: 'exact' })
    .order('title', { ascending: true });

  if (search) {
    // Escape special SQL LIKE pattern characters to prevent injection
    const sanitized = search
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .trim()
      .toLowerCase();
    query = query.or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data: courses, count, error } = await query;

  if (error) {
    console.error('[content-stats] Error fetching courses:', error);
    throw error;
  }

  if (!courses || courses.length === 0) {
    return { courses: [], total: count || 0 };
  }

  const courseIds = courses.map(c => c.id);

  // Get direct assignment counts (course_assignments table)
  const { data: directAssignments } = await supabase
    .from('course_assignments')
    .select('course_id')
    .in('course_id', courseIds);

  // Count direct assignments per course
  const directCounts = new Map<string, number>();
  (directAssignments || []).forEach(a => {
    directCounts.set(a.course_id, (directCounts.get(a.course_id) || 0) + 1);
  });

  // Get LP membership for each course (how many LPs contain it)
  const { data: lpCourses } = await supabase
    .from('learning_path_courses')
    .select('course_id, learning_path_id')
    .in('course_id', courseIds);

  // Count LPs per course
  const lpCounts = new Map<string, Set<string>>();
  (lpCourses || []).forEach(lpc => {
    if (!lpCounts.has(lpc.course_id)) {
      lpCounts.set(lpc.course_id, new Set());
    }
    lpCounts.get(lpc.course_id)!.add(lpc.learning_path_id);
  });

  // Get LP assignment counts (users assigned to LPs that contain these courses)
  const lpIds = new Set<string>();
  lpCounts.forEach(lpSet => lpSet.forEach(lpId => lpIds.add(lpId)));

  let lpAssignmentCounts = new Map<string, number>();
  if (lpIds.size > 0) {
    const { data: lpAssignments } = await supabase
      .from('learning_path_assignments')
      .select('path_id, user_id')
      .in('path_id', Array.from(lpIds))
      .not('user_id', 'is', null);

    // Count users per LP
    const usersPerLP = new Map<string, Set<string>>();
    (lpAssignments || []).forEach(a => {
      if (!usersPerLP.has(a.path_id)) {
        usersPerLP.set(a.path_id, new Set());
      }
      if (a.user_id) {
        usersPerLP.get(a.path_id)!.add(a.user_id);
      }
    });

    // For each course, count unique users assigned via LPs
    courseIds.forEach(courseId => {
      const courseLPs = lpCounts.get(courseId);
      if (courseLPs) {
        const usersViaCourse = new Set<string>();
        courseLPs.forEach(lpId => {
          const lpUsers = usersPerLP.get(lpId);
          if (lpUsers) {
            lpUsers.forEach(userId => usersViaCourse.add(userId));
          }
        });
        lpAssignmentCounts.set(courseId, usersViaCourse.size);
      }
    });
  }

  // Format response
  const formattedCourses: CourseWithStats[] = courses.map((course: any) => {
    const directCount = directCounts.get(course.id) || 0;
    const lpCount = lpAssignmentCounts.get(course.id) || 0;
    // Total is union of direct and LP (may overlap, but we show both counts)
    // For simplicity, we show both counts separately
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnail_url,
      instructorName: course.instructor?.full_name || null,
      createdAt: course.created_at,
      directAssigneeCount: directCount,
      lpAssigneeCount: lpCount,
      totalAssigneeCount: directCount + lpCount, // Note: may count some users twice if both direct and LP
      learningPathCount: lpCounts.get(course.id)?.size || 0
    };
  });

  return { courses: formattedCourses, total: count || 0 };
}

async function fetchLearningPathsWithStats(
  supabase: any,
  search: string,
  offset: number,
  pageSize: number
): Promise<{ learningPaths: LearningPathWithStats[]; total: number }> {
  // Build base query for learning paths
  let query = supabase
    .from('learning_paths')
    .select(`
      id,
      name,
      description,
      created_at
    `, { count: 'exact' })
    .order('name', { ascending: true });

  if (search) {
    // Escape special SQL LIKE pattern characters to prevent injection
    const sanitized = search
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .trim()
      .toLowerCase();
    query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data: learningPaths, count, error } = await query;

  if (error) {
    console.error('[content-stats] Error fetching learning paths:', error);
    throw error;
  }

  if (!learningPaths || learningPaths.length === 0) {
    return { learningPaths: [], total: count || 0 };
  }

  const lpIds = learningPaths.map(lp => lp.id);

  // Get course counts per LP
  const { data: lpCourses } = await supabase
    .from('learning_path_courses')
    .select('learning_path_id')
    .in('learning_path_id', lpIds);

  const courseCounts = new Map<string, number>();
  (lpCourses || []).forEach(lpc => {
    courseCounts.set(lpc.learning_path_id, (courseCounts.get(lpc.learning_path_id) || 0) + 1);
  });

  // Get direct user assignments (user_id not null)
  const { data: directAssignments } = await supabase
    .from('learning_path_assignments')
    .select('path_id, user_id')
    .in('path_id', lpIds)
    .not('user_id', 'is', null);

  const directCounts = new Map<string, number>();
  (directAssignments || []).forEach(a => {
    directCounts.set(a.path_id, (directCounts.get(a.path_id) || 0) + 1);
  });

  // Get group assignments (group_id not null) - count unique groups
  const { data: groupAssignments } = await supabase
    .from('learning_path_assignments')
    .select('path_id, group_id')
    .in('path_id', lpIds)
    .not('group_id', 'is', null);

  const groupCounts = new Map<string, number>();
  (groupAssignments || []).forEach(a => {
    groupCounts.set(a.path_id, (groupCounts.get(a.path_id) || 0) + 1);
  });

  // Format response
  const formattedLPs: LearningPathWithStats[] = learningPaths.map((lp: any) => {
    const directCount = directCounts.get(lp.id) || 0;
    const groupCount = groupCounts.get(lp.id) || 0;
    return {
      id: lp.id,
      name: lp.name,
      description: lp.description,
      courseCount: courseCounts.get(lp.id) || 0,
      createdAt: lp.created_at,
      directAssigneeCount: directCount,
      groupAssigneeCount: groupCount,
      totalAssigneeCount: directCount + groupCount
    };
  });

  return { learningPaths: formattedLPs, total: count || 0 };
}
