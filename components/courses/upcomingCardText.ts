/**
 * The release date of an upcoming course, one copy for both looks (redesign 6B). Moved word for word
 * out of `UpcomingCourseCard.tsx`, which imports it back; the new look's upcoming card calls it too.
 */

// Format release date in Spanish (e.g., "Marzo 2026")
export const formatReleaseDate = (dateString: string | null): string | null => {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
};
