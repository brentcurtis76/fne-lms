// @vitest-environment node
/**
 * The stray colours (redesign phase 4b) stay converted, and each one keeps the
 * name it was given.
 *
 * Phase 4b replaced the hex colours typed by hand on the platform's screens
 * with named values that hold exactly the old colour (`styles/fne-tokens.css`).
 * `brand-tokens.test.ts` checks that every name is declared and used; it cannot
 * see a hex left in, or one typed tomorrow, and it cannot see a colour list
 * pointing at the wrong name. This file does both:
 *
 *  1. NO STRAY HEX ON THE PLATFORM'S SCREENS. Every in-scope file is read as
 *     plain text and every `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` in it
 *     (any case; comments count) must be one of the brand kit's seven values,
 *     or sit in a path that is out of scope, or be listed below as a single
 *     literal left on purpose, with the exact number of times it appears. An
 *     exception that matches nothing, or matches a different number of times,
 *     fails too, so the lists cannot rot.
 *  2. WHICH NAME REPLACED WHICH COLOUR. The colour lists and constants phase 4b
 *     changed are pinned value by value. Each pin carries the hex the code held
 *     before phase 4b (commit 580575bc7) and the name that replaced it; the
 *     name must be declared in the token file with exactly that colour.
 *
 * Not a parser on purpose: plain file reads and one regular expression, so the
 * scan is fast and gives the same answer every time.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SUPPORTED_FILE_TYPES } from '../../types/documents';
import { toastStyles } from '../../constants/toastStyles';
import { getStatusColor } from '../../lib/utils/session-ui-helpers';
import type { SessionStatus } from '../../lib/types/consultor-sessions.types';

const REPO_ROOT = join(__dirname, '..', '..');
const TOKENS_CSS = readFileSync(join(REPO_ROOT, 'styles', 'fne-tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The brand kit: these seven values stay literal everywhere. */
const BRAND_KIT = new Set(['0a0a0a', 'fbbf24', 'ffffff', 'fff', 'f59e0b', 'fcd34d', '1f1f1f', '6b7280']);

/** Folders and files the scan reads (pages/api/ is left out below). */
const IN_SCOPE_ROOTS = [
  'pages', 'components', 'src', 'lib', 'utils', 'constants', 'config', 'types', 'hooks', 'contexts',
  'styles/notifications.css', 'styles/tour.css',
];

/** Files that are not text; everything else under the roots is read. */
const BINARY = /\.(png|jpe?g|gif|webp|ico|svgz|pdf|ttf|otf|woff2?|eot|mp3|mp4|webm|zip|gz)$/i;

/**
 * Whole paths left out. A pattern matches a file when it matches the file's
 * path or one of its folders; `*` stays inside one path segment, `**` crosses
 * segments. Every pattern must still match at least one file.
 */
const OUT_OF_SCOPE: ReadonlyArray<{ path: string; reason: string }> = [
  // Not screens.
  { path: 'pages/api', reason: 'server routes, not screens' },
  { path: '**/__tests__', reason: 'tests and their snapshots, not platform code' },
  { path: '**/*.test.*', reason: 'tests, not platform code' },
  // The course screens, being rebuilt elsewhere (Course Review).
  { path: 'pages/student', reason: 'course screens, rebuilt elsewhere' },
  { path: 'components/student', reason: 'course screens, rebuilt elsewhere' },
  { path: 'components/quiz/LearningQuizTaker.tsx', reason: 'course screens, rebuilt elsewhere' },
  { path: 'pages/admin/course-builder', reason: 'course screens, rebuilt elsewhere' },
  { path: 'components/blocks', reason: 'course screens, rebuilt elsewhere' },
  { path: 'src/components/TipTapEditor.tsx', reason: 'course screens, rebuilt elsewhere' },
  { path: 'src/components/CourseBuilderForm.tsx', reason: 'course screens, rebuilt elsewhere' },
  { path: 'lib/tiptap', reason: 'course screens, rebuilt elsewhere' },
  // The public site.
  { path: 'components/site', reason: 'public site' },
  { path: 'pages/index.tsx', reason: 'public site' },
  { path: 'pages/programas.tsx', reason: 'public site' },
  { path: 'pages/nosotros.tsx', reason: 'public site' },
  { path: 'pages/equipo.tsx', reason: 'public site' },
  { path: 'pages/privacidad.tsx', reason: 'public site' },
  { path: 'pages/noticias*', reason: 'public site (pages/noticias.tsx and pages/noticias/**)' },
  { path: 'pages/pasantias*', reason: 'public site (pages/pasantias.tsx and pages/pasantias/**)' },
  { path: 'components/pasantias*', reason: 'public site' },
  { path: 'lib/pasantias', reason: 'public site' },
  { path: 'components/Footer.tsx', reason: 'public site' },
  { path: 'components/ArticleContent.tsx', reason: 'public site: drawn only by the news article page' },
  // Documents, e-mails, proposals and file generators: the files that hold strays.
  { path: 'lib/emailTemplates.ts', reason: 'e-mail HTML' },
  { path: 'lib/email/expenseNotifications.ts', reason: 'e-mail HTML' },
  { path: 'lib/email/notification-digest.ts', reason: 'e-mail HTML' },
  { path: 'lib/email/render.ts', reason: 'e-mail HTML' },
  { path: 'lib/docxGenerator.ts', reason: 'Word file generator (its two hex are in comments)' },
  { path: 'lib/contract-document.ts', reason: 'contract document stylesheet for preview and PDF printing' },
  { path: 'components/contracts/ContractPDF.tsx', reason: 'PDF generator' },
  { path: 'components/contracts/ContractPDFComplete.tsx', reason: 'PDF generator' },
  { path: 'lib/propuestas/styles.ts', reason: 'proposal PDF generator' },
  { path: 'lib/propuestas/components/ConsultantCard.tsx', reason: 'proposal PDF generator' },
  { path: 'lib/propuestas/components/ModuleTable.tsx', reason: 'proposal PDF generator' },
  { path: 'lib/propuestas/components/PricingTable.tsx', reason: 'proposal PDF generator' },
  { path: 'lib/propuestas/components/TimelineBar.tsx', reason: 'proposal PDF generator' },
  { path: 'components/propuestas-web/ModuleTimeline.tsx', reason: 'proposal page part (also drawn by no screen)' },
  // The area being deleted (Vías de Transformación).
  { path: 'pages/admin/transformation*', reason: 'area being deleted' },
  { path: 'pages/community/transformation', reason: 'area being deleted' },
  { path: 'pages/community/workspace/transformation', reason: 'area being deleted' },
  { path: 'pages/vias-transformacion', reason: 'area being deleted' },
  { path: 'pages/test', reason: 'area being deleted' },
  { path: 'components/transformation', reason: 'area being deleted' },
  { path: 'lib/transformation', reason: 'area being deleted' },
  { path: 'types/transformation.ts', reason: 'area being deleted' },
  { path: 'utils/transformationReportPdf.ts', reason: 'area being deleted' },
  { path: 'hooks/useTransformationChat.ts', reason: 'area being deleted' },
  // Components no screen draws (docs/plan/redesign/inventory/leftovers.md, "Components that no screen draws").
  ...[
    'components/AssignTeachersModal.tsx',
    'components/BlockActionButtons.tsx',
    'components/BlockTitleWithActions.tsx',
    'components/BlockTutorial.tsx',
    'components/ClientOnly.tsx',
    'components/DragDropWrapper.tsx',
    'components/EventsTimeline.tsx',
    'components/LessonBreadcrumb.tsx',
    'components/LessonTimeline.tsx',
    'components/NewsSlider.tsx',
    'components/OptimizedVideo.tsx',
    'components/QuickHelp.tsx',
    'components/RegistrationModal.tsx',
    'components/TeamMemberImage.tsx',
    'components/TimelineEditor.tsx',
    'components/YouTubeHelper.tsx',
    'components/activity/ActivityCard.tsx',
    'components/activity/ActivityFeed.tsx',
    'components/activity/ActivityFeedPlaceholder.tsx',
    'components/activity/ActivityFilters.tsx',
    'components/activity/ActivityNotifications.tsx',
    'components/activity/ActivitySummary.tsx',
    'components/activity/QuickActions.tsx',
    'components/admin/ModernUserManagement.tsx',
    'components/assignments/AssignmentCard.tsx',
    'components/assignments/AssignmentForm.tsx',
    'components/assignments/CollaborativeSubmissionModal.tsx',
    'components/assignments/CreateGroupModal.tsx',
    'components/assignments/GroupSubmissionModal.tsx',
    'components/assignments/SimpleGroupSubmissionModal.tsx',
    'components/auth/AuthWrapper.tsx',
    'components/auth/ProtectedRoute.tsx',
    'components/blocks/BlockRenderer.tsx',
    'components/common/ErrorBoundary.tsx',
    'components/contracts/ContractPDF.tsx',
    'components/contracts/ContractPDFComplete.tsx',
    'components/dashboard/unified/AdvancedFilters.tsx',
    'components/dashboard/unified/CommunityHealthCard.tsx',
    'components/dashboard/unified/DashboardCard.tsx',
    'components/dashboard/unified/KPISummaryCard.tsx',
    'components/dashboard/unified/UnifiedDashboard.tsx',
    'components/dashboard/unified/UpcomingSessionsCard.tsx',
    'components/dashboard/unified/WorkspaceActivityCard.tsx',
    'components/feedback/FeedbackButton.tsx',
    'components/layout/Header-backup.tsx',
    'components/messaging/MessageThread.tsx',
    'components/notifications/MobileNotificationOptimizations.tsx',
    'components/notifications/NotificationSkeleton.tsx',
    'components/propuestas-web/ModuleTimeline.tsx',
    'components/quiz/QuizResultDisplay.tsx',
    'components/quiz/QuizTaker.tsx',
    'components/quotes/QuoteForm.tsx',
    'components/reports/EmptyStates.tsx',
    'components/reports/EnhancedMobileUserCard.tsx',
    'components/reports/ReportLoadingSkeleton.tsx',
    'components/reports/ResponsiveChart.tsx',
    'components/reports/VirtualizedTable.tsx',
    'components/sessions/CancellationDialog.tsx',
    'components/workspace/SimplifiedGroupAssignments.tsx',
    'components/workspace/WorkspaceSidebar.tsx',
    'src/components/CheckUserRole.tsx',
    'src/components/CourseBuilderTimeline.tsx',
    'src/components/LessonList.tsx',
    'src/components/VideoBlockEditor.tsx',
  ].map((path) => ({ path, reason: 'no screen draws it' })),
];

/**
 * Single literals left on purpose, per file: each value (lower case, no `#`)
 * with the exact number of times it appears in that file.
 */
const LEFT_ON_PURPOSE: ReadonlyArray<{ file: string; values: Readonly<Record<string, number>>; reason: string }> = [
  {
    file: 'components/admin/GeneraRoadmap.tsx',
    values: { d97706: 2, eab308: 2, '3b82f6': 3, '6366f1': 2, '8b5cf6': 3, '10b981': 3, ef4444: 2, ec4899: 1, '0ea5e9': 1 },
    reason: 'phase colour choices, default roadmap data and the new-phase colour: stored with the roadmap and compared',
  },
  {
    file: 'pages/community/workspace.tsx',
    values: { '3b82f6': 1, '10b981': 1, '8b5cf6': 1 },
    reason: 'compared with a thread category colour, never drawn',
  },
  {
    file: 'types/messaging.ts',
    values: { '3b82f6': 2, ef4444: 2, '10b981': 2, '6366f1': 1, '8b5cf6': 2 },
    reason: 'thread category colours are the values workspace.tsx compares; reaction colours are never drawn',
  },
  {
    file: 'types/activity.ts',
    values: { '0db14b': 2, a19c9b: 1, ef4044: 1, ae1b1f: 1, '744943': 1 },
    reason: 'activity colours copied into activity data; importance colours read only by components no screen draws',
  },
  {
    file: 'components/reports/AnalyticsDashboard.tsx',
    values: { ef4444: 1 },
    reason: 'the error colour feeds only a chart list nothing reads',
  },
  {
    file: 'components/reports/AnalyticsVisualization.tsx',
    values: { ef4444: 1 },
    reason: 'the error colour feeds only a chart list nothing reads',
  },
  { file: 'components/toast/ToastIcons.tsx', values: { '1a1a1a': 1 }, reason: 'dark grey, never read' },
  { file: 'constants/toastStyles.ts', values: { f3f4f6: 1 }, reason: 'light grey, never read' },
  { file: 'pages/registro.tsx', values: { d1d5db: 1, '9ca3af': 1 }, reason: 'in a code comment, not drawn' },
  { file: 'pages/registro-tractor.tsx', values: { d1d5db: 1, '9ca3af': 1 }, reason: 'in a code comment, not drawn' },
  // Not colours at all.
  { file: 'components/contracts/ContractForm.tsx', values: { '3b1191d3': 1 }, reason: 'an error report number in a comment' },
  { file: 'lib/utils/reconcileCuotas.ts', values: { '3b1191d3': 2 }, reason: 'an error report number in comments' },
  { file: 'pages/admin/qa/coverage.tsx', values: { '123': 1 }, reason: 'placeholder text of a build number' },
];

/** A hex colour: not part of a word or an HTML entity (`&#8203;`), and not followed by more of a word. */
const HEX = /(?<![&\w])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;

const toPosix = (path: string) => path.split(sep).join('/');

function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('**')
    .map((part) => part.split('*').map((text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

/** Does the pattern match the path or one of its folders? */
function matchesPathOrFolder(pattern: RegExp, path: string): boolean {
  const parts = path.split('/');
  for (let length = parts.length; length > 0; length -= 1) {
    if (pattern.test(parts.slice(0, length).join('/'))) return true;
  }
  return false;
}

function walk(absolute: string, found: string[]): void {
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return; // a root the repository does not have
  }
  if (stats.isDirectory()) {
    for (const name of readdirSync(absolute).sort()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(join(absolute, name), found);
    }
  } else if (!BINARY.test(absolute)) {
    found.push(toPosix(relative(REPO_ROOT, absolute)));
  }
}

const ALL_FILES: string[] = [];
for (const root of IN_SCOPE_ROOTS) walk(join(REPO_ROOT, root), ALL_FILES);

const OUT_PATTERNS = OUT_OF_SCOPE.map((entry) => ({ ...entry, pattern: globToRegExp(entry.path) }));
const isOutOfScope = (file: string) => OUT_PATTERNS.some(({ pattern }) => matchesPathOrFolder(pattern, file));
const SCANNED = ALL_FILES.filter((file) => !isOutOfScope(file));

/** Every non-brand hex per scanned file: value → count. */
function strayCounts(file: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of readFileSync(join(REPO_ROOT, file), 'utf8').matchAll(HEX)) {
    const value = match[1].toLowerCase();
    if (BRAND_KIT.has(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

describe('stray colours: none left on the platform\'s screens', () => {
  it('reads a sensible number of in-scope files', () => {
    // Guards against a scan that silently reads nothing (a moved root, a wrong pattern).
    expect(SCANNED.length).toBeGreaterThan(400);
    expect(SCANNED).toContain('styles/tour.css');
    expect(SCANNED).toContain('styles/notifications.css');
    expect(SCANNED).toContain('types/documents.ts');
  });

  it('finds no hex colour that is neither the brand kit nor a listed exception', () => {
    const exceptions = new Map(LEFT_ON_PURPOSE.map((entry) => [entry.file, entry.values]));
    const problems: string[] = [];
    for (const file of SCANNED) {
      const allowed = exceptions.get(file) ?? {};
      for (const [value, count] of strayCounts(file)) {
        const expected = allowed[value] ?? 0;
        if (count !== expected) problems.push(`${file}: #${value} appears ${count} times, the exceptions allow ${expected}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps every single-literal exception true: each value appears exactly as often as listed', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const { file, values } of LEFT_ON_PURPOSE) {
      if (seen.has(file)) problems.push(`${file} is listed twice`);
      seen.add(file);
      if (!SCANNED.includes(file)) {
        problems.push(`${file} is not a scanned file (missing, or out of scope)`);
        continue;
      }
      const found = strayCounts(file);
      for (const [value, count] of Object.entries(values)) {
        const actual = found.get(value) ?? 0;
        if (actual !== count) problems.push(`${file}: #${value} listed ${count} times, found ${actual}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps every out-of-scope path true: each still matches a file', () => {
    const unmatched = OUT_PATTERNS.filter(({ pattern }) => !ALL_FILES.some((file) => matchesPathOrFolder(pattern, file)));
    expect(unmatched.map(({ path }) => path)).toEqual([]);
  });

  it('gives every exception a reason', () => {
    for (const { path, reason } of OUT_OF_SCOPE) expect(reason.length, path).toBeGreaterThan(5);
    for (const { file, reason } of LEFT_ON_PURPOSE) expect(reason.length, file).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// 2. Which name replaced which colour.
// ---------------------------------------------------------------------------

function triplet(hex: string): string {
  const digits = hex.replace('#', '');
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)).join(' ');
}

const named = (name: string) => `rgb(var(--color-${name}))`;

/** The value the token file declares for `--color-<name>`, or null. */
function declared(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = [...TOKENS_CSS.matchAll(new RegExp(`(?:^|[\\s;{])--color-${escaped}\\s*:\\s*([^;]+);`, 'g'))];
  return found.length > 0 ? found[0][1].trim().replace(/\s+/g, ' ') : null;
}

/** Every [old hex, name] pair pinned below, so each name is checked against its colour. */
const PAIRS: Array<[string, string]> = [];
const pin = (hex: string, name: string): string => {
  PAIRS.push([hex, name]);
  return named(name);
};

/**
 * Text pins for lists and constants a test cannot import. `lines` are
 * consecutive lines of the file, compared without their indentation; `hex`
 * gives, in order, the colour each named value on those lines stands for (the
 * value at 580575bc7); `count` is how many times the block appears.
 */
type TextPin = { lines: string[]; hex: string[]; count: number };

// PINS-START (plain data: the scratch check reads it)
const TEXT_PINS: Record<string, TextPin[]> = {
  'components/toast/ToastIcons.tsx': [
    { lines: ["errorRed: 'rgb(var(--color-legacy-ef4044))',"], hex: ['#ef4044'], count: 1 },
    { lines: ["lightGray: 'rgb(var(--color-gray-100))',"], hex: ['#f3f4f6'], count: 1 },
    { lines: ["successGreen: 'rgb(var(--color-legacy-10b981))',"], hex: ['#10b981'], count: 1 },
  ],
  'constants/toastStyles.ts': [
    { lines: ["errorRed: 'rgb(var(--color-legacy-ef4044))',"], hex: ['#ef4044'], count: 1 },
    { lines: ["successGreen: 'rgb(var(--color-legacy-10b981))',"], hex: ['#10b981'], count: 1 },
  ],
  'lib/utils/session-ui-helpers.tsx': [
    { lines: ["pendiente_informe: 'rgb(var(--color-amber-600))', // amber-600"], hex: ['#D97706'], count: 1 },
    { lines: ["cancelada: 'rgb(var(--color-red-500))',         // red-500"], hex: ['#EF4444'], count: 1 },
  ],
  'components/reports/AnalyticsDashboard.tsx': [
    { lines: ["success: 'rgb(var(--color-legacy-10b981))',"], hex: ['#10b981'], count: 1 },
    { lines: ["info: 'rgb(var(--color-blue-500))',"], hex: ['#3b82f6'], count: 1 },
  ],
  'components/reports/AnalyticsVisualization.tsx': [
    { lines: ["success: 'rgb(var(--color-legacy-10b981))',"], hex: ['#10b981'], count: 1 },
    { lines: ["info: 'rgb(var(--color-blue-500))',"], hex: ['#3b82f6'], count: 1 },
  ],
  'pages/consultor/sessions/reports.tsx': [
    { lines: ["brand_accent_light: 'rgb(var(--color-amber-100))',"], hex: ['#fef3c7'], count: 1 },
    { lines: ["presencial: 'rgb(var(--color-blue-500))',"], hex: ['#3B82F6'], count: 1 },
    { lines: ["online: 'rgb(var(--color-legacy-10b981))',"], hex: ['#10B981'], count: 1 },
    {
      lines: ['title="Tasa de Completación"', 'value={`${kpis.completion_rate}%`}', 'icon={<CheckCircle className="w-6 h-6" />}', 'color="rgb(var(--color-legacy-10b981))"'],
      hex: ['#10B981'],
      count: 1,
    },
    {
      lines: ['title="Horas Programadas"', 'value={`${kpis.total_hours_scheduled}h`}', 'icon={<Clock className="w-6 h-6" />}', 'color="rgb(var(--color-blue-500))"'],
      hex: ['#3B82F6'],
      count: 1,
    },
    {
      lines: ['title="Pendientes de Informe"', 'value={kpis.sessions_pending_report}', 'icon={<FileText className="w-6 h-6" />}', 'color="rgb(var(--color-legacy-f97316))"'],
      hex: ['#F97316'],
      count: 1,
    },
    {
      lines: ['title="Próximas Sesiones"', 'value={kpis.upcoming_sessions}', 'icon={<CalendarClock className="w-6 h-6" />}', 'color="rgb(var(--color-legacy-6366f1))"'],
      hex: ['#6366F1'],
      count: 1,
    },
    {
      lines: ['title="Sesiones Canceladas"', 'value={kpis.cancelled_sessions}', 'icon={<XCircle className="w-6 h-6" />}', 'color="rgb(var(--color-red-500))"'],
      hex: ['#EF4444'],
      count: 1,
    },
    { lines: ['<Bar dataKey="completed" stackId="a" fill="rgb(var(--color-legacy-10b981))" name="Completadas" />'], hex: ['#10B981'], count: 1 },
    { lines: ['<Bar dataKey="cancelled" stackId="a" fill="rgb(var(--color-red-500))" name="Canceladas" />'], hex: ['#EF4444'], count: 1 },
    { lines: ['<Bar dataKey="other" stackId="a" fill="rgb(var(--color-gray-400))" name="Otras" />'], hex: ['#9CA3AF'], count: 1 },
    { lines: ['<Bar dataKey="total" fill="rgb(var(--color-blue-500))" name="Total" />'], hex: ['#3B82F6'], count: 1 },
    { lines: ['<Bar dataKey="completed" fill="rgb(var(--color-legacy-10b981))" name="Completadas" />'], hex: ['#10B981'], count: 1 },
  ],
  'pages/directivo/assessments/dashboard.tsx': [
    { lines: ["personalizacion: 'rgb(var(--color-blue-500))',"], hex: ['#3b82f6'], count: 1 },
    { lines: ["aprendizaje: 'rgb(var(--color-legacy-10b981))',"], hex: ['#10b981'], count: 1 },
    { lines: ["proposito: 'rgb(var(--color-legacy-8b5cf6))',"], hex: ['#8b5cf6'], count: 1 },
    { lines: ["familias: 'rgb(var(--color-legacy-ec4899))',"], hex: ['#ec4899'], count: 1 },
    { lines: ["trabajo_docente: 'rgb(var(--color-legacy-06b6d4))',"], hex: ['#06b6d4'], count: 1 },
    { lines: ["liderazgo: 'rgb(var(--color-legacy-f97316))',"], hex: ['#f97316'], count: 1 },
    { lines: ["const PIE_COLORS = ['rgb(var(--color-legacy-10b981))', '#f59e0b'];"], hex: ['#10b981'], count: 1 },
    { lines: ['dataKey="score"', 'stroke="rgb(var(--color-blue-600))"', 'fill="rgb(var(--color-blue-600))"'], hex: ['#2563eb', '#2563eb'], count: 1 },
  ],
  'components/hours/SchoolHoursReport.tsx': [
    { lines: ["const COLOR_CONSUMED = 'rgb(var(--color-legacy-003a5b))';"], hex: ['#003A5B'], count: 1 },
    { lines: ["const COLOR_RESERVED = 'rgb(var(--color-legacy-0066a4))';"], hex: ['#0066A4'], count: 1 },
    { lines: ["const COLOR_AVAILABLE = 'rgb(var(--color-legacy-e0f0ff))';"], hex: ['#E0F0FF'], count: 1 },
    { lines: ["const COLOR_AVAILABLE_WARNING = 'rgb(var(--color-amber-100))'; // yellow-100"], hex: ['#FEF3C7'], count: 1 },
    { lines: ["const COLOR_AVAILABLE_EXHAUSTED = 'rgb(var(--color-red-100))'; // red-100"], hex: ['#FEE2E2'], count: 1 },
    { lines: [": [{ name: 'Sin datos', value: 1, color: 'rgb(var(--color-gray-200))' }];"], hex: ['#e5e7eb'], count: 1 },
  ],
  'components/admin/GeneraRoadmap.tsx': [
    { lines: ["bgCard:   'rgb(var(--color-gray-50))',"], hex: ['#f9fafb'], count: 1 },
    { lines: ["bgHover:  'rgb(var(--color-gray-100))',"], hex: ['#f3f4f6'], count: 1 },
    { lines: ["border:   'rgb(var(--color-gray-200))',"], hex: ['#e5e7eb'], count: 1 },
    { lines: ["borderMid:'rgb(var(--color-gray-300))',"], hex: ['#d1d5db'], count: 1 },
    { lines: ["yellowHi: 'rgb(var(--color-amber-600))',"], hex: ['#d97706'], count: 1 },
    { lines: ["grayDark: 'rgb(var(--color-gray-700))',"], hex: ['#374151'], count: 1 },
    { lines: ["textBody: 'rgb(var(--color-gray-700))',"], hex: ['#374151'], count: 1 },
    { lines: ["textMid:  'rgb(var(--color-gray-400))',"], hex: ['#9ca3af'], count: 1 },
    { lines: ["textDim:  'rgb(var(--color-gray-300))',"], hex: ['#d1d5db'], count: 1 },
    { lines: ["color: hov ? (danger ? 'rgb(var(--color-red-500))' : BRAND.grayDark) : BRAND.grayMid,"], hex: ['#ef4444'], count: 1 },
    { lines: ["color: 'rgb(var(--color-amber-600))', background: 'transparent',"], hex: ['#d97706'], count: 1 },
    { lines: ["<div style={{ fontSize: 14, color: 'rgb(var(--color-amber-600))', lineHeight: 1.7 }}>"], hex: ['#d97706'], count: 1 },
    { lines: ["<span style={{ fontWeight: 400, color: 'rgb(var(--color-amber-600))' }}>[externo — iniciar hoy]</span>"], hex: ['#d97706'], count: 1 },
    { lines: ["<span style={{ color: 'rgb(var(--color-amber-600))' }}>"], hex: ['#d97706'], count: 1 },
  ],
  'components/admin/BulkUserImportModal.tsx': [
    { lines: ["background: 'rgb(var(--color-amber-100))',", "color: 'rgb(var(--color-amber-800))',"], hex: ['#FEF3C7', '#92400E'], count: 2 },
    { lines: ["style: { background: 'rgb(var(--color-amber-100))', color: 'rgb(var(--color-amber-800))' },"], hex: ['#FEF3C7', '#92400E'], count: 1 },
  ],
  'pages/admin/tractor-signups.tsx': [
    { lines: ["style: { background: 'rgb(var(--color-amber-100))', color: 'rgb(var(--color-amber-800))' },"], hex: ['#FEF3C7', '#92400E'], count: 2 },
  ],
  'pages/admin/user-management.tsx': [
    { lines: ["background: 'rgb(var(--color-legacy-10b981))',"], hex: ['#10B981'], count: 3 },
    { lines: ["background: 'rgb(var(--color-red-500))',"], hex: ['#EF4444'], count: 5 },
  ],
  'pages/admin/school-users.tsx': [
    { lines: ["style: { background: 'rgb(var(--color-legacy-10b981))', color: 'white' },"], hex: ['#10B981'], count: 3 },
    { lines: ["style: { background: 'rgb(var(--color-red-500))', color: 'white' },"], hex: ['#EF4444'], count: 4 },
  ],
  'components/ConsultantAssignmentModal.tsx': [
    { lines: ["color: 'rgb(var(--color-gray-900))'"], hex: ['#111827'], count: 1 },
  ],
};
// PINS-END

const NAMED_VALUE = /rgb\(var\(--color-([a-z0-9-]+)\)\)/g;
for (const pins of Object.values(TEXT_PINS)) {
  for (const { lines, hex } of pins) {
    const names = lines.flatMap((line) => [...line.matchAll(NAMED_VALUE)].map((match) => match[1]));
    if (names.length !== hex.length) throw new Error(`a pin names ${names.length} values but gives ${hex.length} hex: ${lines.join(' / ')}`);
    names.forEach((name, at) => PAIRS.push([hex[at], name]));
  }
}

function countBlock(fileLines: string[], block: string[]): number {
  let count = 0;
  for (let at = 0; at + block.length <= fileLines.length; at += 1) {
    if (block.every((line, offset) => fileLines[at + offset] === line)) count += 1;
  }
  return count;
}

describe('stray colours: each list keeps the name that replaced its colour', () => {
  it('pins the colour of every supported file type', () => {
    // Expected: [extension, the hex it had at 580575bc7, the name that holds that hex].
    const expected: Array<[string, string]> = [
      ['.pdf', pin('#ef4044', 'legacy-ef4044')],
      ['.doc', pin('#2563eb', 'blue-600')],
      ['.docx', pin('#2563eb', 'blue-600')],
      ['.xls', pin('#16a34a', 'green-600')],
      ['.xlsx', pin('#16a34a', 'green-600')],
      ['.ppt', pin('#ea580c', 'legacy-ea580c')],
      ['.pptx', pin('#ea580c', 'legacy-ea580c')],
      ['.jpg', pin('#8b5cf6', 'legacy-8b5cf6')],
      ['.jpeg', pin('#8b5cf6', 'legacy-8b5cf6')],
      ['.png', pin('#8b5cf6', 'legacy-8b5cf6')],
      ['.mp4', pin('#dc2626', 'red-600')],
    ];
    expect(SUPPORTED_FILE_TYPES.map((type) => [type.extension, type.color])).toEqual(expected);
  });

  it('pins every session status colour', () => {
    const expected: Record<SessionStatus, string> = {
      borrador: '#6B7280', // brand kit, stays hex
      pendiente_aprobacion: '#F59E0B', // brand kit
      programada: '#1f1f1f', // brand kit
      en_progreso: '#F59E0B', // brand kit
      pendiente_informe: pin('#D97706', 'amber-600'),
      completada: '#0a0a0a', // brand kit
      cancelada: pin('#EF4444', 'red-500'),
    };
    for (const [status, colour] of Object.entries(expected)) {
      expect(getStatusColor(status as SessionStatus), status).toBe(colour);
    }
  });

  it('pins the toast colours', () => {
    const errorRed = pin('#ef4044', 'legacy-ef4044');
    const successGreen = pin('#10b981', 'legacy-10b981');
    expect(toastStyles.error.style.borderLeft).toBe(`4px solid ${errorRed}`);
    expect(toastStyles.error.iconTheme.primary).toBe(errorRed);
    expect(toastStyles.success.iconTheme.primary).toBe(successGreen);
    // Brand kit, unchanged.
    // Since 5a the success edge reads a name of the new look, with today's colour as the fallback
    // (__tests__/constants/toastStyles.test.ts).
    expect(toastStyles.success.style.borderLeft).toBe('4px solid var(--toast-edge-success, #fbbf24)');
    expect(toastStyles.info.iconTheme.primary).toBe('#0a0a0a');
  });

  it('pins the lists and constants that are not exported, line by line', () => {
    const problems: string[] = [];
    for (const [file, pins] of Object.entries(TEXT_PINS)) {
      const fileLines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n').map((line) => line.trim());
      for (const { lines, count } of pins) {
        const found = countBlock(fileLines, lines);
        if (found !== count) problems.push(`${file}: "${lines.join(' / ')}" expected ${count} times, found ${found}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('declares every pinned name with exactly the colour it replaced', () => {
    expect(PAIRS.length).toBeGreaterThan(60);
    const problems: string[] = [];
    for (const [hex, name] of PAIRS) {
      const value = declared(name);
      if (value !== triplet(hex.toLowerCase())) problems.push(`--color-${name} holds ${value}, expected ${triplet(hex.toLowerCase())} (${hex})`);
    }
    expect(problems).toEqual([]);
  });
});
