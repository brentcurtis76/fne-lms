import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdminOrEquipoDirectivo,
  createServiceRoleClient,
} from '../../../lib/api-auth';
import { SCHOOL_SCOPED_ROLES } from '../../../utils/roleUtils';

const ROLE_PRIORITY = ['admin','consultor','equipo_directivo','supervisor_de_red','community_manager','lider_generacion','lider_comunidad','docente','encargado_licitacion'];

// Cap on how many user_ids we send in a single `.in()` call (currently only
// the global-role and cross-school prefetch legs). PostgREST encodes these
// as URL filters; large schools (250+ in-school users) can otherwise push
// the request URL past common proxy / load-balancer limits (~8KB) and
// trigger 414s or truncated filters. Chunking keeps every outbound request
// bounded.
const USER_ID_BATCH = 100;

const chunkIds = <T>(values: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
};

// PostgREST `in`/`not.in` filters expect a parenthesized list. Quoting each
// value is the documented-safe form: it survives values that contain commas,
// parens, or quotes — even though the values we currently pass (UUIDs, role
// type identifiers) never do. supabase-js's `.not()` is pure string interp,
// so the typed array form is not available here. Embedded `\` and `"` are
// escaped defensively so a future caller passing arbitrary strings can't
// break out of the quoted value.
export const toQuotedInList = (values: readonly string[]): string =>
  `(${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt((req.query.pageSize as string) || '25', 10), 1), 100);
    const search = (req.query.search as string)?.trim() || '';
    const status = (req.query.status as string) || 'all';
    const querySchoolId = (req.query.schoolId as string) || '';
    const communityId = (req.query.communityId as string) || '';
    const offset = (page - 1) * pageSize;

    const { isAuthorized, role, schoolId: edSchoolId, error: authError } =
      await checkIsAdminOrEquipoDirectivo(req, res);

    if (authError) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Solo administradores o equipo directivo pueden ver usuarios' });
    }

    if (role === 'equipo_directivo' && typeof edSchoolId !== 'number') {
      return res.status(403).json({ error: 'School context missing for equipo_directivo' });
    }

    const isEdScope = role === 'equipo_directivo' && typeof edSchoolId === 'number';
    const selectedSchoolId = isEdScope ? String(edSchoolId) : querySchoolId;

    // ED is already scoped to a single school. communityId is admin-only tooling;
    // reject loudly so misuse surfaces instead of silently dropping the filter.
    if (isEdScope && communityId) {
      return res.status(400).json({ error: 'communityId no está disponible para equipo_directivo' });
    }

    const supabaseService = createServiceRoleClient();

    const effectiveCommunityId = isEdScope ? '' : communityId;

    // ED scope: a user may have profile.school_id = edSchoolId yet hold an
    // active global (non-school-scoped) role like admin/consultor, OR an
    // active school-scoped role attached to a DIFFERENT school. Such users
    // must not appear in the ED's list — every write attempt against them
    // would be rejected by the target-role gate (yielding "ghost rows").
    // Pre-fetch in-school users (with approval_status, F2: widened so we can
    // compute exact summary counts in memory) so we can derive the excluded
    // set and apply client-side filtering after the main page is fetched.
    let edExcludedUserIds: string[] = [];
    let edInSchoolUsers: Array<{ id: string; approval_status: string | null }> = [];
    if (isEdScope) {
      // PostgREST caps a single SELECT at 1000 rows by default. Schools larger
      // than that would otherwise have their tail-end users silently skip the
      // global-role exclusion check below and "ghost" into the ED list,
      // since the write-path target-role gate would still reject every edit.
      // Page through .range() until a partial batch lands.
      const PROFILE_PREFETCH_BATCH = 1000;
      const collected: Array<{ id: string; approval_status: string | null }> = [];
      let prefetchFrom = 0;
      while (true) {
        // Stable ordering before .range(...) is required: PostgREST does not
        // guarantee row order without an explicit ORDER BY, so paginated
        // prefetch could otherwise duplicate or skip ids on retries / heap
        // reordering. `id` is the natural primary key and is monotonic enough
        // for deterministic batching.
        const { data: pageRows, error: inSchoolErr } = await supabaseService
          .from('profiles')
          .select('id, approval_status')
          .eq('school_id', edSchoolId)
          .order('id', { ascending: true })
          .range(prefetchFrom, prefetchFrom + PROFILE_PREFETCH_BATCH - 1);

        if (inSchoolErr) {
          console.error('[users API] Error fetching in-school user ids:', inSchoolErr);
          return res.status(500).json({ error: 'Error al filtrar usuarios' });
        }

        const rows = (pageRows ?? []) as Array<{ id?: string | null; approval_status?: string | null }>;
        for (const row of rows) {
          if (row.id) collected.push({ id: row.id, approval_status: row.approval_status ?? null });
        }
        if (rows.length < PROFILE_PREFETCH_BATCH) break;
        prefetchFrom += PROFILE_PREFETCH_BATCH;
      }

      const seenIds = new Set<string>();
      edInSchoolUsers = collected.filter((u) => {
        if (seenIds.has(u.id)) return false;
        seenIds.add(u.id);
        return true;
      });

      const inSchoolUserIds = edInSchoolUsers.map((u) => u.id);

      if (inSchoolUserIds.length > 0) {
        // F1 URL-length scalability: chunk `.in('user_id', ...)` so the encoded
        // filter never exceeds USER_ID_BATCH ids per request. A school with
        // 250 users issues 3 batches per leg (100/100/50). Results from each
        // batch fold into a single excluded-user Set.
        const excludedSet = new Set<string>();
        const inSchoolIdBatches = chunkIds(inSchoolUserIds, USER_ID_BATCH);

        for (const idBatch of inSchoolIdBatches) {
          const { data: globalRoleHolders, error: globalRoleErr } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('is_active', true)
            .in('user_id', idBatch)
            .not('role_type', 'in', toQuotedInList(SCHOOL_SCOPED_ROLES));

          if (globalRoleErr) {
            console.error('[users API] Error fetching global-role holders:', globalRoleErr);
            return res.status(500).json({ error: 'Error al filtrar usuarios' });
          }

          for (const row of globalRoleHolders ?? []) {
            if ((row as any).user_id) excludedSet.add((row as any).user_id);
          }
        }

        // F1 second leg: a user with profile.school_id = edSchoolId may still
        // hold an active school-scoped role attached to a DIFFERENT school
        // (e.g. docente at school 99 while the profile lives at school 42).
        // Every ED write against them would be rejected by the cross-school
        // target gate, so the row would be a ghost. `not.eq` already excludes
        // NULL school_id rows (NULL <> x is NULL in SQL → not selected), so
        // null-school rows are not mistakenly flagged here.
        for (const idBatch of inSchoolIdBatches) {
          const { data: crossSchoolRoleHolders, error: crossSchoolErr } = await supabaseService
            .from('user_roles')
            .select('user_id')
            .eq('is_active', true)
            .in('user_id', idBatch)
            .in('role_type', SCHOOL_SCOPED_ROLES as readonly string[])
            .not('school_id', 'eq', edSchoolId);

          if (crossSchoolErr) {
            console.error('[users API] Error fetching cross-school role holders:', crossSchoolErr);
            return res.status(500).json({ error: 'Error al filtrar usuarios' });
          }

          for (const row of crossSchoolRoleHolders ?? []) {
            if ((row as any).user_id) excludedSet.add((row as any).user_id);
          }
        }

        edExcludedUserIds = Array.from(excludedSet);
      }
    }

    let allowedUserIds: string[] | null = null;
    if (effectiveCommunityId) {
      const { data: communityUsers, error: communityError } = await supabaseService
        .from('user_roles')
        .select('user_id')
        .eq('community_id', effectiveCommunityId)
        .eq('is_active', true);

      if (communityError) {
        console.error('[users API] Error fetching community filter:', communityError);
        return res.status(500).json({ error: 'Error al filtrar por comunidad' });
      }

      allowedUserIds = (communityUsers || []).map(row => row.user_id);
      if (!allowedUserIds.length) {
        return res.status(200).json({ page, pageSize, total: 0, users: [], schools: [] });
      }
    }

    let profileQuery = supabaseService
      .from('profiles')
      .select(
        `id,email,first_name,last_name,school_id,approval_status,created_at,external_school_affiliation,can_run_qa_tests,
         school:schools(id,name)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (search) {
      profileQuery = profileQuery.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    if (status !== 'all') {
      profileQuery = profileQuery.eq('approval_status', status);
    }

    if (selectedSchoolId) {
      profileQuery = profileQuery.eq('school_id', parseInt(selectedSchoolId, 10));
    }

    if (allowedUserIds) {
      profileQuery = profileQuery.in('id', allowedUserIds);
    }

    // F2: the main paginated query no longer carries a `.not('id', 'in', ...)`
    // exclusion clause. The chunked `.not()` strategy doesn't scale — for
    // schools with hundreds of ghost rows, the chained filters approached the
    // ~8KB URL-length limit and forced multiple round-trips just to read one
    // page. Instead, fetch the full page, then drop excludedSet members in
    // memory below. Exact summary counts come from the prefetched in-school
    // users (which already carry approval_status) — see the summary block.
    const excludedSet = new Set<string>(edExcludedUserIds);

    const { data: profiles, count, error: profilesError } = await profileQuery;

    if (profilesError) {
      console.error('[users API] Error fetching profiles:', profilesError);
      return res.status(500).json({ error: 'Error al obtener usuarios' });
    }

    let summary: { total: number; pending: number; approved: number };
    let schools: Array<{ id: string; name: string }>;

    if (isEdScope) {
      // F2 exact-count strategy (a): compute counts in memory from the
      // widened prefetch (now includes approval_status), removing excludedSet
      // members. No separate count round-trips needed for ED scope.
      const visibleInSchool = edInSchoolUsers.filter((u) => !excludedSet.has(u.id));
      summary = {
        total: visibleInSchool.length,
        pending: visibleInSchool.filter((u) => u.approval_status === 'pending').length,
        approved: visibleInSchool.filter((u) => u.approval_status === 'approved').length,
      };

      const schoolsRes = await supabaseService
        .from('schools')
        .select('id, name')
        .eq('id', edSchoolId as number)
        .order('name', { ascending: true });
      schools = (schoolsRes.data || []).map((s: any) => ({
        id: s.id.toString(),
        name: s.name,
      }));
    } else {
      const totalCountQuery = supabaseService
        .from('profiles')
        .select('id', { head: true, count: 'exact' });
      const pendingCountQuery = supabaseService
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .eq('approval_status', 'pending');
      const approvedCountQuery = supabaseService
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .eq('approval_status', 'approved');
      const schoolsQuery = supabaseService
        .from('schools')
        .select('id, name')
        .order('name', { ascending: true });

      const [totalCountRes, pendingCountRes, approvedCountRes, schoolsRes] = await Promise.all([
        totalCountQuery,
        pendingCountQuery,
        approvedCountQuery,
        schoolsQuery,
      ]);

      summary = {
        total: totalCountRes.count || 0,
        pending: pendingCountRes.count || 0,
        approved: approvedCountRes.count || 0,
      };
      schools = (schoolsRes.data || []).map((s: any) => ({
        id: s.id.toString(),
        name: s.name,
      }));
    }

    // F2 client-side exclusion: drop excludedSet members from the page before
    // building the response. Page may end up shorter than pageSize — that's
    // an accepted trade-off (avoids large `.not('id', 'in', ...)` filters).
    const profileRows = profiles || [];
    const users = isEdScope
      ? profileRows.filter((u: any) => !excludedSet.has(u.id))
      : profileRows;

    if (users.length === 0) {
      return res.status(200).json({ page, pageSize, total: count || 0, users: [], summary, schools });
    }

    const userIds = users.map(user => user.id);

    let rolesQuery = supabaseService
      .from('user_roles')
      .select(`
        *,
        school:schools(*),
        generation:generations(*),
        community:growth_communities(*, school:schools(*), generation:generations(*))
      `)
      .in('user_id', userIds)
      .eq('is_active', true);

    if (isEdScope) {
      // Sole read-path role-type filter for ED scope: restrict the user_roles
      // query to school-scoped role types via SQL. There is no in-memory
      // re-check — defense-in-depth against bad/global rows is enforced on
      // the write paths (assign-role, create-user, update-user, etc.).
      //
      // Intentional contract: the `school_id.is.null` branch surfaces legacy
      // rows where school-scoped role types were inserted before per-row
      // school_id was consistently populated. The outer `userIds` `.in(...)`
      // already restricts these rows to in-school users (profile.school_id
      // = edSchoolId), so a null school_id on the role row cannot leak a
      // cross-school user — only the role row itself may report
      // school_id=null. See test "ED: user_roles rows for in-school users
      // with school_id=NULL are still returned" in users-list.test.ts.
      //
      // TODO(PR #19 follow-up: backfill user_roles.school_id + NOT NULL
      // migration): remove the school_id.is.null branch once
      // user_roles.school_id is backfilled for school-scoped role rows AND
      // enforced NOT NULL via a CHECK constraint or migration. The null
      // branch surfaces legacy data; outer user_ids.in(...) prevents
      // cross-school leakage in the interim.
      rolesQuery = rolesQuery
        .or(`school_id.is.null,school_id.eq.${edSchoolId}`)
        .in('role_type', SCHOOL_SCOPED_ROLES as readonly string[]);
    }

    const { data: rolesData, error: rolesError } = await rolesQuery;

    if (rolesError) {
      console.error('[users API] Error fetching roles:', rolesError);
      return res.status(500).json({ error: 'Error al obtener roles de usuarios' });
    }

    const { data: consultantData, error: consultantError } = await supabaseService
      .from('consultant_assignments')
      .select(`
        *,
        student:student_id(id, first_name, last_name, email)
      `)
      .in('consultant_id', userIds)
      .eq('is_active', true);

    if (consultantError) {
      console.error('[users API] Error fetching consultant assignments:', consultantError);
      return res.status(500).json({ error: 'Error al obtener asignaciones de consultor' });
    }

    const { data: studentData, error: studentError } = await supabaseService
      .from('consultant_assignments')
      .select(`
        *,
        consultant:consultant_id(id, first_name, last_name, email)
      `)
      .in('student_id', userIds)
      .eq('is_active', true);

    if (studentError) {
      console.error('[users API] Error fetching student assignments:', studentError);
      return res.status(500).json({ error: 'Error al obtener asignaciones de estudiantes' });
    }

    const uniqueCommunityIds = Array.from(new Set((rolesData || [])
      .map(role => role.community_id)
      .filter((value): value is string => Boolean(value))));

    let communityAssignmentsData: any[] = [];
    if (uniqueCommunityIds.length > 0) {
      const { data: communityAssignments, error: communityAssignmentsError } = await supabaseService
        .from('consultant_assignments')
        .select(`
          *,
          consultant:consultant_id(id, first_name, last_name, email)
        `)
        .in('community_id', uniqueCommunityIds)
        .is('student_id', null)
        .eq('is_active', true);

      if (communityAssignmentsError) {
        console.error('[users API] Error fetching community assignments:', communityAssignmentsError);
        return res.status(500).json({ error: 'Error al obtener asignaciones por comunidad' });
      }

      communityAssignmentsData = communityAssignments || [];
    }

    const { data: courseData, error: courseError } = await supabaseService
      .from('course_assignments')
      .select(`
        teacher_id,
        assigned_at,
        course:courses(id, title, description)
      `)
      .in('teacher_id', userIds);

    if (courseError) {
      console.error('[users API] Error fetching course assignments:', courseError);
      return res.status(500).json({ error: 'Error al obtener cursos asignados' });
    }

    // Fetch learning path assignments - direct user assignments
    const { data: directLPData, error: directLPError } = await supabaseService
      .from('learning_path_assignments')
      .select(`
        user_id,
        assigned_at,
        path:learning_paths(id, name, description)
      `)
      .in('user_id', userIds);

    if (directLPError) {
      console.error('[users API] Error fetching direct learning path assignments:', directLPError);
      return res.status(500).json({ error: 'Error al obtener vías de aprendizaje asignadas' });
    }

    // Fetch learning path assignments - group-based (using uniqueCommunityIds already extracted)
    let groupLPData: any[] = [];
    if (uniqueCommunityIds.length > 0) {
      const { data: groupLP, error: groupLPError } = await supabaseService
        .from('learning_path_assignments')
        .select(`
          group_id,
          assigned_at,
          path:learning_paths(id, name, description)
        `)
        .in('group_id', uniqueCommunityIds);

      if (groupLPError) {
        console.error('[users API] Error fetching group learning path assignments:', groupLPError);
        return res.status(500).json({ error: 'Error al obtener vías de aprendizaje de grupos' });
      }
      groupLPData = groupLP || [];
    }

    const rolesMap = new Map<string, any[]>();
    (rolesData || []).forEach(role => {
      const arr = rolesMap.get(role.user_id) || [];
      arr.push(role);
      rolesMap.set(role.user_id, arr);
    });

    const sortRoles = (roles: any[]) => roles.sort((a, b) => {
      const aIndex = ROLE_PRIORITY.indexOf(a.role_type);
      const bIndex = ROLE_PRIORITY.indexOf(b.role_type);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });

    const consultantMap = new Map<string, any[]>();
    (consultantData || []).forEach(entry => {
      const arr = consultantMap.get(entry.consultant_id) || [];
      arr.push(entry);
      consultantMap.set(entry.consultant_id, arr);
    });

    const studentMap = new Map<string, any[]>();
    (studentData || []).forEach(entry => {
      const arr = studentMap.get(entry.student_id) || [];
      arr.push(entry);
      studentMap.set(entry.student_id, arr);
    });

    const communityAssignmentsMap = new Map<string, any[]>();
    communityAssignmentsData.forEach(entry => {
      if (!entry.community_id) return;
      (rolesData || [])
        .filter(role => role.community_id === entry.community_id)
        .forEach(role => {
          const arr = communityAssignmentsMap.get(role.user_id) || [];
          arr.push(entry);
          communityAssignmentsMap.set(role.user_id, arr);
        });
    });

    const courseMap = new Map<string, any[]>();
    (courseData || []).forEach(entry => {
      const arr = courseMap.get(entry.teacher_id) || [];
      arr.push(entry);
      courseMap.set(entry.teacher_id, arr);
    });

    // Build learning path map - combine direct and group-based assignments
    const learningPathMap = new Map<string, any[]>();

    // Add direct assignments
    (directLPData || []).forEach(entry => {
      if (!entry.user_id) return;
      const arr = learningPathMap.get(entry.user_id) || [];
      arr.push({ ...entry, assignment_type: 'direct' });
      learningPathMap.set(entry.user_id, arr);
    });

    // Add group-based assignments (map group_id back to users via their community membership)
    groupLPData.forEach(entry => {
      if (!entry.group_id) return;
      // Find users who belong to this community/group
      (rolesData || [])
        .filter(role => role.community_id === entry.group_id)
        .forEach(role => {
          const arr = learningPathMap.get(role.user_id) || [];
          // Avoid duplicates if same path assigned both directly and via group
          const alreadyHasPath = arr.some(a => a.path?.id === entry.path?.id);
          if (!alreadyHasPath) {
            arr.push({ ...entry, assignment_type: 'group' });
            learningPathMap.set(role.user_id, arr);
          }
        });
    });

    const payload = users.map((user: any) => {
      const roles = sortRoles([...(rolesMap.get(user.id) || [])]);
      const highestRole = roles[0]?.role_type || user.role || null;
      const schools = Array.isArray(user.school) ? user.school[0] : user.school;
      const schoolRelation = schools ? { id: schools.id, name: schools.name } : null;
      return {
        ...user,
        school: schoolRelation?.name || user.school || null,
        school_relation: schoolRelation,
        role: highestRole,
        user_roles: roles,
        consultant_assignments: consultantMap.get(user.id) || [],
        student_assignments: [
          ...(studentMap.get(user.id) || []),
          ...(communityAssignmentsMap.get(user.id) || [])
        ],
        course_assignments: courseMap.get(user.id) || [],
        learning_path_assignments: learningPathMap.get(user.id) || []
      };
    });

    return res.status(200).json({
      page,
      pageSize,
      // ED scope: `total` reflects the post-exclusion visible-user count so
      // the UI's "Mostrando X-Y de Z" label and page math agree with the
      // filtered list. Admin path keeps raw `count` (no exclusion is applied).
      total: isEdScope ? summary.total : (count || 0),
      users: payload,
      summary,
      schools,
    });
  } catch (error) {
    console.error('[users API] Unexpected error:', error);
    return res.status(500).json({ error: 'Error inesperado al obtener usuarios' });
  }
}
