'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, User, Clock } from 'lucide-react';

export interface UpcomingCourse {
  id: string;
  title: string;
  description: string | null;
  instructor_id: string | null;
  thumbnail_url: string | null;
  estimated_release_date: string | null;
  display_order: number;
  is_active: boolean;
  instructor?: {
    id: string;
    full_name: string;
  } | null;
}

interface UpcomingCourseCardProps {
  course: UpcomingCourse;
}

/**
 * Netflix-style card for upcoming/coming soon courses
 * Shows "Próximamente" badge and estimated release date
 * Expands on hover to show full description
 */
export function UpcomingCourseCard({ course }: UpcomingCourseCardProps) {
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
    setIsExpanded(!isExpanded);
  }, [isMobile, isExpanded]);

  // Format release date in Spanish (e.g., "Marzo 2026")
  const formatReleaseDate = (dateString: string | null): string | null => {
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

  const formattedDate = formatReleaseDate(course.estimated_release_date);

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
      className="relative"
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
        {/* Thumbnail Section */}
        <div className="relative">
          {course.thumbnail_url ? (
            // Course thumbnail
            <div className="aspect-[4/3] w-full overflow-hidden">
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            // Placeholder with gradient
            <div className="aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900">
              <div className="flex h-full w-full items-center justify-center">
                <Clock className="h-16 w-16 text-brand_accent/30" />
              </div>
            </div>
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-brand_primary via-brand_primary/60 to-transparent" />

          {/* "Próximamente" badge - top left */}
          <div className="absolute left-2 top-2 z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand_accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-brand_primary shadow-lg">
              <Clock className="h-3.5 w-3.5" />
              Próximamente
            </span>
          </div>

          {/* Title and instructor overlay on thumbnail (when collapsed) */}
          {!isExpanded && (
            <div className="absolute inset-x-0 bottom-0 p-3">
              <h3 className="line-clamp-2 text-sm font-bold text-white md:text-base">
                {course.title}
              </h3>
              {course.instructor && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand_accent/20">
                    <User className="h-3 w-3 text-brand_accent" />
                  </div>
                  <span className="text-xs font-medium text-brand_accent">
                    {course.instructor.full_name}
                  </span>
                </div>
              )}
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
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand_accent/20">
                      <User className="h-3 w-3 text-brand_accent" />
                    </div>
                    <span className="text-sm font-medium text-brand_accent">
                      {course.instructor.full_name}
                    </span>
                  </div>
                )}

                {/* Description - full text */}
                {course.description && (
                  <p className="text-sm leading-relaxed text-gray-400">
                    {course.description}
                  </p>
                )}

                {/* Release date badge */}
                {formattedDate ? (
                  <div className="flex items-center gap-2 rounded-lg bg-brand_accent/10 px-3 py-2">
                    <Calendar className="h-4 w-4 text-brand_accent" />
                    <span className="text-sm font-medium text-brand_accent">
                      Disponible en {formattedDate}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-gray-800/50 px-3 py-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-400">
                      Fecha por confirmar
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed: Show release date as small indicator */}
        {!isExpanded && (
          <div className="bg-brand_primary/95 px-3 py-2">
            {formattedDate ? (
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-brand_accent" />
                <span className="text-xs font-medium text-brand_accent">
                  {formattedDate}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs text-gray-500">
                  Fecha por confirmar
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default UpcomingCourseCard;
