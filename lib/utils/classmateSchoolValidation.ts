/**
 * Returns the subset of requested classmate IDs that do NOT have at least one
 * active user_roles row at the requester's school.
 *
 * This is the source-of-truth contract for classmate school membership:
 * a classmate is valid iff they have AT LEAST ONE active role at
 * `requesterSchoolId`. Extra active rows at other schools or with a null
 * school_id do NOT invalidate them — this mirrors the eligible-classmates
 * picker's `.eq('school_id', requesterSchoolId)` filter so picker and
 * validators stay aligned.
 */
export function classmatesMissingSchool(
    classmateIds: string[],
    classmateRoles: Array<{ user_id: string; school_id: number | null }>,
    requesterSchoolId: number,
): string[] {
    const atSchool = new Set(
        classmateRoles
            .filter(r => r.school_id === requesterSchoolId)
            .map(r => r.user_id),
    );
    return classmateIds.filter(id => !atSchool.has(id));
}
