'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NetflixCourseRowProps } from '@/types/courses';
import { NetflixCourseCard } from './NetflixCourseCard';

/**
 * Netflix-style horizontal scrolling course row
 * Clean design with hover expansion
 */
export function NetflixCourseRow({
  title,
  courses,
  emptyMessage = 'No hay cursos disponibles',
  onCourseSelect,
}: NetflixCourseRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Check scroll position and update arrow visibility
  const updateArrowVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  // Update arrow visibility on mount and scroll
  useEffect(() => {
    updateArrowVisibility();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', updateArrowVisibility);
      window.addEventListener('resize', updateArrowVisibility);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', updateArrowVisibility);
      }
      window.removeEventListener('resize', updateArrowVisibility);
    };
  }, [updateArrowVisibility, courses]);

  // Scroll handler
  const handleScroll = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8; // Scroll 80% of container width
    const targetScroll = direction === 'left'
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: targetScroll,
      behavior: 'smooth',
    });
  }, []);

  // If no courses, show empty message
  if (!courses || courses.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="mb-4 px-4 text-xl font-bold text-brand_primary md:px-8 lg:px-12">
          {title}
        </h2>
        <div className="px-4 md:px-8 lg:px-12">
          <div className="flex h-40 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
            <p className="text-gray-500">{emptyMessage}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="group/row relative mb-8"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Row title */}
      <h2 className="mb-4 px-4 text-xl font-bold text-brand_primary md:px-6">
        {title}
      </h2>

      {/* Scroll container wrapper */}
      <div className="relative">
        {/* Left scroll button */}
        <button
          onClick={() => handleScroll('left')}
          className={`absolute left-0 top-0 z-30 flex h-full w-10 items-center justify-center bg-gradient-to-r from-brand_light via-brand_light/90 to-transparent transition-opacity duration-200 md:w-12 ${
            showLeftArrow && isHovering ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label="Desplazar izquierda"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand_primary/90 text-white shadow-md transition-colors hover:bg-brand_accent hover:text-brand_primary">
            <ChevronLeft className="h-5 w-5" />
          </div>
        </button>

        {/* Scrollable container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scroll-smooth px-4 pb-8 pt-2 scrollbar-hide md:gap-5 md:px-6"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {courses.map((course) => (
            <div
              key={course.id}
              className="flex-shrink-0 snap-start"
              style={{ width: '260px' }}
            >
              <NetflixCourseCard
                course={{
                  id: course.id,
                  title: course.title,
                  description: course.description,
                  thumbnail_url: course.thumbnail_url || null,
                  estimated_duration_hours: course.estimated_duration_hours || null,
                  difficulty_level: course.difficulty_level || null,
                  learning_objectives: course.learning_objectives || null,
                  instructor: course.instructor ? {
                    full_name: course.instructor.full_name,
                    photo_url: course.instructor.photo_url,
                  } : undefined,
                }}
                enrollment={course.enrollment ? {
                  progress_percentage: course.enrollment.progress_percentage,
                  is_completed: course.enrollment.is_completed,
                  lessons_completed: course.enrollment.lessons_completed,
                  total_lessons: course.enrollment.total_lessons,
                } : null}
                onSelect={onCourseSelect}
              />
            </div>
          ))}
        </div>

        {/* Right scroll button */}
        <button
          onClick={() => handleScroll('right')}
          className={`absolute right-0 top-0 z-30 flex h-full w-10 items-center justify-center bg-gradient-to-l from-brand_light via-brand_light/90 to-transparent transition-opacity duration-200 md:w-12 ${
            showRightArrow && isHovering ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label="Desplazar derecha"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand_primary/90 text-white shadow-md transition-colors hover:bg-brand_accent hover:text-brand_primary">
            <ChevronRight className="h-5 w-5" />
          </div>
        </button>
      </div>
    </section>
  );
}

export default NetflixCourseRow;
