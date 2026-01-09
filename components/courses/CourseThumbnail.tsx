import React from 'react';
import { CourseThumbnailProps } from '@/types/courses';

/**
 * Dynamic course thumbnail component
 * Generates an attractive thumbnail using CSS when no image is available
 * Uses Genera brand colors: black (#0a0a0a), yellow (#fbbf24)
 */
export function CourseThumbnail({
  title,
  instructorName,
  instructorPhotoUrl,
  difficultyLevel,
  className = '',
}: CourseThumbnailProps) {
  // Get initials from instructor name for fallback avatar
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get difficulty badge color (using brand colors)
  const getDifficultyColor = (level: string | null | undefined): string => {
    switch (level?.toLowerCase()) {
      case 'beginner':
        return 'bg-brand_beige text-brand_primary';
      case 'intermediate':
        return 'bg-brand_accent text-brand_primary';
      case 'advanced':
        return 'bg-brand_primary border border-brand_accent text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  // Get difficulty label in Spanish
  const getDifficultyLabel = (level: string | null | undefined): string => {
    switch (level?.toLowerCase()) {
      case 'beginner':
        return 'Principiante';
      case 'intermediate':
        return 'Intermedio';
      case 'advanced':
        return 'Avanzado';
      default:
        return '';
    }
  };

  // Truncate title to fit the thumbnail
  const truncateTitle = (text: string, maxLength: number = 60): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  return (
    <div
      className={`relative aspect-[4/3] w-full overflow-hidden rounded-lg ${className}`}
      style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1f1f1f 50%, #0a0a0a 100%)',
      }}
    >
      {/* Subtle geometric pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(30deg, #fbbf24 12%, transparent 12.5%, transparent 87%, #fbbf24 87.5%, #fbbf24),
            linear-gradient(150deg, #fbbf24 12%, transparent 12.5%, transparent 87%, #fbbf24 87.5%, #fbbf24),
            linear-gradient(30deg, #fbbf24 12%, transparent 12.5%, transparent 87%, #fbbf24 87.5%, #fbbf24),
            linear-gradient(150deg, #fbbf24 12%, transparent 12.5%, transparent 87%, #fbbf24 87.5%, #fbbf24),
            linear-gradient(60deg, rgba(251, 191, 36, 0.3) 25%, transparent 25.5%, transparent 75%, rgba(251, 191, 36, 0.3) 75%, rgba(251, 191, 36, 0.3)),
            linear-gradient(60deg, rgba(251, 191, 36, 0.3) 25%, transparent 25.5%, transparent 75%, rgba(251, 191, 36, 0.3) 75%, rgba(251, 191, 36, 0.3))
          `,
          backgroundSize: '80px 140px',
          backgroundPosition: '0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px',
        }}
      />

      {/* Content container */}
      <div className="relative z-10 flex h-full items-center p-4">
        {/* Left side - Course title */}
        <div className="flex-1 pr-4">
          <h3 className="font-sans text-lg font-bold leading-tight text-white md:text-xl">
            {truncateTitle(title)}
          </h3>
          {instructorName && (
            <p className="mt-2 text-sm text-gray-400">
              {instructorName}
            </p>
          )}
        </div>

        {/* Right side - Instructor photo or initials */}
        {instructorName && (
          <div className="flex-shrink-0">
            <div className="relative h-16 w-16 overflow-hidden rounded-full ring-2 ring-brand_accent ring-offset-2 ring-offset-brand_primary md:h-20 md:w-20">
              {instructorPhotoUrl ? (
                <img
                  src={instructorPhotoUrl}
                  alt={instructorName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand_accent to-brand_accent_hover">
                  <span className="text-lg font-bold text-brand_primary md:text-xl">
                    {getInitials(instructorName)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Difficulty badge - bottom left */}
      {difficultyLevel && getDifficultyLabel(difficultyLevel) && (
        <div className="absolute bottom-3 left-3 z-10">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getDifficultyColor(difficultyLevel)}`}
          >
            {getDifficultyLabel(difficultyLevel)}
          </span>
        </div>
      )}

      {/* Subtle gradient overlay at bottom for better text contrast */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
}

export default CourseThumbnail;
