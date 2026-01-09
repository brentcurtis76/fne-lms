import { useMemo } from 'react';
import {
  UserAssignmentsResponse,
  OverlapInfo
} from '../../../../types/assignment-matrix';

interface UseOverlapDetectionReturn {
  /**
   * Check if adding a course would create an overlap
   */
  checkCourseOverlap: (courseId: string) => OverlapInfo;

  /**
   * Check if user already has this LP assigned
   */
  checkLPOverlap: (pathId: string) => OverlapInfo;
}

export function useOverlapDetection(
  userAssignments: UserAssignmentsResponse | null
): UseOverlapDetectionReturn {
  // Build a set of all course IDs the user already has
  const existingCourseIds = useMemo(() => {
    if (!userAssignments) return new Set<string>();

    return new Set(
      userAssignments.assignments
        .filter(a => a.type === 'course')
        .map(a => a.contentId)
    );
  }, [userAssignments]);

  // Map of course ID to its source for detailed messages
  const courseSourceMap = useMemo(() => {
    if (!userAssignments) return new Map<string, { source: string; title: string }>();

    const map = new Map<string, { source: string; title: string }>();
    userAssignments.assignments
      .filter(a => a.type === 'course')
      .forEach(a => {
        let sourceLabel: string;
        switch (a.source) {
          case 'asignacion_directa':
            sourceLabel = 'asignación directa';
            break;
          case 'ruta':
            sourceLabel = `ruta "${a.sourceLPNames[0] || 'sin nombre'}"`;
            break;
          case 'directa_y_ruta':
            sourceLabel = 'asignación directa y ruta';
            break;
          default:
            sourceLabel = 'inscripción existente';
        }
        map.set(a.contentId, { source: sourceLabel, title: a.contentTitle });
      });

    return map;
  }, [userAssignments]);

  const checkCourseOverlap = (courseId: string): OverlapInfo => {
    const hasOverlap = existingCourseIds.has(courseId);

    if (!hasOverlap) {
      return {
        hasOverlap: false,
        message: '',
        canProceed: true,
        overlappingCourses: []
      };
    }

    const existing = courseSourceMap.get(courseId);
    const message = existing
      ? `El usuario ya tiene "${existing.title}" por ${existing.source}. No se creará duplicado.`
      : 'El usuario ya tiene este curso. No se creará duplicado.';

    return {
      hasOverlap: true,
      message,
      canProceed: true, // Non-blocking in Phase 1
      overlappingCourses: [courseId]
    };
  };

  // Build a set of assigned LP IDs
  const existingLPIds = useMemo(() => {
    if (!userAssignments) return new Set<string>();

    return new Set(
      userAssignments.assignments
        .filter(a => a.type === 'learning_path')
        .map(a => a.contentId)
    );
  }, [userAssignments]);

  // Map LP ID to title
  const lpTitleMap = useMemo(() => {
    if (!userAssignments) return new Map<string, string>();

    const map = new Map<string, string>();
    userAssignments.assignments
      .filter(a => a.type === 'learning_path')
      .forEach(a => {
        map.set(a.contentId, a.contentTitle);
      });
    return map;
  }, [userAssignments]);

  const checkLPOverlap = (pathId: string): OverlapInfo => {
    const hasOverlap = existingLPIds.has(pathId);

    if (!hasOverlap) {
      return {
        hasOverlap: false,
        message: '',
        canProceed: true,
        overlappingCourses: []
      };
    }

    const lpTitle = lpTitleMap.get(pathId);
    const message = lpTitle
      ? `El usuario ya tiene asignada la ruta "${lpTitle}".`
      : 'El usuario ya tiene asignada esta ruta.';

    return {
      hasOverlap: true,
      message,
      canProceed: true, // Non-blocking in Phase 1
      overlappingCourses: []
    };
  };

  return {
    checkCourseOverlap,
    checkLPOverlap
  };
}
