/**
 * Shared school-membership check for group-formation validators.
 *
 * Uses set-based presence semantics: a classmate is valid iff they have at
 * least one active `user_roles` row at `requesterSchoolId`. Extra active
 * rows with `school_id = null` or a different school_id are ignored.
 *
 * This must stay aligned with the `.eq('school_id', requesterSchoolId)` /
 * `.eq('is_active', true)` filter in
 * `pages/api/assignments/eligible-classmates.ts`, which is the source of
 * truth for the "at least one role at school" contract.
 */
export function classmatesMissingSchool(
  classmateIds: string[],
  classmateRoles: Array<{ user_id: string; school_id: number | null }>,
  requesterSchoolId: number,
): string[] {
  const atSchool = new Set(
    classmateRoles
      .filter((r) => r.school_id === requesterSchoolId)
      .map((r) => r.user_id),
  );
  return classmateIds.filter((id) => !atSchool.has(id));
}
