'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Eye, Users, Trash2, User } from 'lucide-react';
import { CourseThumbnail } from './CourseThumbnail';

interface AdminCourseCardProps {
  course: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    instructor_name?: string;
    structure_type?: 'simple' | 'modular';
    instructor?: {
      full_name: string;
      photo_url?: string | null;
    } | null;
  };
  onEdit?: (courseId: string) => void;
  onView?: (courseId: string) => void;
  onAssign?: (courseId: string) => void;
  onDelete?: (courseId: string) => void;
}

/**
 * Admin course card with Netflix-style design and action buttons
 * Includes hover expansion with edit/view/assign/delete actions
 */
export function AdminCourseCard({
  course,
  onEdit,
  onView,
  onAssign,
  onDelete,
}: AdminCourseCardProps) {
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
    }, 300);
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

  // Get instructor info
  const instructorName = course.instructor?.full_name || course.instructor_name || 'Sin instructor';
  const instructorPhoto = course.instructor?.photo_url || null;

  // Check if user prefers reduced motion
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

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
        {/* Thumbnail Section */}
        <div className="relative">
          {instructorPhoto ? (
            <div className="aspect-[4/3] w-full overflow-hidden">
              <img
                src={instructorPhoto}
                alt={instructorName}
                className="h-full w-full object-cover object-top"
              />
            </div>
          ) : course.thumbnail_url ? (
            <div className="aspect-[4/3] w-full overflow-hidden">
              <img
                src={course.thumbnail_url}
                alt={course.title}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <CourseThumbnail
              title={course.title}
              instructorName={instructorName}
              difficultyLevel={null}
            />
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-brand_primary via-brand_primary/40 to-transparent" />

          {/* Structure type badge */}
          <div className="absolute right-2 top-2">
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${
              course.structure_type === 'simple'
                ? 'bg-brand_beige text-brand_primary'
                : 'bg-brand_accent text-brand_primary'
            }`}>
              {course.structure_type === 'simple' ? 'Simple' : 'Modular'}
            </span>
          </div>

          {/* Title and instructor overlay on thumbnail (when collapsed) */}
          {!isExpanded && (
            <div className="absolute inset-x-0 bottom-0 p-3">
              <h3 className="line-clamp-2 text-sm font-bold text-white md:text-base">
                {course.title}
              </h3>
              <p className="mt-1 text-xs font-medium text-brand_accent">
                {instructorName}
              </p>
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
                {/* Title */}
                <h3 className="text-base font-bold leading-tight text-white">
                  {course.title}
                </h3>

                {/* Instructor */}
                <div className="flex items-center gap-2">
                  {instructorPhoto ? (
                    <img
                      src={instructorPhoto}
                      alt={instructorName}
                      className="h-6 w-6 rounded-full object-cover ring-1 ring-brand_accent"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand_accent">
                      <User className="h-3 w-3 text-brand_primary" />
                    </div>
                  )}
                  <span className="text-sm font-medium text-brand_accent">
                    {instructorName}
                  </span>
                </div>

                {/* Description */}
                {course.description && (
                  <p className="line-clamp-3 text-sm leading-relaxed text-gray-400">
                    {course.description}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(course.id);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-brand_accent py-2 text-xs font-semibold text-brand_primary transition-colors hover:bg-amber-400"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onView?.(course.id);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-white/10 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssign?.(course.id);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-brand_beige py-2 text-xs font-semibold text-brand_primary transition-colors hover:bg-amber-200"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Asignar
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete?.(course.id);
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-red-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default AdminCourseCard;
