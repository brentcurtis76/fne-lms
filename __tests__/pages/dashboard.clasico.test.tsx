// @vitest-environment jsdom
/**
 * Redesign 6A, step 0: today's panel («Mi Panel», `pages/dashboard.tsx`) pinned BEFORE its data
 * code moves into a hook and its markup into the classic view.
 *
 * Each case renders the page's default export with everything outside the page replaced by fakes
 * this file controls, and keeps ONE digest of two things together: (a) the rendered markup,
 * serialised exactly as Vitest serialises a snapshot (the same pretty-format, plugins and options),
 * and (b) the ordered log of what the page asked for while it loaded and while the case acted
 * (Supabase reads with their table, columns and filters; `fetch` calls with their address and
 * headers; the role and workspace helpers; router pushes; storage removals; toasts; the error
 * lines the page writes to the console). The SHA-256 of that text is compared with the one kept
 * for the case in `dashboard.clasico.digests.json`, produced by the page as it was before 6A. If a
 * case fails, the panel changed: what it draws, or what it asks for, or in which order.
 *
 * To see a case's text, set PANEL_CLASICO_SHOW to the case's name (or `all`): it is written to a
 * scratch folder (PANEL_CLASICO_OUT, else the system's temporary folder), and the case is still
 * compared. To accept a change of today's panel ON PURPOSE, set PANEL_CLASICO_ACCEPT to the case's
 * name (or `all`): the text is written the same way and the digests file is rewritten for that
 * case. Nothing is ever accepted without that variable.
 *
 * The pin does not depend on the machine: the time zone is fixed to UTC below before any date is
 * made or drawn (send-back 1; the first test of the file fails by name if the zone did not take),
 * and for the length of each test `Number.prototype.toLocaleString` called WITHOUT a language
 * writes as `'en-US'` does (send-back 2), so the process's default language never reaches a digest
 * (in some languages even `987` is written with other digits). That the page calls it without a
 * language is asserted apart. The thousands case is checked apart too, with the stand-in off,
 * against what the real `toLocaleString()` gives on the machine that runs it. The page writes no
 * date through a locale function (it builds its dates from `getDate()`, `getMonth()` and
 * `getFullYear()`), so none of those is replaced. PANEL_CLASICO_PAGE, when set, names another copy of the page to
 * render instead of `pages/dashboard.tsx` (a module id such as `@/pages/dashboard.before`): it is
 * how a new digest is shown to be produced by the page as it was before 6A too.
 *
 * Every person, school, community and address below is invented. Components the page only places
 * are replaced by markers that print the props the page gives them, so their own data calls stay
 * out while what the page hands them is pinned.
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSerializers } from '@vitest/snapshot';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The machine's time zone must not reach the digests: fixed before anything else runs. Node reads
// a change of `process.env.TZ` at run time; the pin's own runs under five zones and languages show
// it holds here (see the send-back 1 report). It holds only while Vitest runs this file in a child
// process (`threads: false`): the first test of the file checks that it took.
vi.hoisted(() => {
  process.env.TZ = 'UTC';
});

// ── The pin: Vitest's own snapshot serialisation, kept as one digest per case. ──

const HERE = dirname(fileURLToPath(import.meta.url));
const DIGESTS_FILE = join(HERE, 'dashboard.clasico.digests.json');
const DIGESTS: Record<string, string> = JSON.parse(readFileSync(DIGESTS_FILE, 'utf8'));
const CASES = 37;

// The pretty-format copy that Vitest's snapshot package itself uses (not the project's older one).
const fromSnapshotPackage = createRequire(createRequire(import.meta.url).resolve('@vitest/snapshot/package.json'));
const { format } = fromSnapshotPackage('pretty-format') as {
  format: (value: unknown, options: Record<string, unknown>) => string;
};

/** What `toMatchSnapshot()` stores for a value (@vitest/snapshot 0.34: serialize + addExtraLineBreaks). */
function serialise(value: unknown): string {
  const text = format(value, {
    escapeRegex: true,
    indent: 2,
    plugins: getSerializers(),
    printFunctionName: false,
    printBasicPrototype: false,
  }).replace(/\r\n|\r/g, '\n');
  return text.includes('\n') ? `\n${text}\n` : text;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const chosen = (variable: string, name: string) => {
  const value = process.env[variable];
  return value === 'all' || value === name;
};
const OUT = process.env.PANEL_CLASICO_OUT || join(tmpdir(), 'panel-clasico');

function writeText(name: string, text: string): string {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.txt`);
  writeFileSync(file, text, 'utf8');
  return file;
}

/** Compares the case's text with its pinned digest; writes or accepts it only when asked. */
function expectPinned(name: string, text: string) {
  const digest = sha256(text);
  if (chosen('PANEL_CLASICO_SHOW', name) || chosen('PANEL_CLASICO_ACCEPT', name)) {
    const file = writeText(name, text);
    console.info(`panel.clasico: the text of «${name}» is in ${file}`);
  }
  if (chosen('PANEL_CLASICO_ACCEPT', name)) {
    const current: Record<string, string> = JSON.parse(readFileSync(DIGESTS_FILE, 'utf8'));
    current[name] = digest;
    const sorted = Object.fromEntries(Object.keys(current).sort().map((key) => [key, current[key]]));
    writeFileSync(DIGESTS_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
    console.warn(`panel.clasico: «${name}» ACCEPTED on purpose; ${DIGESTS_FILE} rewritten`);
    return;
  }
  if (digest !== DIGESTS[name]) {
    throw new Error(
      [
        `Today's panel changed in the case «${name}».`,
        `  pinned digest: ${DIGESTS[name] ?? '(none)'}`,
        `  digest now:    ${digest}`,
        'To see the difference: run this file with PANEL_CLASICO_SHOW set to the case\'s name (or all)',
        'and PANEL_CLASICO_OUT set to a scratch folder, once on the code before the change and once',
        'after, into two folders, and diff the two files. Only if the change of today\'s panel is meant:',
        'run it with PANEL_CLASICO_ACCEPT set to the case\'s name, which rewrites dashboard.clasico.digests.json.',
      ].join('\n')
    );
  }
}

const ran = new Set<string>();
/** A pinned case: its body returns the stages it wants kept (markup, log, or both). */
function pinned(name: string, body: () => Promise<string[]>) {
  it(name, async () => {
    ran.add(name);
    expectPinned(name, (await body()).join('\n════ next stage ════\n'));
  });
}

// ── The fakes. ──

type Answer = { status?: number; body?: unknown } | 'reject' | 'pending';
type Row = { data?: unknown; error?: unknown };

interface Scenario {
  session: any | null;
  /** What `auth.getUser` does; default: answers the session's user. */
  getUser?: 'pending' | 'throw' | { error: unknown };
  /** Answers per table, consumed in order (the profile read may happen twice). */
  tables: Record<string, Row[]>;
  refresh?: { data: unknown; error: unknown };
  effective?: { effectiveRole: string; isAdmin: boolean };
  roles?: any[];
  members?: Record<string, any[]>;
  /** `null` = `getOrCreateWorkspace` answers nothing for that community. */
  workspaces?: Record<string, any>;
  fetch?: Record<string, Answer>;
  /** The loader waits for ever on `getUserRoles` (send-back 1: decisions while loading). */
  rolesPending?: boolean;
  /** The loader waits for ever on `getCommunityMembers` (send-back 1: decisions while loading). */
  membersPending?: boolean;
}

const mocks = vi.hoisted(() => ({
  scenario: null as any,
  log: [] as unknown[],
  props: {} as Record<string, any>,
  router: {
    asPath: '/dashboard',
    pathname: '/dashboard',
    query: {} as Record<string, string>,
    push: null as any,
    replace: null as any,
    prefetch: null as any,
    events: { on: () => {}, off: () => {} },
  },
}));

function log(entry: unknown) {
  mocks.log.push(entry);
}
const S = (): Scenario => mocks.scenario as Scenario;

// Every argument after the address is written down too (today the page passes none).
mocks.router.push = vi.fn((url: unknown, ...rest: unknown[]) => {
  log(rest.length === 0 ? { 'router.push': url } : { 'router.push': url, rest });
  return Promise.resolve(true);
});
mocks.router.replace = vi.fn((url: unknown) => {
  log({ 'router.replace': url });
  return Promise.resolve(true);
});
mocks.router.prefetch = vi.fn(() => Promise.resolve());

/** A Supabase query: every filter is written down; awaiting it or `.single()` logs it and answers. */
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
  q.then = (resolve: (r: Row) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(answer()).then(resolve, reject);
  return q;
}

/**
 * An auth call is written as its bare name when it is given no argument (as today), and with every
 * argument it was given otherwise, so an argument added to the call changes the log.
 */
function logAuth(name: string, args: unknown[]) {
  log(args.length === 0 ? name : { [name]: args });
}

/**
 * A helper's entry as today when it was given only the arguments it expects, and with the extra
 * ones written out otherwise (named as in `describeProps`), so an argument added changes the log.
 */
function withRest(entry: Record<string, unknown>, rest: unknown[]): Record<string, unknown> {
  return rest.length === 0 ? entry : { ...entry, rest: describeProps({ args: rest }) };
}

// One client object for the whole file: the page's effects list it as a dependency, as in the app.
const client: any = {
  auth: {
    getSession: vi.fn((...args: unknown[]) => {
      logAuth('auth.getSession', args);
      return Promise.resolve({ data: { session: S().session }, error: null });
    }),
    getUser: vi.fn((...args: unknown[]) => {
      logAuth('auth.getUser', args);
      const how = S().getUser;
      if (how === 'pending') return new Promise(() => {});
      if (how === 'throw') return Promise.reject(new Error('Synthetic loader failure'));
      if (how && typeof how === 'object') return Promise.resolve({ data: { user: null }, error: how.error });
      return Promise.resolve({ data: { user: S().session?.user ?? null }, error: null });
    }),
    refreshSession: vi.fn((...args: unknown[]) => {
      logAuth('auth.refreshSession', args);
      return Promise.resolve(S().refresh ?? { data: { session: null }, error: { message: 'no refresh' } });
    }),
    signOut: vi.fn((...args: unknown[]) => {
      logAuth('auth.signOut', args);
      return Promise.resolve({ error: null });
    }),
  },
  from: vi.fn((table: string) => query(table)),
};

/** Props as text: functions and `undefined` are named, so `undefined`, `null` and a text differ. */
function describeProps(props: Record<string, unknown>): string {
  const rest = { ...props };
  delete rest.children;
  return JSON.stringify(rest, (_key, value) =>
    value === undefined ? '«undefined»' : typeof value === 'function' ? '«function»' : value
  );
}

function marker(name: string, keyOf?: (props: any) => string, withChildren = false) {
  return function Marker(props: any) {
    mocks.props[keyOf ? `${name}:${keyOf(props)}` : name] = props;
    return (
      <div data-marker={name} data-props={describeProps(props)}>
        {withChildren ? props.children : null}
      </div>
    );
  };
}

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => client,
  useSession: () => S().session,
}));
vi.mock('@/lib/supabase-wrapper', () => ({
  supabase: {
    from: (table: string) => {
      log({ 'unexpected supabase-wrapper read': table });
      return query(table);
    },
  },
}));
vi.mock('@/utils/roleUtils', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/utils/roleUtils')>();
  return {
    ...real,
    // The real rule, watched: it must not run while the loading mark shows (send-back 1).
    metadataHasRole: vi.fn(real.metadataHasRole),
    // Every argument after the expected ones is written down too (send-back 2; today none is passed).
    getUserRoles: vi.fn((given: unknown, userId: string, ...rest: unknown[]) => {
      log(withRest({ getUserRoles: userId, client: given === client }, rest));
      if (S().rolesPending) return new Promise(() => {});
      return Promise.resolve(S().roles ?? []);
    }),
    getCommunityMembers: vi.fn((given: unknown, communityId: string, ...rest: unknown[]) => {
      log(withRest({ getCommunityMembers: communityId, client: given === client }, rest));
      if (S().membersPending) return new Promise(() => {});
      return Promise.resolve(S().members?.[communityId] ?? []);
    }),
    getEffectiveRoleAndStatus: vi.fn((given: unknown, userId: string, ...rest: unknown[]) => {
      log(withRest({ getEffectiveRoleAndStatus: userId, client: given === client }, rest));
      return Promise.resolve(S().effective ?? { effectiveRole: 'docente', isAdmin: false });
    }),
  };
});
vi.mock('@/utils/workspaceUtils', () => ({
  getOrCreateWorkspace: vi.fn((communityId: string, ...rest: unknown[]) => {
    log(withRest({ getOrCreateWorkspace: communityId }, rest));
    const ws = S().workspaces?.[communityId];
    return Promise.resolve(ws === undefined ? null : ws);
  }),
}));
vi.mock('@/hooks/useAvatar', () => ({
  updateAvatarCache: vi.fn((userId: string, url: unknown) => log({ updateAvatarCache: [userId, url] })),
  useAvatar: () => ({ url: null, loading: false }),
}));
vi.mock('@/utils/toastUtils', () => ({
  toastSuccess: vi.fn((message: string) => log({ toastSuccess: message })),
  toastError: vi.fn((message: string) => log({ toastError: message })),
}));
// The real helpers, watched (send-back 1): they must run only where today's markup ran them.
vi.mock('@/constants/externalSchools', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/constants/externalSchools')>();
  return { ...real, getExternalSchoolLabel: vi.fn(real.getExternalSchoolLabel) };
});
vi.mock('@/lib/services/communityWorkspace', async (importOriginal) => {
  const real = await importOriginal<any>();
  return { ...real, canEditWorkspaceWithRoles: vi.fn(real.canEditWorkspaceWithRoles) };
});
// The hook, untouched unless `watch.on` is set: then its `decide()` and the route cards it hands
// out are counted. Only the send-back 1 tests set it; the pinned cases see the hook as it is.
const watch = vi.hoisted(() => ({ on: false, decide: 0, routeCards: 0 }));
vi.mock('@/hooks/usePanel', async (importOriginal) => {
  const real = await importOriginal<any>();
  return {
    ...real,
    usePanel: () => {
      const panel = real.usePanel();
      if (!watch.on || typeof panel.decide !== 'function') return panel;
      return {
        ...panel,
        decide: () => {
          watch.decide += 1;
          const decisions = panel.decide();
          return {
            ...decisions,
            learningPathCards: () => {
              watch.routeCards += 1;
              return decisions.learningPathCards();
            },
          };
        },
      };
    },
  };
});
// Redesign 6B: the look this pin runs under, stated: today's ("clasico", what every account without
// the new design gets). The page reads it since 6B; the new look's view has its own tests.
vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: 'clasico', setLook: () => {} }) }));
vi.mock('@/components/layout/MainLayout', () => ({ default: marker('MainLayout', undefined, true) }));
vi.mock('@/components/common/Avatar', () => ({ default: marker('Avatar') }));
vi.mock('@/components/courses', () => ({ NetflixCourseRow: marker('NetflixCourseRow', (p) => p.title) }));
vi.mock('@/components/courses/UpcomingCourseCard', () => ({ UpcomingCourseCard: marker('UpcomingCourseCard', (p) => p.course?.id) }));
vi.mock('@/components/learning-paths', () => ({ LearningPathCard: marker('LearningPathCard', (p) => p.id) }));
vi.mock('@/components/course-proposals', () => ({ CourseProposalSection: marker('CourseProposalSection') }));
vi.mock('@/components/badges', () => ({ BadgesSection: marker('BadgesSection') }));
vi.mock('@/components/community/WorkspaceSettingsModal', () => ({ default: marker('WorkspaceSettingsModal') }));
vi.mock('@/components/community/MemberProfileModal', () => ({ MemberProfileModal: marker('MemberProfileModal') }));

const PAGE = process.env.PANEL_CLASICO_PAGE || '@/pages/dashboard';
const { default: Dashboard } = (await import(/* @vite-ignore */ PAGE)) as { default: React.ComponentType };
import { getExternalSchoolLabel } from '@/constants/externalSchools';
import { canEditWorkspaceWithRoles } from '@/lib/services/communityWorkspace';
import { metadataHasRole } from '@/utils/roleUtils';

// ── The fetch fake: answers by address, can fail or stay pending, writes each call down. ──

const EMPTY: Record<string, unknown> = {
  '/api/news?limit=3': { articles: [] },
  '/api/youtube/latest?limit=2': { videos: [] },
  '/api/dashboard/stats': { totalUsers: 0, mostCompletedCourse: null, topLearner: null },
  '/api/upcoming-courses': [],
  '/api/learning-paths/my-paths': [],
};

/**
 * Each call is written with its address and headers, as today; and with its WHOLE second argument
 * (and any further one) as soon as that holds anything but `headers` alone (a `method`, a `body`,
 * `credentials`, `cache`, an empty object), so an option added to a call changes the log.
 */
function fakeFetch(url: string, ...args: unknown[]) {
  const init = args[0] as Record<string, unknown> | undefined;
  const entry: Record<string, unknown> = { fetch: url, headers: init?.headers ?? '«none»' };
  const headersOnly = init !== undefined && Object.keys(init).length === 1 && 'headers' in init;
  if (args.length > 0 && !headersOnly) entry.init = describeProps(init as any);
  if (args.length > 1) entry.more = describeProps({ args: args.slice(1) });
  log(entry);
  const answer: Answer = S().fetch?.[url] ?? { status: 200, body: EMPTY[url] };
  if (answer === 'reject') return Promise.reject(new TypeError('Synthetic network failure'));
  if (answer === 'pending') return new Promise(() => {});
  const status = answer.status ?? 200;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(answer.body),
  });
}

// ── Invented data. ──

const NOW = new Date('2026-11-16T12:00:00Z');
const ago = (minutes: number) => NOW.getTime() - minutes * 60 * 1000;

function sessionFor(id: string, metadata: Record<string, unknown> = {}) {
  return {
    access_token: `synthetic-token-${id}`,
    user: { id, email: `${id}@example.invalid`, user_metadata: metadata },
  };
}

const profile = (over: Record<string, unknown> = {}) => ({
  first_name: 'Ana',
  last_name: 'Inventada',
  avatar_url: null,
  school: 'Colegio Inventado del Norte',
  description: null,
  must_change_password: false,
  external_school_affiliation: null,
  ...over,
});

const ADMIN_COURSES = [
  {
    id: 'course-a1',
    title: 'Curso Inventado de Evaluación',
    description: 'Una descripción inventada',
    thumbnail_url: 'https://img.example.invalid/course-a1.png',
    instructor_id: 'instructor-1',
    estimated_duration_hours: 6,
    difficulty_level: 'intermedio',
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

const assigned = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
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

const DOCENTE_ASSIGNMENTS = [
  assigned('course-d1', 'Curso en Progreso Alto'),
  assigned('course-d2', 'Curso en Progreso Bajo', { instructors: null }),
  assigned('course-d3', 'Curso Inscrito sin Avance', { thumbnail_url: 'default-thumbnail.png' }),
  assigned('course-d4', 'Curso Asignado sin Comenzar'),
  assigned('course-d5', 'Curso Completado'),
];
const DOCENTE_ENROLMENTS = [
  { course_id: 'course-d2', progress_percentage: 20, is_completed: false, enrolled_at: '2026-10-05T10:00:00Z' },
  { course_id: 'course-d1', progress_percentage: 70, is_completed: false, enrolled_at: '2026-10-02T10:00:00Z' },
  { course_id: 'course-d3', progress_percentage: 0, is_completed: false, enrolled_at: '2026-10-09T10:00:00Z' },
  { course_id: 'course-d5', progress_percentage: 100, is_completed: true, enrolled_at: '2026-09-09T10:00:00Z' },
];

const PATHS = [
  {
    id: 'path-1',
    name: 'Ruta Inventada con Avance',
    description: 'Una ruta inventada',
    assigned_at: '2026-10-10T10:00:00Z',
    progress: {
      total_courses: 4,
      completed_courses: 1,
      progress_percentage: 25,
      last_accessed: '2026-11-10T10:00:00Z',
    },
  },
  { id: 'path-2', name: 'Ruta Inventada sin Avance', description: null, assigned_at: '2026-10-11T10:00:00Z' },
  { id: 'path-3', name: 'Ruta Inventada sin Fecha', description: 'Sin fecha de asignación', progress: { total_courses: 2 } },
  { id: 'path-4', name: 'Ruta Inventada que no se Dibuja', description: 'La cuarta', assigned_at: '2026-10-12T10:00:00Z' },
];

const UPCOMING = [
  { id: 'up-1', title: 'Próximo Curso Inventado Uno', description: 'Pronto' },
  { id: 'up-2', title: 'Próximo Curso Inventado Dos', description: null },
  { id: 'up-3', title: 'Próximo Curso Inventado Tres', description: 'Más adelante' },
];

const NEWS = {
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

const VIDEOS = {
  videos: [
    {
      id: 'video-1',
      title: 'Video Inventado de Hace Semanas',
      description: 'Uno',
      thumbnail: 'https://img.example.invalid/video-1.jpg',
      publishedAt: '2026-11-02T12:00:00Z',
    },
    {
      id: 'video-2',
      title: 'Video Inventado Antiguo',
      description: 'Dos',
      thumbnail: 'https://img.example.invalid/video-2.jpg',
      publishedAt: '2026-09-01T12:00:00Z',
    },
  ],
};

// Below 1,000 (send-back 1), and written through the 'en-US' stand-in (send-back 2): the same in
// every language of the process, including those that write digits of their own.
const STATS_FULL = {
  totalUsers: 987,
  statsLabel: 'Estadísticas de tu Colegio',
  mostCompletedCourse: {
    id: 'course-d1',
    title: 'Curso en Progreso Alto',
    completionCount: 12,
    instructor_name: 'Relatora Ficticia',
  },
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
const STATS_BARE = {
  totalUsers: 7,
  mostCompletedCourse: { id: 'course-d2', title: 'Curso en Progreso Bajo', completionCount: 3 },
  topLearner: { id: 'learner-2', name: 'Carla Ficticia', email: 'carla@example.invalid', completedCourses: 2 },
};
const STATS_NULLS = { totalUsers: null, statsLabel: null, mostCompletedCourse: null, topLearner: null };

const FULL_FETCH: Record<string, Answer> = {
  '/api/news?limit=3': { body: NEWS },
  '/api/youtube/latest?limit=2': { body: VIDEOS },
  '/api/dashboard/stats': { body: STATS_FULL },
  '/api/upcoming-courses': { body: UPCOMING },
  '/api/learning-paths/my-paths': { body: PATHS },
};

const VIEWER = 'user-docente';
const role = (over: Record<string, unknown>) => ({
  id: 'role-1',
  user_id: VIEWER,
  role_type: 'docente',
  is_active: true,
  assigned_at: '2026-01-01T00:00:00Z',
  ...over,
});
const COMMUNITY_N = { id: 'com-n', name: 'Comunidad Inventada Norte' };
const COMMUNITY_S = { id: 'com-s', name: 'Comunidad Inventada Sur' };
const SCHOOL_N = { id: 'school-n', name: 'Colegio Inventado del Norte' };

const MEMBERS = [
  { id: 'member-1', first_name: 'Diego', last_name: 'Imaginario', avatar_url: 'https://img.example.invalid/m1.png', user_roles: [{ role_type: 'docente' }] },
  { id: 'member-2', first_name: 'Carla', last_name: 'Ficticia', user_roles: [{ role_type: 'lider_comunidad' }] },
  { id: 'member-3', name: 'Solo Nombre Inventado' },
  { id: 'member-4' },
  {
    id: 'member-5',
    first_name: 'Elena',
    last_name: 'Supuesta',
    user_roles: [{ role_type: 'consultor' }],
    external_school_affiliation: 'colegio_inventado_sur',
  },
  { id: VIEWER, first_name: 'Ana', last_name: 'Inventada', user_roles: [{ role_type: 'docente' }] },
];

// ── Scenarios. ──

function docente(over: Partial<Scenario> = {}): Scenario {
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

function admin(over: Partial<Scenario> = {}): Scenario {
  return {
    session: sessionFor('user-admin', { roles: ['admin'] }),
    tables: {
      profiles: [{ data: profile({ first_name: 'Beatriz', last_name: 'Administradora' }), error: null }],
      courses: [{ data: ADMIN_COURSES, error: null }],
    },
    effective: { effectiveRole: 'admin', isAdmin: true },
    roles: [role({ id: 'role-admin', user_id: 'user-admin', role_type: 'admin' })],
    fetch: FULL_FETCH,
    ...over,
  };
}

function fullDocente(over: Partial<Scenario> = {}): Scenario {
  return docente({
    tables: {
      profiles: [{ data: profile(), error: null }],
      course_assignments: [{ data: DOCENTE_ASSIGNMENTS, error: null }],
      course_enrollments: [{ data: DOCENTE_ENROLMENTS, error: null }],
    },
    fetch: FULL_FETCH,
    ...over,
  });
}

function withCommunity(over: Partial<Scenario> = {}, roleOver: Record<string, unknown> = {}): Scenario {
  return docente({
    roles: [role({ community_id: 'com-n', community: COMMUNITY_N, school: SCHOOL_N, ...roleOver })],
    members: { 'com-n': MEMBERS },
    workspaces: { 'com-n': { id: 'ws-n', community_id: 'com-n', name: 'Espacio Norte', custom_name: null, image_url: null } },
    ...over,
  });
}

function twoCommunities(over: Partial<Scenario> = {}): Scenario {
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

// ── Drawing. ──

/** Lets every pending promise of the page settle (the fakes answer with promises only). */
async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

let view: ReturnType<typeof render>;
async function draw(scenario: Scenario) {
  mocks.scenario = scenario;
  view = render(<Dashboard />);
  await settle();
}
const markup = () => serialise(view.asFragment());
const theLog = () => serialise(mocks.log);
const both = () => [markup(), theLog()];

async function click(element: Element | null) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}
async function call(fn: () => unknown) {
  await act(async () => {
    await fn();
  });
  await settle();
}
const communityBar = () => screen.getByText('Mi Comunidad de Crecimiento').closest('button');

// The process's default language must not reach the digests (send-back 2). For the length of each
// test, `toLocaleString` on a number called WITHOUT a language (or with `undefined` for it) writes
// as the real one does for 'en-US'; a call that names a language passes through unchanged. Every
// call is kept in `localeCalls` (not in the digested log), so a test can assert that the page names
// no language. `realToLocaleString` is the real function, for the thousands case.
const realToLocaleString = Number.prototype.toLocaleString;
const localeCalls: { value: number; args: unknown[] }[] = [];
let localeStandIn: { mockRestore: () => void } | null = null;
function installLocaleStandIn() {
  localeStandIn = vi
    .spyOn(Number.prototype, 'toLocaleString')
    .mockImplementation(function standIn(this: number, ...args: any[]) {
      localeCalls.push({ value: Number(this), args });
      if (args.length === 0 || args[0] === undefined) {
        return realToLocaleString.call(this, 'en-US', ...args.slice(1));
      }
      return realToLocaleString.apply(this, args as []);
    });
}
function removeLocaleStandIn() {
  localeStandIn?.mockRestore();
  localeStandIn = null;
}

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  localeCalls.length = 0;
  installLocaleStandIn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.log = [];
  mocks.props = {};
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  // The page's own error lines are part of what it does; React's warnings are not the page's.
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) log({ 'console.error': first });
  });
  vi.mocked(mocks.router.push).mockClear();
  for (const fn of Object.values(client.auth)) vi.mocked(fn as any).mockClear();
  vi.mocked(client.from).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  consoleError?.mockRestore();
  consoleError = null;
  removeLocaleStandIn();
  if (Number.prototype.toLocaleString !== realToLocaleString) {
    throw new Error('the stand-in of Number.prototype.toLocaleString was not put back after the test');
  }
});

// ── The machine does not reach the pin (send-back 2). ──

describe('the machine does not reach the pin', () => {
  it('the time zone fixed at the top of this file took (UTC): otherwise every dated digest fails', () => {
    const day = new Date('2026-09-01T23:30:00Z').getDate();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (day !== 1 || zone !== 'UTC') {
      throw new Error(
        [
          `The time zone of this test process is not UTC (2026-09-01T23:30:00Z falls on day ${day}; the zone is ${zone}).`,
          'This file sets process.env.TZ in vi.hoisted, which Node reads again only in a child process:',
          "it holds while this repository's Vitest runs files in child processes (threads: false).",
          'If the configuration now runs files in worker threads, the dates of the panel follow the',
          "machine's zone and the digests below fail for that reason, not because the panel changed.",
        ].join('\n')
      );
    }
  });

  it("the page writes the numbers with toLocaleString() and names no language (the stand-in's premise)", async () => {
    await draw(fullDocente());
    const card = screen.getByText('Educadores Activos').parentElement!;
    expect(card.querySelector('p.text-5xl')!.textContent).toBe('987');
    const ofTheCard = localeCalls.filter((c) => c.value === 987);
    expect(ofTheCard.length).toBeGreaterThan(0);
    // A product edit that adds a language (or options) to the call fails here, even where that
    // language happens to write 987 the same.
    expect(ofTheCard.map((c) => c.args)).toEqual(ofTheCard.map(() => []));
  });
});

// ── The cases. ──

describe("today's panel (pinned before 6A)", () => {
  pinned('1. the loading mark while the main loader waits (docente)', async () => {
    await draw(docente({ getUser: 'pending', fetch: FULL_FETCH }));
    expect(screen.getByText('Cargando...')).toBeTruthy();
    return both();
  });

  pinned('2. admin without a community: the whole catalogue, proposals placed', async () => {
    await draw(admin());
    return both();
  });

  pinned('3a. consultor with an affiliation, proposals by a user_roles row (metadata names no role)', async () => {
    await draw(
      docente({
        session: sessionFor('user-consultor', {}),
        tables: {
          profiles: [{ data: profile({ first_name: 'Elena', last_name: 'Supuesta', external_school_affiliation: 'colegio_inventado_sur' }), error: null }],
          course_assignments: [{ data: [assigned('course-c1', 'Curso del Consultor')], error: null }],
          course_enrollments: [{ data: [], error: null }],
        },
        effective: { effectiveRole: 'consultor', isAdmin: false },
        roles: [role({ id: 'role-c', user_id: 'user-consultor', role_type: 'consultor', school_id: 'school-n' })],
      })
    );
    return both();
  });

  pinned('3b. consultor with an affiliation, proposals by the metadata alone', async () => {
    await draw(
      docente({
        session: sessionFor('user-consultor', { roles: ['consultor'] }),
        tables: {
          profiles: [{ data: profile({ first_name: 'Elena', last_name: 'Supuesta', external_school_affiliation: 'colegio_inventado_sur' }), error: null }],
          course_assignments: [{ data: [], error: null }],
        },
        effective: { effectiveRole: 'consultor', isAdmin: false },
        roles: [],
      })
    );
    return both();
  });

  pinned('4a. docente with everything: courses, routes, upcoming, news, videos, full numbers', async () => {
    await draw(fullDocente());
    return both();
  });

  pinned('4b. docente, numbers without a relator and a top learner without photo, role or school', async () => {
    await draw(fullDocente({ fetch: { ...FULL_FETCH, '/api/dashboard/stats': { body: STATS_BARE } } }));
    return both();
  });

  pinned('5a. docente with assignments but no course ids after the null filter', async () => {
    await draw(
      docente({
        tables: {
          profiles: [{ data: profile(), error: null }],
          course_assignments: [{ data: [{ course_id: 'course-gone', courses: null }], error: null }],
        },
      })
    );
    return both();
  });

  pinned('5b. docente with no assignments at all', async () => {
    await draw(docente({ tables: { profiles: [{ data: profile(), error: null }], course_assignments: [{ data: null, error: null }] } }));
    return both();
  });

  pinned('6. nothing anywhere: empty answers and numbers with null values', async () => {
    await draw(docente({ fetch: { '/api/dashboard/stats': { body: STATS_NULLS } } }));
    return both();
  });

  pinned('7a. every fetch rejected', async () => {
    await draw(
      docente({
        fetch: Object.fromEntries(Object.keys(EMPTY).map((url) => [url, 'reject' as Answer])),
      })
    );
    return both();
  });

  pinned('7b. every fetch answering 500', async () => {
    await draw(
      docente({
        fetch: Object.fromEntries(Object.keys(EMPTY).map((url) => [url, { status: 500, body: { error: 'x' } } as Answer])),
      })
    );
    return both();
  });

  pinned('8a. the numbers still loading while the rest is drawn', async () => {
    await draw(fullDocente({ fetch: { ...FULL_FETCH, '/api/dashboard/stats': 'pending' } }));
    return both();
  });

  pinned('8b. the news and the videos still loading', async () => {
    await draw(
      fullDocente({
        fetch: { ...FULL_FETCH, '/api/news?limit=3': 'pending', '/api/youtube/latest?limit=2': 'pending' },
      })
    );
    return both();
  });

  pinned('9a. one community, bar closed', async () => {
    await draw(withCommunity());
    return both();
  });

  pinned('9b. one community, bar opened, without the right to edit (no gear)', async () => {
    await draw(withCommunity());
    await click(communityBar());
    expect(screen.queryByTitle('Configuración')).toBeNull();
    return both();
  });

  pinned('9c. one community, bar opened, with the right to edit (the gear)', async () => {
    await draw(withCommunity({}, { role_type: 'community_manager' }));
    await click(communityBar());
    expect(screen.getByTitle('Configuración')).toBeTruthy();
    return both();
  });

  pinned('9d. one community with zero members, bar opened', async () => {
    await draw(withCommunity({ members: { 'com-n': [] } }));
    await click(communityBar());
    return both();
  });

  pinned('9e. one community with exactly four members, bar closed (no «+N»)', async () => {
    await draw(withCommunity({ members: { 'com-n': MEMBERS.slice(0, 4) } }));
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    return both();
  });

  pinned('10a. two communities: the picker after opening, then the second pill', async () => {
    await draw(twoCommunities());
    const closed = markup();
    await click(communityBar());
    const opened = markup();
    await click(screen.getByRole('button', { name: 'Comunidad Inventada Sur' }));
    return [closed, opened, markup(), theLog()];
  });

  pinned('10b. a role with community_id but no joined community: no bar', async () => {
    await draw(docente({ roles: [role({ community_id: 'com-x', community: null })], members: { 'com-x': MEMBERS.slice(0, 2) } }));
    expect(screen.queryByText('Mi Comunidad de Crecimiento')).toBeNull();
    return both();
  });

  pinned('11a. a workspace with an image and a custom name: gear, onUpdate, onClose', async () => {
    await draw(
      withCommunity(
        {
          workspaces: {
            'com-n': {
              id: 'ws-n',
              community_id: 'com-n',
              name: 'Espacio Norte',
              custom_name: 'Nuestro Espacio Inventado',
              image_url: 'https://img.example.invalid/ws-n.png',
            },
          },
        },
        { role_type: 'community_manager' }
      )
    );
    const closed = markup();
    await click(communityBar());
    await click(screen.getByTitle('Configuración'));
    const settings = markup();
    expect(mocks.props.WorkspaceSettingsModal).toBeTruthy();
    await call(() =>
      mocks.props.WorkspaceSettingsModal.onUpdate({
        customName: 'Nombre Nuevo Inventado',
        imageUrl: 'https://img.example.invalid/ws-n-new.png',
      })
    );
    const updated = markup();
    await call(() => mocks.props.WorkspaceSettingsModal.onClose());
    expect(document.querySelector('[data-marker="WorkspaceSettingsModal"]')).toBeNull();
    return [closed, settings, updated, markup(), theLog()];
  });

  pinned('11b. the gear pressed when the workspace failed to load: nothing opens', async () => {
    await draw(withCommunity({ workspaces: {} }, { role_type: 'community_manager' }));
    await click(communityBar());
    await click(screen.getByTitle('Configuración'));
    expect(document.querySelector('[data-marker="WorkspaceSettingsModal"]')).toBeNull();
    return both();
  });

  pinned('12. a member tile pressed (another person, then the viewer), onClose', async () => {
    await draw(withCommunity());
    await click(communityBar());
    await click(screen.getByText('Diego Imaginario').closest('button'));
    const other = markup();
    expect(JSON.parse(document.querySelector('[data-marker="MemberProfileModal"]')!.getAttribute('data-props')!).isCurrentUser).toBe(false);
    await call(() => mocks.props.MemberProfileModal.onClose());
    const closed = markup();
    await click(screen.getByText('Tú').closest('button'));
    expect(JSON.parse(document.querySelector('[data-marker="MemberProfileModal"]')!.getAttribute('data-props')!).isCurrentUser).toBe(true);
    return [other, closed, markup(), theLog()];
  });

  pinned('13a. a profile with a first name only («¡Hola, Usuario!»)', async () => {
    await draw(docente({ tables: { profiles: [{ data: profile({ last_name: null }), error: null }], course_assignments: [{ data: [], error: null }] } }));
    expect(screen.getByText(/¡Hola, Usuario!/)).toBeTruthy();
    return both();
  });

  pinned('13b. an avatar from the session cache younger than 30 minutes', async () => {
    window.sessionStorage.setItem(
      'fne-avatar-cache',
      JSON.stringify({ [VIEWER]: { url: 'https://img.example.invalid/cached.png', timestamp: ago(10) } })
    );
    await draw(docente());
    return both();
  });

  pinned('13c. an avatar from the session cache older than 30 minutes', async () => {
    window.sessionStorage.setItem(
      'fne-avatar-cache',
      JSON.stringify({ [VIEWER]: { url: 'https://img.example.invalid/cached.png', timestamp: ago(40) } })
    );
    await draw(docente());
    return both();
  });

  pinned('13d. an avatar from the profile (and the cache updated with it)', async () => {
    await draw(
      docente({
        tables: {
          profiles: [{ data: profile({ avatar_url: 'https://img.example.invalid/profile.png' }), error: null }],
          course_assignments: [{ data: [], error: null }],
        },
      })
    );
    expect(mocks.log).toContainEqual({ updateAvatarCache: [VIEWER, 'https://img.example.invalid/profile.png'] });
    return both();
  });
});

describe("today's panel: behaviour", () => {
  pinned('14. no session: to /login, the loading mark stays, the loader asks nothing', async () => {
    await draw(docente({ session: null }));
    expect(mocks.router.push).toHaveBeenCalledWith('/login');
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(screen.getByText('Cargando...')).toBeTruthy();
    return both();
  });

  pinned('15a. no profile row: to the profile with the error', async () => {
    await draw(docente({ tables: { profiles: [{ data: null, error: { message: 'Synthetic: no rows' } }] } }));
    expect(mocks.router.push).toHaveBeenCalledWith('/profile?from=dashboard&error=profile-fetch-failed');
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
    return both();
  });

  pinned('15b. «Auth session missing»: refresh, the second read, then the page', async () => {
    await draw(
      docente({
        tables: {
          profiles: [
            { data: null, error: { message: 'Auth session missing!' } },
            { data: profile(), error: null },
          ],
          course_assignments: [{ data: [], error: null }],
        },
        refresh: { data: { session: { access_token: 'synthetic-refreshed' } }, error: null },
      })
    );
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mocks.log.filter((e: any) => e?.supabase === 'profiles')).toHaveLength(2);
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(screen.queryByText('Cargando...')).toBeNull();
    return both();
  });

  pinned('16. must_change_password: to /change-password', async () => {
    await draw(docente({ tables: { profiles: [{ data: profile({ must_change_password: true }), error: null }] } }));
    expect(mocks.router.push).toHaveBeenCalledWith('/change-password');
    return both();
  });

  pinned('17. the loader throwing: to /login, loading over', async () => {
    await draw(docente({ getUser: 'throw' }));
    expect(mocks.router.push).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Cargando...')).toBeNull();
    return both();
  });

  pinned('18. getUser answering an error: loading ends, the page draws with what it has', async () => {
    await draw(docente({ getUser: { error: { message: 'Synthetic user error' } } }));
    expect(screen.queryByText('Cargando...')).toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
    return both();
  });

  it('19a. the arrival toast: the key removed and the toast after 100 ms', async () => {
    window.sessionStorage.setItem('fne-password-change-success', 'true');
    mocks.scenario = docente();
    render(<Dashboard />);
    expect(window.sessionStorage.getItem('fne-password-change-success')).toBeNull();
    expect(mocks.log).not.toContainEqual({ toastSuccess: 'Contraseña actualizada exitosamente' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(mocks.log.filter((e: any) => e?.toastSuccess)).toEqual([{ toastSuccess: 'Contraseña actualizada exitosamente' }]);
    await settle();
  });

  it('19c. the arrival toast: not at 99 ms, at 100 ms (fake timers)', async () => {
    // The clock of `beforeEach` fakes `Date` only; it is put back and installed again with timers.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    window.sessionStorage.setItem('fne-password-change-success', 'true');
    mocks.scenario = docente({ getUser: 'pending' });
    await act(async () => {
      render(<Dashboard />);
    });
    const toasts = () => mocks.log.filter((e: any) => e?.toastSuccess);
    expect(toasts()).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(99);
    });
    expect(toasts()).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(toasts()).toEqual([{ toastSuccess: 'Contraseña actualizada exitosamente' }]);
  });

  it('19b. no arrival toast without the key', async () => {
    window.sessionStorage.setItem('fne-password-change-success', 'false');
    mocks.scenario = docente();
    render(<Dashboard />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    await settle();
    expect(mocks.log.filter((e: any) => e?.toastSuccess)).toEqual([]);
    expect(window.sessionStorage.getItem('fne-password-change-success')).toBe('false');
  });

  it("20. sign-out through MainLayout's onLogout", async () => {
    await draw(docente());
    window.localStorage.setItem('rememberMe', 'true');
    window.sessionStorage.setItem('sessionOnly', 'true');
    mocks.log = [];
    await call(() => mocks.props.MainLayout.onLogout());
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('rememberMe')).toBeNull();
    expect(window.sessionStorage.getItem('sessionOnly')).toBeNull();
    expect(mocks.log).toEqual(['auth.signOut', { 'router.push': '/login' }]);
  });

  it('20b. sign-out while the loading mark shows', async () => {
    await draw(docente({ getUser: 'pending' }));
    mocks.log = [];
    await call(() => mocks.props.MainLayout.onLogout());
    expect(mocks.log).toEqual(['auth.signOut', { 'router.push': '/login' }]);
  });

  it("21. each course row's onCourseSelect and a route card's onClick", async () => {
    await draw(fullDocente());
    mocks.log = [];
    await call(() => mocks.props['NetflixCourseRow:Continuar Aprendiendo'].onCourseSelect('abc'));
    await call(() => mocks.props['NetflixCourseRow:Mis Cursos Abiertos'].onCourseSelect('abc'));
    await call(() => mocks.props['LearningPathCard:path-2'].onClick());
    expect(mocks.log).toEqual([
      { 'router.push': '/student/course/abc' },
      { 'router.push': '/student/course/abc' },
      { 'router.push': '/mi-aprendizaje/ruta/path-2' },
    ]);
  });

  it('4c. a number in the thousands is written as this machine writes it (not digested)', async () => {
    // This case is about the machine's own language: the stand-in is off, and the page is compared
    // with the real function (send-back 2).
    removeLocaleStandIn();
    await draw(fullDocente({ fetch: { ...FULL_FETCH, '/api/dashboard/stats': { body: { ...STATS_FULL, totalUsers: 1234 } } } }));
    const card = screen.getByText('Educadores Activos').parentElement!;
    expect(Number.prototype.toLocaleString).toBe(realToLocaleString);
    expect(card.querySelector('p.text-5xl')!.textContent).toBe(realToLocaleString.call(1234));
  });

  pinned('23. the session changes after the first load: the loader runs again for the new person', async () => {
    await draw(docente());
    const first = markup();
    mocks.scenario = docente({
      session: sessionFor('user-docente-dos', { roles: ['docente'] }),
      tables: {
        profiles: [{ data: profile({ first_name: 'Rosa', last_name: 'Segunda' }), error: null }],
        course_assignments: [{ data: [], error: null }],
      },
      roles: [role({ id: 'role-dos', user_id: 'user-docente-dos' })],
    });
    await act(async () => {
      view.rerender(<Dashboard />);
    });
    await settle();
    expect(client.auth.getUser).toHaveBeenCalledTimes(2);
    expect(mocks.log).toContainEqual({ supabase: 'profiles', ops: expect.arrayContaining([['eq', 'id', 'user-docente-dos']]) });
    expect(screen.getByText(/¡Hola, Rosa!/)).toBeTruthy();
    return [first, markup(), theLog()];
  });

  pinned('22a. the order of everything asked on load: admin', async () => {
    await draw(admin());
    return [theLog()];
  });

  pinned('22b. the order of everything asked on load: docente', async () => {
    await draw(fullDocente());
    return [theLog()];
  });

  pinned('22c. the order of everything asked on load: two communities', async () => {
    await draw(twoCommunities());
    return [theLog()];
  });
});

describe('the decisions run only where the markup ran them (send-back 1)', () => {
  const label = vi.mocked(getExternalSchoolLabel);
  const canEdit = vi.mocked(canEditWorkspaceWithRoles);
  const hasRole = vi.mocked(metadataHasRole);
  beforeEach(() => {
    label.mockClear();
    canEdit.mockClear();
    hasRole.mockClear();
    watch.on = true;
    watch.decide = 0;
    watch.routeCards = 0;
  });
  afterEach(() => {
    watch.on = false;
  });

  it('with the main loader pending, none of the decisions has been worked out', async () => {
    await draw(docente({ getUser: 'pending', fetch: FULL_FETCH }));
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(label).not.toHaveBeenCalled();
    expect(canEdit).not.toHaveBeenCalled();
    // Before 6A the loader had not reached its own `metadataHasRole` yet, and nothing else asked it.
    expect(hasRole).not.toHaveBeenCalled();
    expect(watch.decide).toBe(0);
  });

  it('a consultor whose loader waits on the roles: no affiliation label while the loading mark shows', async () => {
    await draw(
      docente({
        session: sessionFor('user-consultor', { roles: ['consultor'] }),
        tables: {
          profiles: [{ data: profile({ external_school_affiliation: 'colegio_inventado_sur' }), error: null }],
        },
        effective: { effectiveRole: 'consultor', isAdmin: false },
        rolesPending: true,
      })
    );
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(label).not.toHaveBeenCalled();
    // Only the loader's own call (`adminRole`), as before 6A.
    expect(hasRole).toHaveBeenCalledTimes(1);
    expect(watch.decide).toBe(0);
  });

  it('a community manager whose loader waits on the members: the gear rule is not asked while loading', async () => {
    await draw(withCommunity({ membersPending: true }, { role_type: 'community_manager' }));
    expect(screen.getByText('Cargando...')).toBeTruthy();
    expect(canEdit).not.toHaveBeenCalled();
    expect(watch.decide).toBe(0);
  });

  it('a community whose bar is closed: the gear rule is asked only once the bar is opened', async () => {
    await draw(withCommunity({}, { role_type: 'community_manager' }));
    expect(watch.decide).toBeGreaterThan(0);
    expect(canEdit).not.toHaveBeenCalled();
    await click(communityBar());
    expect(canEdit).toHaveBeenCalled();
    expect(canEdit.mock.calls.every(([, communityId]) => communityId === 'com-n')).toBe(true);
  });

  it('the route cards are worked out only for an account with routes', async () => {
    await draw(docente());
    expect(watch.decide).toBeGreaterThan(0);
    expect(watch.routeCards).toBe(0);
    view.unmount();
    await draw(fullDocente());
    expect(watch.routeCards).toBeGreaterThan(0);
  });
});

describe('the digests file', () => {
  it(`holds exactly the ${CASES} pinned cases above, and every one of them ran`, () => {
    if (process.env.PANEL_CLASICO_ACCEPT) return; // being rewritten on purpose
    expect(Object.keys(DIGESTS).sort()).toEqual([...ran].sort());
    expect(ran.size).toBe(CASES);
    for (const digest of Object.values(DIGESTS)) expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
