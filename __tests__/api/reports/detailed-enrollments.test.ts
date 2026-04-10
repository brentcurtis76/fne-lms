import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateActivityScore } from '../../../lib/utils/activityScore';

/**
 * The detailed report API (pages/api/reports/detailed.ts) is heavily coupled
 * to Supabase auth, profiles, and multiple tables. Instead of mocking the
 * entire API, we extract the progress-builder logic (lines 451-563) and test
 * it in isolation against the same data shapes the handler consumes.
 *
 * This covers the enrollment-based progress computation introduced in
 * fix/rpt-enrollments.
 */

// --- Types mirroring the API handler ---

interface CourseEnrollment {
  user_id: string;
  course_id: string;
  progress_percentage: number | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

interface LessonProgress {
  user_id: string;
  lesson_id: string;
  completed_at: string | null;
  time_spent: number; // seconds
  completion_data?: any;
}

interface ProgressUser {
  user_id: string;
  user_name: string;
  user_email: string;
  total_courses_enrolled: number;
  completed_courses: number;
  courses_in_progress: number;
  completion_percentage: number;
  total_lessons_completed: number;
  total_time_spent_minutes: number;
  last_activity_date: string | null;
  assignments_submitted: number;
  assignments_total: number;
  activity_score: number;
}

interface BuilderInput {
  profile: { id: string; first_name: string; last_name: string; email: string };
  enrollments: CourseEnrollment[];
  lessonProgress: LessonProgress[];
  lessonAssignmentsByCourse: Map<string, number>;
  lessonSubmissionsByUser: Map<string, Set<string>>;
  groupAssignmentTotalsByUser: Map<string, Set<string>>;
  groupSubmissionsByUser: Map<string, Set<string>>;
}

/**
 * Mirrors the per-user progress computation from
 * pages/api/reports/detailed.ts lines 452-562.
 */
function buildProgressUser(input: BuilderInput): ProgressUser {
  const {
    profile,
    enrollments,
    lessonProgress,
    lessonAssignmentsByCourse,
    lessonSubmissionsByUser,
    groupAssignmentTotalsByUser,
    groupSubmissionsByUser,
  } = input;

  const total_courses_enrolled = enrollments.length;
  const completed_courses = enrollments.filter(
    (e) => e.is_completed || (e.progress_percentage != null && e.progress_percentage >= 100)
  ).length;

  const completedBlocks = lessonProgress.filter((l) => l.completed_at);
  const uniqueCompletedLessons = new Set(completedBlocks.map((l) => l.lesson_id));
  const uniqueLessonCount = uniqueCompletedLessons.size;

  const completion_percentage =
    uniqueLessonCount > 0
      ? Math.min(Math.round((uniqueLessonCount / Math.max(total_courses_enrolled * 5, 1)) * 100), 100)
      : 0;

  const total_lessons_completed = uniqueCompletedLessons.size;

  const total_time_spent_minutes = Math.round(
    lessonProgress.reduce((sum, l) => sum + (l.time_spent || 0), 0) / 60
  );

  // Determine most recent activity from lesson progress or course enrollments
  const lessonActivities = lessonProgress.map((l) => l.completed_at).filter(Boolean) as string[];
  const courseActivities = enrollments
    .map((e) => e.updated_at || e.created_at)
    .filter(Boolean) as string[];
  const allActivities = [...lessonActivities, ...courseActivities];
  const lastActivity = allActivities.length > 0 ? allActivities.sort().reverse()[0] : null;

  // Calculate assignment data
  const userEnrolledCourseIds = enrollments.map((e) => e.course_id);
  const lessonAssignmentsTotal = userEnrolledCourseIds.reduce(
    (sum, courseId) => sum + (lessonAssignmentsByCourse.get(courseId) || 0),
    0
  );
  const lessonAssignmentsSubmitted = lessonSubmissionsByUser.get(profile.id)?.size || 0;
  const groupAssignmentsTotal = groupAssignmentTotalsByUser.get(profile.id)?.size || 0;
  const groupAssignmentsSubmitted = groupSubmissionsByUser.get(profile.id)?.size || 0;

  const assignments_total = lessonAssignmentsTotal + groupAssignmentsTotal;
  const assignments_submitted = lessonAssignmentsSubmitted + groupAssignmentsSubmitted;

  const { total: activity_score } = calculateActivityScore(
    assignments_submitted,
    assignments_total,
    total_lessons_completed,
    lastActivity || new Date(0).toISOString()
  );

  return {
    user_id: profile.id,
    user_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    user_email: profile.email,
    total_courses_enrolled,
    completed_courses,
    courses_in_progress: total_courses_enrolled - completed_courses,
    completion_percentage,
    total_lessons_completed,
    total_time_spent_minutes,
    last_activity_date: lastActivity,
    assignments_submitted,
    assignments_total,
    activity_score,
  };
}

// --- Helpers ---

const PROFILE = { id: 'u1', first_name: 'Ana', last_name: 'García', email: 'ana@test.cl' };

function makeEnrollment(overrides: Partial<CourseEnrollment> = {}): CourseEnrollment {
  return {
    user_id: 'u1',
    course_id: 'c1',
    progress_percentage: 50,
    is_completed: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

function makeLesson(overrides: Partial<LessonProgress> = {}): LessonProgress {
  return {
    user_id: 'u1',
    lesson_id: 'les1',
    completed_at: '2026-03-10T12:00:00Z',
    time_spent: 300, // 5 minutes in seconds
    ...overrides,
  };
}

const emptyMaps = () => ({
  lessonAssignmentsByCourse: new Map<string, number>(),
  lessonSubmissionsByUser: new Map<string, Set<string>>(),
  groupAssignmentTotalsByUser: new Map<string, Set<string>>(),
  groupSubmissionsByUser: new Map<string, Set<string>>(),
});

// --- Tests ---

describe('Detailed Report — enrollment-based progress builder', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a) User with course_enrollments and lesson_assignments', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const maps = emptyMaps();
    // Course c1 has 3 lesson assignments, c2 has 2
    maps.lessonAssignmentsByCourse.set('c1', 3);
    maps.lessonAssignmentsByCourse.set('c2', 2);
    // User submitted 2 lesson assignments
    maps.lessonSubmissionsByUser.set('u1', new Set(['la1', 'la2']));

    const result = buildProgressUser({
      profile: PROFILE,
      enrollments: [
        makeEnrollment({ course_id: 'c1' }),
        makeEnrollment({ course_id: 'c2', progress_percentage: 30 }),
      ],
      lessonProgress: [
        makeLesson({ lesson_id: 'les1' }),
        makeLesson({ lesson_id: 'les2', completed_at: '2026-03-11T12:00:00Z' }),
        makeLesson({ lesson_id: 'les3', completed_at: '2026-03-12T12:00:00Z' }),
      ],
      ...maps,
    });

    expect(result.total_courses_enrolled).toBe(2);
    // 3 + 2 = 5 lesson assignments total
    expect(result.assignments_total).toBe(5);
    expect(result.assignments_submitted).toBe(2);
    expect(result.total_lessons_completed).toBe(3);
    expect(result.courses_in_progress).toBe(2); // none completed
    expect(result.activity_score).toBeGreaterThan(0);
  });

  it('b) User with course_enrollments but NO course_assignments', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const maps = emptyMaps();
    // No lesson assignments for the enrolled courses — maps stay empty

    const result = buildProgressUser({
      profile: PROFILE,
      enrollments: [
        makeEnrollment({ course_id: 'c1' }),
        makeEnrollment({ course_id: 'c2' }),
      ],
      lessonProgress: [
        makeLesson({ lesson_id: 'les1' }),
      ],
      ...maps,
    });

    expect(result.total_courses_enrolled).toBe(2);
    expect(result.assignments_total).toBe(0);
    expect(result.assignments_submitted).toBe(0);
    expect(result.total_lessons_completed).toBe(1);
    // Activity score should still be positive from lessons + recency
    expect(result.activity_score).toBeGreaterThan(0);
  });

  it('c) User with no enrollments at all', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const result = buildProgressUser({
      profile: PROFILE,
      enrollments: [],
      lessonProgress: [],
      ...emptyMaps(),
    });

    expect(result.total_courses_enrolled).toBe(0);
    expect(result.completed_courses).toBe(0);
    expect(result.courses_in_progress).toBe(0);
    expect(result.completion_percentage).toBe(0);
    expect(result.total_lessons_completed).toBe(0);
    expect(result.assignments_total).toBe(0);
    expect(result.assignments_submitted).toBe(0);
    expect(result.last_activity_date).toBeNull();
  });

  it('d) Course with 0 lesson_assignments but has group assignments', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const maps = emptyMaps();
    // No lesson assignments for course c1
    // But user has 2 group assignments, submitted 1
    maps.groupAssignmentTotalsByUser.set('u1', new Set(['ga1', 'ga2']));
    maps.groupSubmissionsByUser.set('u1', new Set(['ga1']));

    const result = buildProgressUser({
      profile: PROFILE,
      enrollments: [makeEnrollment({ course_id: 'c1' })],
      lessonProgress: [makeLesson({ lesson_id: 'les1' })],
      ...maps,
    });

    // lesson assignments = 0, group assignments = 2
    expect(result.assignments_total).toBe(2);
    // lesson submitted = 0, group submitted = 1
    expect(result.assignments_submitted).toBe(1);
    expect(result.total_courses_enrolled).toBe(1);
  });

  it('e) completed_courses count uses enrollment data (is_completed and progress_percentage)', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const result = buildProgressUser({
      profile: PROFILE,
      enrollments: [
        // Completed via is_completed flag
        makeEnrollment({ course_id: 'c1', is_completed: true, progress_percentage: 80 }),
        // Completed via progress_percentage = 100
        makeEnrollment({ course_id: 'c2', is_completed: false, progress_percentage: 100 }),
        // Not completed — both flags indicate in-progress
        makeEnrollment({ course_id: 'c3', is_completed: false, progress_percentage: 50 }),
      ],
      lessonProgress: [],
      ...emptyMaps(),
    });

    expect(result.completed_courses).toBe(2);
    expect(result.courses_in_progress).toBe(1);
    expect(result.total_courses_enrolled).toBe(3);
  });

  it('f) Activity date uses enrollment updated_at when no lesson activity exists', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const enrollmentDate = '2026-04-05T14:30:00Z';

    const result = buildProgressUser({
      profile: PROFILE,
      enrollments: [
        makeEnrollment({
          course_id: 'c1',
          updated_at: enrollmentDate,
          created_at: '2026-01-01T00:00:00Z',
        }),
      ],
      lessonProgress: [], // no lesson activity
      ...emptyMaps(),
    });

    // With no lesson completions, last_activity_date should come from enrollment
    expect(result.last_activity_date).toBe(enrollmentDate);
  });
});
