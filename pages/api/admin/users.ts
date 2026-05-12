import type { NextApiRequest, NextApiResponse } from 'next';
import {
  checkIsAdminOrEquipoDirectivo,
  createServiceRoleClient,
} from '../../../lib/api-auth';
import { toQuotedInList } from '../../../lib/admin/users-query';
import { SCHOOL_SCOPED_ROLES } from '../../../utils/roleUtils';

const ROLE_PRIORITY = ['admin','consultor','equipo_directivo','supervisor_de_red','community_manager','lider_generacion','lider_comunidad','docente','encargado_licitacion'];

// Cap on how many user_ids we send in a single `.in()` call (currently only
// the global-role and cross-school prefetch legs). PostgREST encodes these
// as URL filters; large schools (250+ in-school users) can otherwise push
// the request URL past common proxy / load-balancer limits (~8KB) and
// trigger 414s or truncated filters. Chunking keeps every outbound request
// bounded.
const USER_ID_BATCH = 100;

// Hard ceiling on the ED prefetch. The prefetch issues ⌈N/1000⌉ paginated
// profile requests plus 2·⌈N/100⌉ batched user_roles requests, all to compute
// the ghost-exclusion set — O(N) round-trips per ED list request. For very
// large schools that latency cliff is real. Until the prefetch is replaced
// with a server-side view/RPC (tracked as a PR #19 follow-up), abort with a
// 500 + structured log when N exceeds this ceiling so the symptom is visible
// to ops instead of degrading silently.
// TODO(PR #19 follow-up #9): replace this prefetch + chunked downstream
// queries with a server-side view/RPC that returns the visible-user set and
// ghost-exclusion set in a single round-trip, eliminating both the ceiling
// and the O(N) request fan-out.
const MAX_ED_PREFETCH_USERS = 5000;

// Threshold for the ED ghost-exclusion strategy. At or below this size, the
// excluded id list is small enough to encode safely as a single
// `.not('id', 'in', ...)` filter on the paginated profiles query plus the
// three scoped count queries — so pagination is exact (offset applies to
// already-filtered rows) and the response `total` comes straight from
// PostgREST's `count: 'exact'`. Above this size, the encoded URL would risk
// hitting proxy/load-balancer limits (~8KB) and 414 errors, so the handler
// falls back to fetching the page unfiltered and dropping ghost rows in
// memory. In that fallback mode pagination may be inexact because the
// offset is computed before the in-memory drop — see the warning log below.
const MAX_EXCLUDED_FOR_SQL = 100;

const chunkIds = <T>(values: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
};

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
    // compute exact summary counts in memory; F4 option (a): also widened
    // with email/first_name/last_name so the client-side fallback path can
    // compute an exact post-search/status `total` in memory) so we can
    // derive the excluded set and apply client-side filtering after the
    // main page is fetched.
    type EdInSchoolUser = {
      id: string;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      approval_status: string | null;
    };
    let edExcludedUserIds: string[] = [];
    let edInSchoolUsers: EdInSchoolUser[] = [];
    if (isEdScope) {
      // PostgREST caps a single SELECT at 1000 rows by default. Schools larger
      // than that would otherwise have their tail-end users silently skip the
      // global-role exclusion check below and "ghost" into the ED list,
      // since the write-path target-role gate would still reject every edit.
      // Page through .range() until a partial batch lands.
      const PROFILE_PREFETCH_BATCH = 1000;
      const collected: EdInSchoolUser[] = [];
      let prefetchFrom = 0;
      while (true) {
        // Stable ordering before .range(...) is required: PostgREST does not
        // guarantee row order without an explicit ORDER BY, so paginated
        // prefetch could otherwise duplicate or skip ids on retries / heap
        // reordering. `id` is the natural primary key and is monotonic enough
        // for deterministic batching.
        const { data: pageRows, error: inSchoolErr } = await supabaseService
          .from('profiles')
          .select('id, email, first_name, last_name, approval_status')
          .eq('school_id', edSchoolId)
          .order('id', { ascending: true })
          .range(prefetchFrom, prefetchFrom + PROFILE_PREFETCH_BATCH - 1);

        if (inSchoolErr) {
          console.error('[users API] Error fetching in-school user ids:', inSchoolErr);
          return res.status(500).json({ error: 'Error al filtrar usuarios' });
        }

        const rows = (pageRows ?? []) as Array<{
          id?: string | null;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          approval_status?: string | null;
        }>;
        for (const row of rows) {
          if (row.id) {
            collected.push({
              id: row.id,
              email: row.email ?? null,
              first_name: row.first_name ?? null,
              last_name: row.last_name ?? null,
              approval_status: row.approval_status ?? null,
            });
          }
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

      // Fail-safe: abort if the in-school population exceeds the ceiling.
      // Track as PR #19 follow-up: replace this pre-fetch + chunked downstream
      // queries with a server-side view/RPC that returns the excluded user_id
      // set in a single round-trip. The current scheme is correct but linear
      // in school size; this ceiling is a fail-safe until the RPC lands.
      if (edInSchoolUsers.length > MAX_ED_PREFETCH_USERS) {
        console.error('[users API] ED prefetch exceeded MAX_ED_PREFETCH_USERS', {
          edSchoolId,
          actualCount: edInSchoolUsers.length,
          limit: MAX_ED_PREFETCH_USERS,
        });
        return res.status(500).json({
          error: 'Lista de usuarios temporalmente no disponible para esta escuela. Contacta soporte.',
        });
      }

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

    // F1 hybrid exclusion: when ED scope has a small number of ghost users
    // (1..MAX_EXCLUDED_FOR_SQL), apply `.not('id', 'in', ...)` directly to
    // the main paginated query AND the scoped count queries. That keeps
    // pagination offsets aligned with the visible result set and lets
    // `count: 'exact'` return the post-exclusion total. Above the threshold,
    // encoded URL filters risk 414s, so fall back to fetching the page
    // unfiltered and dropping ghosts in memory. `useClientFallback` is the
    // single boolean that drives BOTH the exclusion strategy AND the response
    // `total` source — keeping them derived from one place ensures they stay
    // in sync (Phase 15.23: a stale ternary previously used `summary.total`
    // for the ED 0-excluded path, which ignored search/status filters and
    // inflated pagination).
    const useClientFallback =
      isEdScope && edExcludedUserIds.length > MAX_EXCLUDED_FOR_SQL;
    const useSqlExclusion =
      isEdScope && edExcludedUserIds.length >= 1 && !useClientFallback;

    if (useClientFallback) {
      console.warn(
        `[users API] ED exclusion list size ${edExcludedUserIds.length} exceeds MAX_EXCLUDED_FOR_SQL=${MAX_EXCLUDED_FOR_SQL}; falling back to client-side filtering — pagination may be inexact (page offset is applied before in-memory exclusion)`,
      );
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

    if (useSqlExclusion) {
      profileQuery = profileQuery.not(
        'id',
        'in',
        toQuotedInList(edExcludedUserIds),
      );
    }

    const { data: profiles, count, error: profilesError } = await profileQuery;

    if (profilesError) {
      console.error('[users API] Error fetching profiles:', profilesError);
      return res.status(500).json({ error: 'Error al obtener usuarios' });
    }

    let summary: { total: number; pending: number; approved: number };
    let schools: Array<{ id: string; name: string }>;
    // F1: in the ED client-side fallback path, the response `total` cannot
    // rely on PostgREST's `count` (raw, over-counts ghosts) or `summary.total`
    // (in-memory ghost-exclusion only, ignores active search/status filters).
    // Compute the post-exclusion + post-filter total against the prefetched
    // (widened) in-school rows, so pagination matches the visible page even
    // when ED has >MAX_EXCLUDED_FOR_SQL ghosts AND filters are active.
    let fallbackFilteredTotal = 0;

    if (isEdScope) {
      if (useSqlExclusion) {
        // SQL path: issue scoped count queries that mirror the same
        // `.not('id', 'in', ...)` exclusion plus the ED school filter. The
        // resulting `count` values reflect the post-exclusion totals and
        // become the source of truth for `summary` AND the response `total`.
        const exclusionList = toQuotedInList(edExcludedUserIds);
        const totalCountQuery = supabaseService
          .from('profiles')
          .select('id', { head: true, count: 'exact' })
          .eq('school_id', edSchoolId as number)
          .not('id', 'in', exclusionList);
        const pendingCountQuery = supabaseService
          .from('profiles')
          .select('id', { head: true, count: 'exact' })
          .eq('school_id', edSchoolId as number)
          .eq('approval_status', 'pending')
          .not('id', 'in', exclusionList);
        const approvedCountQuery = supabaseService
          .from('profiles')
          .select('id', { head: true, count: 'exact' })
          .eq('school_id', edSchoolId as number)
          .eq('approval_status', 'approved')
          .not('id', 'in', exclusionList);
        const schoolsQuery = supabaseService
          .from('schools')
          .select('id, name')
          .eq('id', edSchoolId as number)
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
      } else {
        // Zero excluded OR client-side fallback (>MAX_EXCLUDED_FOR_SQL):
        // compute counts in memory from the prefetched in-school users
        // (which carry approval_status), removing the excluded set. No
        // extra count round-trips are required.
        const excludedSet = new Set<string>(edExcludedUserIds);
        const visibleInSchool = edInSchoolUsers.filter((u) => !excludedSet.has(u.id));
        summary = {
          total: visibleInSchool.length,
          pending: visibleInSchool.filter((u) => u.approval_status === 'pending').length,
          approved: visibleInSchool.filter((u) => u.approval_status === 'approved').length,
        };

        // F1 fallback total: when useClientFallback is true, the response
        // `total` must reflect any active search/status filter on top of the
        // post-exclusion population. Mirror the main paginated query's
        // server-side filters (ilike on email/first_name/last_name; equality
        // on approval_status) against the prefetched in-school rows.
        if (useClientFallback) {
          const searchLower = search.toLowerCase();
          fallbackFilteredTotal = visibleInSchool.reduce((acc, u) => {
            if (status !== 'all' && u.approval_status !== status) return acc;
            if (search) {
              const matches =
                (u.email?.toLowerCase().includes(searchLower) ?? false) ||
                (u.first_name?.toLowerCase().includes(searchLower) ?? false) ||
                (u.last_name?.toLowerCase().includes(searchLower) ?? false);
              if (!matches) return acc;
            }
            return acc + 1;
          }, 0);
        }

        const schoolsRes = await supabaseService
          .from('schools')
          .select('id, name')
          .eq('id', edSchoolId as number)
          .order('name', { ascending: true });
        schools = (schoolsRes.data || []).map((s: any) => ({
          id: s.id.toString(),
          name: s.name,
        }));
      }
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

    // Client-side exclusion is only applied in the fallback path (excluded
    // count exceeds MAX_EXCLUDED_FOR_SQL). In the SQL path, the main query
    // already filtered out ghosts via `.not('id', 'in', ...)` so re-filtering
    // would be a no-op. In ED scope with zero excluded ids there is also
    // nothing to drop.
    const profileRows = profiles || [];
    let users: any[] = profileRows;
    if (useClientFallback) {
      const excludedSet = new Set<string>(edExcludedUserIds);
      users = profileRows.filter((u: any) => !excludedSet.has(u.id));
    }

    if (users.length === 0) {
      // Mirrors the final response total selection below: only the ED
      // client-side fallback uses `fallbackFilteredTotal` (in-memory
      // post-exclusion + post-search/status); every other path (admin, ED
      // SQL exclusion, ED 0-excluded) uses the filtered DB `count` so
      // `total` reflects active search/status filters.
      const emptyTotal = useClientFallback ? fallbackFilteredTotal : (count || 0);
      return res.status(200).json({ page, pageSize, total: emptyTotal, users: [], summary, schools });
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
        // Phase 15.21 safety: the `school_id.is.null` branch is only safe
        // because `userIds` was pre-restricted to in-school profile ids via
        // the paginated profiles prefetch above. That outer `.in('user_id',
        // userIds)` is what prevents a null `school_id` on a legacy role row
        // from leaking a cross-school user. Widening or removing the
        // prefetch (e.g. fetching role rows independently of the profile
        // page) would re-expose legacy `null`-school role rows belonging to
        // users from other schools — do not do this without first
        // backfilling `user_roles.school_id` and enforcing NOT NULL.
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
      // ED SQL path: `count` comes from PostgREST with the same exclusion
      // applied, so it's already post-exclusion and matches the visible page.
      // ED 0-excluded path: `count` reflects active search/status filters, so
      // it's the correct source for `total` (using `summary.total` here would
      // ignore those filters and inflate pagination — Phase 15.23 fix).
      // ED fallback (>MAX_EXCLUDED_FOR_SQL): the raw `count` over-counts
      // ghosts and `summary.total` ignores active search/status filters;
      // `fallbackFilteredTotal` applies both ghost-exclusion AND the active
      // search/status filters in memory against the widened prefetch (F1).
      // Pagination may still be inexact in this path because the .range()
      // offset is computed before in-memory exclusion of ghost rows on the
      // page, but `total` itself is exact.
      // Admin path keeps raw `count` (no exclusion is applied).
      total: useClientFallback ? fallbackFilteredTotal : (count || 0),
      users: payload,
      summary,
      schools,
    });
  } catch (error) {
    console.error('[users API] Unexpected error:', error);
    return res.status(500).json({ error: 'Error inesperado al obtener usuarios' });
  }
}
