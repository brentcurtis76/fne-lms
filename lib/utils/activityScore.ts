export interface ActivityScoreBreakdown {
  assignments: number;
  lessons: number;
  recency: number;
}

export interface ActivityScoreResult {
  total: number;
  breakdown: ActivityScoreBreakdown;
}

export function calculateActivityScore(
  assignments_submitted: number,
  assignments_total: number,
  total_lessons_completed: number,
  lastActivity: string | Date
): ActivityScoreResult {
  // Assignments component (45% weight, max ~450 with volume bonus)
  let assignments: number;
  let lessons: number;

  if (assignments_total === 0) {
    assignments = 0;
    // Lesson-heavy fallback: 85% weight
    lessons = Math.min(total_lessons_completed * 85, 850);
  } else {
    const volume_bonus = Math.log2(assignments_total + 1);
    assignments = (assignments_submitted / assignments_total) * volume_bonus * 450;
    lessons = Math.min(total_lessons_completed * 40, 400);
  }

  // Recency component (15% weight, max 150)
  const lastActivityDate = new Date(lastActivity);
  const weeksInactive = Math.floor(
    (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
  );
  const recency = Math.max(150 - weeksInactive * 10, 0);

  const total = assignments + lessons + recency;

  return {
    total,
    breakdown: { assignments, lessons, recency },
  };
}
