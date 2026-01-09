'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, BarChart2, Target, Play, ChevronRight, User, BookOpen, CheckCircle2 } from 'lucide-react';
import { NetflixCourseCardProps } from '@/types/courses';
import { CourseThumbnail } from './CourseThumbnail';

/**
 * Netflix-style course card with hover expansion
 * Shows expanded info panel below the card on hover
 */
export function NetflixCourseCard({
  course,
  enrollment,
  onSelect,
}: NetflixCourseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Handle click outside to close on mobile
  useEffect(() => {
    if (!isMobile || !isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile, isExpanded]);

  // Handle mouse enter with delay
  const handleMouseEnter = useCallback(() => {
    if (isMobile) return;
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(true);
    }, 300); // Delay before expanding
  }, [isMobile]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (isMobile) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsExpanded(false);
  }, [isMobile]);

  // Handle tap on mobile
  const handleTap = useCallback(() => {
    if (!isMobile) return;
    if (isExpanded) {
      // Second tap navigates
      onSelect?.(course.id);
    } else {
      setIsExpanded(true);
    }
  }, [isMobile, isExpanded, course.id, onSelect]);

  // Handle CTA click
  const handleCTAClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(course.id);
  }, [course.id, onSelect]);

  // Get CTA text based on enrollment status
  const getCTAText = (): string => {
    if (!enrollment) return 'Ver Detalles';
    if (enrollment.is_completed) return 'Repasar';
    if (enrollment.progress_percentage > 0) return 'Continuar';
    return 'Comenzar';
  };

  // Get difficulty badge color (using brand colors)
  const getDifficultyColor = (level: string | null): string => {
    switch (level?.toLowerCase()) {
      case 'beginner':
        return 'bg-brand_beige text-brand_primary';
      case 'intermediate':
        return 'bg-brand_accent/80';
      case 'advanced':
        return 'bg-brand_primary border border-brand_accent';
      default:
        return 'bg-gray-500/80';
    }
  };

  // Get difficulty label in Spanish
  const getDifficultyLabel = (level: string | null): string => {
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

  // Format duration
  const formatDuration = (hours: number | null): string => {
    if (!hours) return '';
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    return `${hours}h`;
  };

  // Check if user prefers reduced motion
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Animation variants - no scaling, just z-index for overlay
  const cardVariants = {
    default: {
      zIndex: 1,
      transition: { duration: prefersReducedMotion ? 0 : 0.2 }
    },
    expanded: {
      zIndex: 50,
      transition: { duration: prefersReducedMotion ? 0 : 0.2 }
    }
  };

  const contentVariants = {
    hidden: {
      opacity: 0,
      height: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.15 }
    },
    visible: {
      opacity: 1,
      height: 'auto',
      transition: { duration: prefersReducedMotion ? 0 : 0.2, delay: prefersReducedMotion ? 0 : 0.05 }
    }
  };

  return (
    <motion.div
      ref={cardRef}
      className="relative cursor-pointer"
      variants={cardVariants}
      initial="default"
      animate={isExpanded ? 'expanded' : 'default'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleTap}
    >
      <div
        className={`overflow-hidden rounded-lg bg-brand_primary shadow-lg transition-all duration-200 ${
          isExpanded ? 'shadow-2xl ring-2 ring-brand_accent' : 'hover:shadow-xl'
        }`}
      >
        {/* Thumbnail Section - prioritize instructor photo over course thumbnail */}
        <div className="relative">
          {course.instructor?.photo_url ? (
            // Use instructor photo as main thumbnail - 4:3 aspect ratio for better vertical space
            <div className="aspect-[4/3] w-full overflow-hidden">
              <img
                src={course.instructor.photo_url}
                alt={course.instructor.full_name}
                className="h-full w-full object-cover object-top"
              />
            </div>
          ) : course.thumbnail_url ? (
            // Fallback to course thumbnail if no instructor photo
            <div className="aspect-[4/3] w-full overflow-hidden">
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            // Final fallback: generated thumbnail
            <CourseThumbnail
              title={course.title}
              instructorName={course.instructor?.full_name}
              instructorPhotoUrl={course.instructor?.photo_url}
              difficultyLevel={course.difficulty_level}
            />
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-brand_primary via-brand_primary/40 to-transparent" />

          {/* Completed badge - top right */}
          {enrollment?.is_completed && (
            <div className="absolute right-2 top-2 z-10">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-xs font-semibold text-brand_primary shadow-lg">
                <CheckCircle2 className="h-3 w-3" />
                Completado
              </span>
            </div>
          )}

          {/* Title and instructor overlay on thumbnail (when collapsed) */}
          {!isExpanded && (
            <div className="absolute inset-x-0 bottom-0 p-3">
              <h3 className="line-clamp-2 text-sm font-bold text-white md:text-base">
                {course.title}
              </h3>
              {course.instructor && (
                <p className="mt-1 text-xs font-medium text-brand_accent">
                  {course.instructor.full_name}
                </p>
              )}
            </div>
          )}

          {/* Progress bar (when enrolled) */}
          {enrollment && enrollment.progress_percentage > 0 && (
            <div className="absolute inset-x-0 bottom-0">
              <div className="h-1 w-full bg-gray-700">
                <div
                  className={`h-full transition-all duration-300 ${
                    enrollment.is_completed ? 'bg-amber-400' : 'bg-brand_accent'
                  }`}
                  style={{ width: `${enrollment.progress_percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="bg-brand_primary"
            >
              <div className="space-y-3 p-4">
                {/* Title (in expanded state) */}
                <h3 className="text-base font-bold leading-tight text-white">
                  {course.title}
                </h3>

                {/* Instructor */}
                {course.instructor && (
                  <div className="flex items-center gap-2">
                    {course.instructor.photo_url ? (
                      <img
                        src={course.instructor.photo_url}
                        alt={course.instructor.full_name}
                        className="h-6 w-6 rounded-full object-cover ring-1 ring-brand_accent"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand_accent">
                        <User className="h-3 w-3 text-brand_primary" />
                      </div>
                    )}
                    <span className="text-sm font-medium text-brand_accent">
                      {course.instructor.full_name}
                    </span>
                  </div>
                )}

                {/* Meta badges row */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Duration badge */}
                  {course.estimated_duration_hours && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-gray-300">
                      <Clock className="h-3 w-3" />
                      {formatDuration(course.estimated_duration_hours)}
                    </span>
                  )}

                  {/* Difficulty badge */}
                  {course.difficulty_level && getDifficultyLabel(course.difficulty_level) && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white ${getDifficultyColor(course.difficulty_level)}`}
                    >
                      <BarChart2 className="h-3 w-3" />
                      {getDifficultyLabel(course.difficulty_level)}
                    </span>
                  )}

                  {/* Lessons count */}
                  {enrollment && enrollment.total_lessons && enrollment.total_lessons > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-gray-300">
                      <BookOpen className="h-3 w-3" />
                      {enrollment.total_lessons} lecciones
                    </span>
                  )}
                </div>

                {/* Progress section */}
                {enrollment && enrollment.total_lessons && enrollment.total_lessons > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">
                        {enrollment.lessons_completed || 0} de {enrollment.total_lessons} lecciones
                      </span>
                      <span className={`font-medium ${enrollment.is_completed ? 'text-amber-400' : 'text-brand_accent'}`}>
                        {enrollment.progress_percentage}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                      <div
                        className={`h-full transition-all duration-300 ${
                          enrollment.is_completed ? 'bg-amber-400' : 'bg-brand_accent'
                        }`}
                        style={{ width: `${enrollment.progress_percentage}%` }}
                      />
                    </div>
                    {enrollment.is_completed && (
                      <div className="flex items-center gap-1 text-xs text-amber-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Curso completado</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Description - full text */}
                {course.description && (
                  <p className="text-sm leading-relaxed text-gray-400">
                    {course.description}
                  </p>
                )}

                {/* Learning objectives */}
                {course.learning_objectives && course.learning_objectives.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
                      <Target className="h-3.5 w-3.5 text-brand_accent" />
                      <span>Objetivos de aprendizaje</span>
                    </div>
                    <ul className="space-y-1 pl-5">
                      {course.learning_objectives.slice(0, 4).map((objective, index) => (
                        <li
                          key={index}
                          className="list-disc text-xs leading-relaxed text-gray-400 marker:text-brand_accent"
                        >
                          {objective}
                        </li>
                      ))}
                      {course.learning_objectives.length > 4 && (
                        <li className="list-none text-xs text-gray-500">
                          +{course.learning_objectives.length - 4} más...
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* CTA Button */}
                <button
                  onClick={handleCTAClick}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-brand_accent py-2.5 text-sm font-semibold text-brand_primary transition-colors hover:bg-amber-400"
                >
                  <Play className="h-4 w-4" />
                  {getCTAText()}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default NetflixCourseCard;
