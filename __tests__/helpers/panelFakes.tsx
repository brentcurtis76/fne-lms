/**
 * Redesign 6B: the fakes around «Mi Panel» for the tests of its new view, the same fakes as 6A's
 * pin (`__tests__/pages/dashboard.clasico.test.tsx`), kept here so that more than one test file can
 * use them. (The pin itself keeps its own copy: importing a test file would run its 50 tests again in
 * the importer.) Every person, school, community and address is invented.
 *
 * A test file declares its `vi.mock` calls itself (Vitest hoists them per file) and points each at
 * the factories below; `fakes` is the one state they all read and write.
 */
import React from 'react';
import { act } from '@testing-library/react';
import { vi } from 'vitest';

type Answer = { status?: number; body?: unknown } | 'reject' | 'pending';
type Row = { data?: unknown; error?: unknown };

export interface Scenario {
  session: any | null;
  getUser?: 'pending' | 'throw' | { error: unknown };
  tables: Record<string, Row[]>;
  refresh?: { data: unknown; error: unknown };
  effective?: { effectiveRole: string; isAdmin: boolean };
  roles?: any[];
  members?: Record<string, any[]>;
  workspaces?: Record<string, any>;
  fetch?: Record<string, Answer>;
  rolesPending?: boolean;
  membersPending?: boolean;
  /** What `BadgeService.getUserBadges` answers (6B: the badges section is real in these tests). */
  badges?: { badges: any[]; total_points: number } | 'pending';
}

export const fakes = {
  scenario: null as Scenario | null,
  look: 'clasico' as 'clasico' | 'nuevo',
  log: [] as unknown[],
  props: {} as Record<string, any>,
  mounts: {} as Record<string, number>,
  router: {
    asPath: '/dashboard',
    pathname: '/dashboard',
    query: {} as Record<string, string>,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(() => Promise.resolve()),
    events: { on: () => {}, off: () => {} },
  },
};

export const S = (): Scenario => fakes.scenario as Scenario;
export const log = (entry: unknown) => fakes.log.push(entry);

fakes.router.push.mockImplementation((url: unknown, ...rest: unknown[]) => {
  log(rest.length === 0 ? { 'router.push': url } : { 'router.push': url, rest });
  return Promise.resolve(true);
});

function query(table: string): any {
  const ops: unknown[] = [];
  const answer = () => {
    log({ supabase: table, ops });
    const next = S().tables[table]?.shift();
    return next ?? { data: null, error: null };
  };
  const q: any = {};
  for (const method of ['select', 'eq', 'in', 'order', 'neq', 'is', 'limit', 'match', 'filter', 'or']) {
    q[method] = (...args: unknown[]) => {
      ops.push([method, ...args]);
      return q;
    };
  }
  q.single = () => {
    ops.push(['single']);
    return Promise.resolve(answer());
  };
  q.maybeSingle = () => {
    ops.push(['maybeSingle']);
    return Promise.resolve(answer());
  };
  q.then = (resolve: (r: Row) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject);
  return q;
}

export const client: any = {
  auth: {
    getSession: vi.fn(() => {
      log('auth.getSession');
      return Promise.resolve({ data: { session: S().session }, error: null });
    }),
    getUser: vi.fn(() => {
      log('auth.getUser');
      const how = S().getUser;
      if (how === 'pending') return new Promise(() => {});
      if (how === 'throw') return Promise.reject(new Error('Synthetic loader failure'));
      if (how && typeof how === 'object') return Promise.resolve({ data: { user: null }, error: how.error });
      return Promise.resolve({ data: { user: S().session?.user ?? null }, error: null });
    }),
    refreshSession: vi.fn(() => {
      log('auth.refreshSession');
      return Promise.resolve(S().refresh ?? { data: { session: null }, error: { message: 'no refresh' } });
    }),
    signOut: vi.fn(() => {
      log('auth.signOut');
      return Promise.resolve({ error: null });
    }),
  },
  from: vi.fn((table: string) => query(table)),
};

export function describeProps(props: Record<string, unknown>): string {
  const rest = { ...props };
  delete rest.children;
  return JSON.stringify(rest, (_key, value) =>
    value === undefined ? '«undefined»' : typeof value === 'function' ? '«function»' : value
  );
}

/** A component replaced by a marker that prints its props (and counts its mounts). */
export function marker(name: string, withChildren = false) {
  return function Marker(props: any) {
    fakes.props[name] = props;
    React.useEffect(() => {
      fakes.mounts[name] = (fakes.mounts[name] ?? 0) + 1;
    }, []);
    return (
      <div data-marker={name} data-props={describeProps(props)}>
        {withChildren ? props.children : null}
      </div>
    );
  };
}

// ── the module factories ──

export const roleUtilsFactory = (real: any) => ({
  ...real,
  metadataHasRole: vi.fn(real.metadataHasRole),
  getUserRoles: vi.fn((_given: unknown, userId: string) => {
    log({ getUserRoles: userId });
    if (S().rolesPending) return new Promise(() => {});
    return Promise.resolve(S().roles ?? []);
  }),
  getCommunityMembers: vi.fn((_given: unknown, communityId: string) => {
    log({ getCommunityMembers: communityId });
    if (S().membersPending) return new Promise(() => {});
    return Promise.resolve(S().members?.[communityId] ?? []);
  }),
  getEffectiveRoleAndStatus: vi.fn((_given: unknown, userId: string) => {
    log({ getEffectiveRoleAndStatus: userId });
    return Promise.resolve(S().effective ?? { effectiveRole: 'docente', isAdmin: false });
  }),
});

export const workspaceUtilsFactory = () => ({
  getOrCreateWorkspace: vi.fn((communityId: string) => {
    log({ getOrCreateWorkspace: communityId });
    const ws = S().workspaces?.[communityId];
    return Promise.resolve(ws === undefined ? null : ws);
  }),
});

export const badgeServiceFactory = () => ({
  BadgeService: {
    getUserBadges: vi.fn((userId: string) => {
      log({ getUserBadges: userId });
      const answer = S().badges;
      if (answer === 'pending') return new Promise(() => {});
      return Promise.resolve(answer ?? { badges: [], total_points: 0 });
    }),
  },
});

// ── fetch ──

const EMPTY: Record<string, unknown> = {
  '/api/news?limit=3': { articles: [] },
  '/api/youtube/latest?limit=2': { videos: [] },
  '/api/dashboard/stats': { totalUsers: 0, mostCompletedCourse: null, topLearner: null },
  '/api/upcoming-courses': [],
  '/api/learning-paths/my-paths': [],
  '/api/course-proposals': { data: [] },
};

export function fakeFetch(url: string, init?: Record<string, unknown>) {
  log(init === undefined ? { fetch: url } : { fetch: url, init: describeProps(init) });
  const answer: Answer = S().fetch?.[url] ?? { status: 200, body: EMPTY[url] };
  if (answer === 'reject') return Promise.reject(new TypeError('Synthetic network failure'));
  if (answer === 'pending') return new Promise(() => {});
  const status = answer.status ?? 200;
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(answer.body) });
}

export async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Resets the shared state before a case. */
export function resetFakes() {
  fakes.scenario = null;
  fakes.look = 'clasico';
  fakes.log = [];
  fakes.props = {};
  fakes.mounts = {};
  fakes.router.push.mockClear();
  for (const fn of Object.values(client.auth)) (fn as any).mockClear();
  client.from.mockClear();
}

// ── invented data (as 6A's pin) ──

export const NOW = new Date('2026-11-16T12:00:00Z');

export function sessionFor(id: string, metadata: Record<string, unknown> = {}) {
  return {
    access_token: `synthetic-token-${id}`,
    user: { id, email: `${id}@example.invalid`, user_metadata: metadata },
  };
}

export const profile = (over: Record<string, unknown> = {}) => ({
  first_name: 'Ana',
  last_name: 'Inventada',
  avatar_url: null,
  school: 'Colegio Inventado del Norte',
  description: null,
  must_change_password: false,
  external_school_affiliation: null,
  ...over,
});

export const ADMIN_COURSES = [
  {
    id: 'course-a1',
    title: 'Curso Inventado de Evaluación',
    description: 'Una descripción inventada',
    thumbnail_url: 'https://img.example.invalid/course-a1.png',
    instructor_id: 'instructor-1',
    estimated_duration_hours: 6,
    difficulty_level: 'intermediate',
    learning_objectives: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
    created_at: '2026-10-01T10:00:00Z',
    instructors: { full_name: 'Relatora Ficticia', photo_url: 'https://img.example.invalid/instructor-1.png' },
  },
  {
    id: 'course-a2',
    title: 'Curso Inventado sin Relator',
    description: null,
    thumbnail_url: null,
    instructor_id: null,
    created_at: '2026-09-01T10:00:00Z',
    instructors: null,
  },
  {
    id: 'course-a3',
    title: 'Curso Inventado con Miniatura por Defecto',
    description: 'Otra descripción',
    thumbnail_url: 'default-thumbnail.png',
    instructor_id: 'instructor-2',
    created_at: '2026-08-01T10:00:00Z',
    instructors: { full_name: 'Relator Imaginario', photo_url: null },
  },
];

export const assigned = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  course_id: id,
  courses: {
    id,
    title,
    description: `Descripción de ${title}`,
    thumbnail_url: `https://img.example.invalid/${id}.png`,
    structure_type: 'simple',
    instructor_id: 'instructor-1',
    created_at: '2026-10-01T10:00:00Z',
    instructors: { full_name: 'Relatora Ficticia' },
    ...extra,
  },
});

export const DOCENTE_ASSIGNMENTS = [
  assigned('course-d1', 'Curso en Progreso Alto'),
  assigned('course-d2', 'Curso en Progreso Bajo', { instructors: null }),
  assigned('course-d3', 'Curso Inscrito sin Avance', { thumbnail_url: 'default-thumbnail.png' }),
  assigned('course-d4', 'Curso Asignado sin Comenzar'),
  assigned('course-d5', 'Curso Completado'),
];
export const DOCENTE_ENROLMENTS = [
  { course_id: 'course-d2', progress_percentage: 20, is_completed: false, enrolled_at: '2026-10-05T10:00:00Z' },
  { course_id: 'course-d1', progress_percentage: 70, is_completed: false, enrolled_at: '2026-10-02T10:00:00Z' },
  { course_id: 'course-d3', progress_percentage: 0, is_completed: false, enrolled_at: '2026-10-09T10:00:00Z' },
  { course_id: 'course-d5', progress_percentage: 100, is_completed: true, enrolled_at: '2026-09-09T10:00:00Z' },
];

export const PATHS = [
  {
    id: 'path-1',
    name: 'Ruta Inventada con Avance',
    description: 'Una ruta inventada',
    assigned_at: '2026-10-10T10:00:00Z',
    progress: { total_courses: 4, completed_courses: 1, progress_percentage: 25, last_accessed: '2026-11-10T10:00:00Z' },
  },
  { id: 'path-2', name: 'Ruta Inventada sin Avance', description: null, assigned_at: '2026-10-11T10:00:00Z' },
  {
    id: 'path-3',
    name: 'Ruta Inventada Completada',
    description: 'Completada',
    assigned_at: '2026-06-11T10:00:00Z',
    progress: { total_courses: 2, completed_courses: 2, progress_percentage: 100 },
  },
  { id: 'path-4', name: 'Ruta Inventada que no se Dibuja', description: 'La cuarta', assigned_at: '2026-10-12T10:00:00Z' },
];

export const UPCOMING = [
  { id: 'up-1', title: 'Próximo Curso Inventado Uno', description: 'Pronto', estimated_release_date: '2027-03-15T12:00:00Z', instructor: { id: 'i1', full_name: 'Relatora Ficticia' } },
  { id: 'up-2', title: 'Próximo Curso Inventado Dos', description: null, thumbnail_url: 'https://img.example.invalid/up-2.png' },
  { id: 'up-3', title: 'Próximo Curso Inventado Tres', description: 'Más adelante' },
];

export const NEWS = {
  articles: [
    {
      id: 'news-1',
      title: 'Noticia Inventada de Hoy',
      slug: 'noticia-inventada-de-hoy',
      content_html: '<p>Un texto <strong>corto</strong>.</p>',
      featured_image: 'https://img.example.invalid/news-1.png',
      display_date: '2026-11-16T09:00:00Z',
      created_at: '2026-11-01T09:00:00Z',
    },
    {
      id: 'news-2',
      title: 'Noticia Inventada de Ayer sin Imagen',
      slug: 'noticia-inventada-de-ayer',
      content_html: '<div>Texto   con\n espacios</div>',
      created_at: '2026-11-15T10:00:00Z',
    },
    {
      id: 'news-3',
      title: 'Noticia Inventada de Hace Días',
      slug: 'noticia-inventada-de-hace-dias',
      content_html:
        '<h2>Título</h2><p>Este es un cuerpo inventado bastante largo, con <em>etiquetas</em> y <a href="#">enlaces</a>, que sirve para que el extracto se corte en cien caracteres y termine con tres puntos.</p>',
      featured_image: 'https://img.example.invalid/news-3.png',
      display_date: '2026-11-13T12:00:00Z',
      created_at: '2026-11-13T12:00:00Z',
    },
  ],
};

export const VIDEOS = {
  videos: [
    { id: 'video-1', title: 'Video Inventado de Hace Semanas', description: 'Uno', thumbnail: 'https://img.example.invalid/video-1.jpg', publishedAt: '2026-11-02T12:00:00Z' },
    { id: 'video-2', title: 'Video Inventado Antiguo', description: 'Dos', thumbnail: 'https://img.example.invalid/video-2.jpg', publishedAt: '2026-09-01T12:00:00Z' },
  ],
};

export const STATS_FULL = {
  totalUsers: 987,
  statsLabel: 'Estadísticas de tu Colegio',
  mostCompletedCourse: { id: 'course-d1', title: 'Curso en Progreso Alto', completionCount: 12, instructor_name: 'Relatora Ficticia' },
  topLearner: {
    id: 'learner-1',
    name: 'Bruno Ficticio',
    email: 'bruno@example.invalid',
    avatar_url: 'https://img.example.invalid/learner-1.png',
    completedCourses: 5,
    school_name: 'Colegio Inventado del Norte',
    role: 'Docente',
  },
};
export const STATS_BARE = {
  totalUsers: 7,
  mostCompletedCourse: { id: 'course-d2', title: 'Curso en Progreso Bajo', completionCount: 3 },
  topLearner: { id: 'learner-2', name: 'Carla Ficticia', email: 'carla@example.invalid', completedCourses: 2 },
};
export const STATS_NULLS = { totalUsers: null, statsLabel: null, mostCompletedCourse: null, topLearner: null };

export const proposal = (n: number, over: Record<string, unknown> = {}) => ({
  id: `prop-${n}`,
  titulo: `Propuesta Inventada ${n}`,
  descripcion_corta: `Descripción inventada ${n}`,
  competencias_desarrollar: `Competencias inventadas ${n}`,
  tiempo_requerido_desarrollo: `${n} semanas`,
  necesita_ayuda_diseno_instruccional: n === 1,
  created_by: 'user-otro',
  created_at: `2026-10-0${n}T15:00:00Z`,
  updated_at: `2026-10-0${n}T15:00:00Z`,
  status: ['pending', 'reviewed', 'approved', 'rejected', 'archivada'][(n - 1) % 5],
  creator: { first_name: 'Persona', last_name: `Inventada ${n}`, email: `persona${n}@example.invalid` },
  ...over,
});

export const badge = (n: number, over: Record<string, unknown> = {}) => ({
  id: `user-badge-${n}`,
  user_id: 'x',
  badge_id: `badge-${n}`,
  course_id: `course-${n}`,
  earned_at: new Date(NOW.getTime() - n * 9 * 24 * 60 * 60 * 1000).toISOString(),
  metadata: {},
  badge_name: `Insignia Inventada ${n}`,
  badge_description: null,
  badge_type: 'course_completion',
  icon_name: 'genera',
  color_primary: '',
  color_secondary: '',
  points_value: n % 2 === 0 ? 10 : 0,
  course_title: `Curso Inventado ${n}`,
  ...over,
});

export const FULL_FETCH: Record<string, Answer> = {
  '/api/news?limit=3': { body: NEWS },
  '/api/youtube/latest?limit=2': { body: VIDEOS },
  '/api/dashboard/stats': { body: STATS_FULL },
  '/api/upcoming-courses': { body: UPCOMING },
  '/api/learning-paths/my-paths': { body: PATHS },
  '/api/course-proposals': { body: { data: [1, 2, 3, 4, 5].map((n) => proposal(n)) } },
};

export const VIEWER = 'user-docente';
export const role = (over: Record<string, unknown>) => ({
  id: 'role-1',
  user_id: VIEWER,
  role_type: 'docente',
  is_active: true,
  assigned_at: '2026-01-01T00:00:00Z',
  ...over,
});
export const COMMUNITY_N = { id: 'com-n', name: 'Comunidad Inventada Norte' };
export const COMMUNITY_S = { id: 'com-s', name: 'Comunidad Inventada Sur' };
export const SCHOOL_N = { id: 'school-n', name: 'Colegio Inventado del Norte' };

export const MEMBERS = [
  { id: 'member-1', first_name: 'Diego', last_name: 'Imaginario', avatar_url: 'https://img.example.invalid/m1.png', user_roles: [{ role_type: 'docente' }] },
  { id: 'member-2', first_name: 'Carla', last_name: 'Ficticia', user_roles: [{ role_type: 'lider_comunidad' }] },
  { id: 'member-3', name: 'Solo Nombre Inventado' },
  { id: 'member-4' },
  { id: 'member-5', first_name: 'Elena', last_name: 'Supuesta', user_roles: [{ role_type: 'consultor' }], external_school_affiliation: 'colegio_inventado_sur' },
  { id: VIEWER, first_name: 'Ana', last_name: 'Inventada', user_roles: [{ role_type: 'docente' }] },
];

export function docente(over: Partial<Scenario> = {}): Scenario {
  return {
    session: sessionFor(VIEWER, { roles: ['docente'] }),
    tables: {
      profiles: [{ data: profile(), error: null }],
      course_assignments: [{ data: [], error: null }],
    },
    effective: { effectiveRole: 'docente', isAdmin: false },
    roles: [role({})],
    ...over,
  };
}

export function admin(over: Partial<Scenario> = {}): Scenario {
  return {
    session: sessionFor('user-admin', { roles: ['admin'] }),
    tables: {
      profiles: [{ data: profile({ first_name: 'Beatriz', last_name: 'Administradora' }), error: null }],
      courses: [{ data: ADMIN_COURSES, error: null }],
    },
    effective: { effectiveRole: 'admin', isAdmin: true },
    roles: [role({ id: 'role-admin', user_id: 'user-admin', role_type: 'admin' })],
    fetch: { ...FULL_FETCH, '/api/course-proposals': { body: { data: [proposal(1, { created_by: 'user-admin' }), proposal(2)] } } },
    badges: { badges: [1, 2, 3, 4, 5, 6].map((n) => badge(n)), total_points: 30 },
    ...over,
  };
}

export function fullDocente(over: Partial<Scenario> = {}): Scenario {
  return docente({
    tables: {
      profiles: [{ data: profile(), error: null }],
      course_assignments: [{ data: DOCENTE_ASSIGNMENTS, error: null }],
      course_enrollments: [{ data: DOCENTE_ENROLMENTS, error: null }],
    },
    fetch: FULL_FETCH,
    badges: { badges: [badge(1)], total_points: 0 },
    ...over,
  });
}

/**
 * A docente whose courses exercise the opened course card's conditions (6B, send-back 2): lessons
 * with and without progress, progress without lessons, five objectives and two, a duration under an
 * hour, a course without a relator (the hook names it «Sin instructor»), no description. The lesson
 * counts ride on the course rows the fake hands back (the page spreads them into its courses).
 */
export const LESSON_ASSIGNMENTS = [
  assigned('course-l1', 'Curso con Lecciones sin Avance', {
    total_lessons: 10,
    lessons_completed: 0,
    estimated_duration_hours: 6,
    difficulty_level: 'beginner',
    learning_objectives: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
  }),
  assigned('course-l2', 'Curso sin Lecciones con Avance', { total_lessons: 0, instructors: null, description: null }),
  assigned('course-l3', 'Curso con Lecciones y Avance', {
    total_lessons: 10,
    lessons_completed: 7,
    estimated_duration_hours: 0.5,
    difficulty_level: 'advanced',
    learning_objectives: ['Uno', 'Dos'],
  }),
  assigned('course-l4', 'Curso Abierto con Lecciones', { total_lessons: 4, difficulty_level: 'intermediate' }),
  assigned('course-l5', 'Curso Abierto sin Lecciones', { total_lessons: 0, thumbnail_url: 'default-thumbnail.png' }),
];
export const LESSON_ENROLMENTS = [
  { course_id: 'course-l1', progress_percentage: 0, is_completed: false, enrolled_at: '2026-10-05T10:00:00Z' },
  { course_id: 'course-l2', progress_percentage: 70, is_completed: false, enrolled_at: '2026-10-02T10:00:00Z' },
  { course_id: 'course-l3', progress_percentage: 70, is_completed: false, enrolled_at: '2026-10-03T10:00:00Z' },
];

export function lessonDocente(over: Partial<Scenario> = {}): Scenario {
  return docente({
    tables: {
      profiles: [{ data: profile(), error: null }],
      course_assignments: [{ data: LESSON_ASSIGNMENTS, error: null }],
      course_enrollments: [{ data: LESSON_ENROLMENTS, error: null }],
    },
    ...over,
  });
}

export function consultor(over: Partial<Scenario> = {}): Scenario {
  return docente({
    session: sessionFor('user-consultor', {}),
    tables: {
      profiles: [{ data: profile({ first_name: 'Elena', last_name: 'Supuesta', external_school_affiliation: 'colegio_inventado_sur' }), error: null }],
      course_assignments: [{ data: [assigned('course-c1', 'Curso del Consultor')], error: null }],
      course_enrollments: [{ data: [], error: null }],
    },
    effective: { effectiveRole: 'consultor', isAdmin: false },
    roles: [role({ id: 'role-c', user_id: 'user-consultor', role_type: 'consultor', school_id: 'school-n' })],
    fetch: { '/api/course-proposals': { body: { data: [proposal(1, { created_by: 'user-consultor' }), proposal(2)] } } },
    ...over,
  });
}

export function withCommunity(over: Partial<Scenario> = {}, roleOver: Record<string, unknown> = {}): Scenario {
  return docente({
    roles: [role({ community_id: 'com-n', community: COMMUNITY_N, school: SCHOOL_N, ...roleOver })],
    members: { 'com-n': MEMBERS },
    workspaces: { 'com-n': { id: 'ws-n', community_id: 'com-n', name: 'Espacio Norte', custom_name: null, image_url: null } },
    ...over,
  });
}

export function twoCommunities(over: Partial<Scenario> = {}): Scenario {
  return docente({
    roles: [
      role({ id: 'role-n', community_id: 'com-n', community: COMMUNITY_N, school: SCHOOL_N }),
      role({ id: 'role-s', community_id: 'com-s', community: COMMUNITY_S, school: null }),
    ],
    members: { 'com-n': MEMBERS.slice(0, 3), 'com-s': [MEMBERS[3], MEMBERS[5]] },
    workspaces: {
      'com-n': { id: 'ws-n', community_id: 'com-n', name: 'Espacio Norte', custom_name: null, image_url: null },
      'com-s': { id: 'ws-s', community_id: 'com-s', name: 'Espacio Sur', custom_name: 'Espacio Sur Propio', image_url: 'https://img.example.invalid/ws-s.png' },
    },
    ...over,
  });
}
