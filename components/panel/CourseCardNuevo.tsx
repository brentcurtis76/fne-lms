import React, { useState } from 'react';
import Link from 'next/link';
import { BarChart2, BookOpen, CheckCircle2, ChevronDown, ClipboardCheck, Clock, Award, Play, Target } from 'lucide-react';
import { Badge, Button, Card } from '../ui/kit';
import { CourseThumbnail } from '../courses/CourseThumbnail';
import {
  getCTAText,
  getDifficultyLabel,
  formatDuration,
  getCoursePicture,
  showsProgress,
  showsLessons,
  showsAssignments,
  objectivesPreview,
} from '../courses/courseCardText';
import type { CourseWithEnrollment } from '../../types/courses';

/**
 * The new look's course card (redesign 6B), for «Continuar Aprendiendo» and «Mis Cursos Abiertos».
 * Every word and rule is today's card's, through `components/courses/courseCardText`: the picture,
 * the action's word, the difficulty, the duration, when the progress and the lessons show. Approved
 * changes: progress and the action are always visible; the rest opens with «Detalles»; the picture
 * is a link to the course. The stray «0» today's card prints for a course with zero lessons is not
 * drawn here (`Boolean(showsLessons(...))`).
 */
export function CourseCardNuevo({
  course,
  href,
  onOpen,
  primary = false,
  testId,
}: {
  course: CourseWithEnrollment;
  /** The course's address, for the picture's link (the action calls `onOpen`, as today's). */
  href: string;
  onOpen: (courseId: string) => void;
  /** The one yellow action of the panel. */
  primary?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const enrollment = course.enrollment ?? null;
  const picture = getCoursePicture(course);
  const difficulty = course.difficulty_level ? getDifficultyLabel(course.difficulty_level) : '';
  const lessons = Boolean(showsLessons(enrollment));
  const progress = Boolean(showsProgress(enrollment));
  const percent = enrollment?.progress_percentage ?? 0;
  const objectives = course.learning_objectives && course.learning_objectives.length > 0
    ? objectivesPreview(course.learning_objectives)
    : null;
  const detailsId = `${testId}-details`;

  return (
    <Card className="flex h-full flex-col overflow-hidden" data-testid={testId}>
      <Link
        href={href}
        tabIndex={-1}
        aria-label={course.title}
        className="relative block aspect-video overflow-hidden bg-brand_gray_dark"
        data-testid={`${testId}-picture`}
      >
        {picture.kind === 'generated' ? (
          <CourseThumbnail
            title={course.title}
            instructorName={course.instructor?.full_name}
            instructorPhotoUrl={course.instructor?.photo_url}
            difficultyLevel={course.difficulty_level}
            className="h-full"
          />
        ) : (
          <img
            src={picture.src}
            alt={picture.alt}
            className={`h-full w-full object-cover ${picture.kind === 'instructor' ? 'object-top' : ''}`}
          />
        )}
        {difficulty && (
          <Badge tone="neutral" plain className="absolute left-2.5 top-2.5" data-testid={`${testId}-difficulty`}>
            {difficulty}
          </Badge>
        )}
        {enrollment?.completion_status === 'aprobado' && (
          <Badge tone="success" plain className="absolute right-2.5 top-2.5">
            <Award aria-hidden="true" className="h-3 w-3" />
            Aprobado
          </Badge>
        )}
        {enrollment?.completion_status === 'completado' && (
          <Badge tone="success" plain className="absolute right-2.5 top-2.5">
            <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
            Completado
          </Badge>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <h3 className="line-clamp-2 min-h-[2.6em] font-mont text-[0.8125rem] font-bold uppercase leading-[1.5] tracking-[0.1em] text-brand_primary">
          {course.title}
        </h3>
        {course.instructor && (
          <p className="text-[0.8125rem] font-semibold text-brand_accent_text">{course.instructor.full_name}</p>
        )}

        {progress && (
          <div className="grid gap-1">
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Avance: ${percent}%`}
              className="block h-1.5 overflow-hidden rounded-full bg-brand_primary/[0.14]"
            >
              <span
                className="block h-full rounded-full bg-[linear-gradient(100deg,#fbbf24_30%,#f59e0b)]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="flex justify-between text-[0.8125rem] text-gray-600">
              {/* The lesson line on the card's face, beside the bar, when today's card shows it */}
              <span>{lessons && `${enrollment?.lessons_completed || 0} de ${enrollment?.total_lessons} lecciones`}</span>
              <span>{percent}%</span>
            </p>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Button
            variant="quiet"
            size="sm"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((now) => !now)}
            data-testid={`${testId}-details-toggle`}
          >
            Detalles
            <ChevronDown aria-hidden="true" className={open ? 'rotate-180' : undefined} />
          </Button>
          <Button
            variant={primary ? 'primary' : 'default'}
            size="sm"
            onClick={() => onOpen(course.id)}
            data-testid={`${testId}-action`}
          >
            <Play aria-hidden="true" />
            {getCTAText(enrollment)}
          </Button>
        </div>

        {open && (
          <div id={detailsId} className="grid gap-2.5 border-t border-brand_primary/[0.12] pt-2" data-testid={detailsId}>
            {(Boolean(course.estimated_duration_hours) || Boolean(difficulty) || lessons) && (
              <div className="flex flex-wrap gap-1.5">
                {Boolean(course.estimated_duration_hours) && (
                  <span className={PILL}>
                    <Clock aria-hidden="true" />
                    {formatDuration(course.estimated_duration_hours ?? null)}
                  </span>
                )}
                {difficulty && (
                  <span className={PILL}>
                    <BarChart2 aria-hidden="true" />
                    {difficulty}
                  </span>
                )}
                {lessons && (
                  <span className={PILL}>
                    <BookOpen aria-hidden="true" />
                    {enrollment?.total_lessons} lecciones
                  </span>
                )}
              </div>
            )}
            {/* Today's card shows the lesson line and its percentage under `showsLessons` alone; with no
                bar on the face (no progress), they are here, once the card is opened. */}
            {lessons && !progress && (
              <p className="flex justify-between text-[0.8125rem] text-gray-600" data-testid={`${testId}-lessons`}>
                <span>{`${enrollment?.lessons_completed || 0} de ${enrollment?.total_lessons} lecciones`}</span>
                <span>{percent}%</span>
              </p>
            )}
            {Boolean(showsAssignments(enrollment)) && (
              <p className="flex items-center gap-1 text-xs text-gray-600">
                <ClipboardCheck aria-hidden="true" className="h-3 w-3" />
                <span>Tareas: {enrollment?.assignments_submitted ?? 0}/{enrollment?.assignments_total}</span>
              </p>
            )}
            {enrollment?.completion_status === 'aprobado' && (
              <div className="grid gap-0.5 rounded border border-green-600/25 bg-green-100 px-3 py-2 text-xs text-green-600">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Award aria-hidden="true" className="h-3.5 w-3.5" />
                  Curso Aprobado
                </span>
                <span>Has completado todas las lecciones y tareas.</span>
              </div>
            )}
            {enrollment?.completion_status === 'completado' && (
              <p className="text-xs text-gray-600">Completa tus tareas pendientes para obtener la insignia.</p>
            )}
            {course.description && <p className="text-[0.8125rem] leading-relaxed text-gray-600">{course.description}</p>}
            {objectives && (
              <div>
                <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-brand_primary">
                  <Target aria-hidden="true" className="h-3.5 w-3.5 text-brand_accent_text" />
                  <span>Objetivos de aprendizaje</span>
                </p>
                <ul className="mt-1 grid list-disc gap-1 pl-4 text-[0.8125rem] text-gray-600">
                  {objectives.shown.map((objective, index) => (
                    <li key={index}>{objective}</li>
                  ))}
                  {objectives.more > 0 && <li className="list-none">+{objectives.more} más...</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

const PILL =
  'inline-flex items-center gap-[0.4em] whitespace-nowrap rounded-full border border-brand_primary/[0.24] px-[0.7em] py-[0.15em] text-xs text-gray-600 [&>svg]:h-3 [&>svg]:w-3';

export default CourseCardNuevo;
