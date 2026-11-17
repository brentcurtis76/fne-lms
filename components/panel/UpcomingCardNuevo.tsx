import React, { useState } from 'react';
import { Calendar, ChevronDown, Clock, User } from 'lucide-react';
import { Badge, Button, Card } from '../ui/kit';
import { formatReleaseDate } from '../courses/upcomingCardText';
import type { UpcomingCourse } from '../courses/UpcomingCourseCard';

/**
 * The new look's upcoming course card (redesign 6B). No link, as today. The month and year come
 * from `components/courses/upcomingCardText`, as today's card's do; the description and «Disponible
 * en {fecha}» open with «Detalles» (approved change: today they open under the pointer).
 */
export function UpcomingCardNuevo({ course, testId }: { course: UpcomingCourse; testId: string }) {
  const [open, setOpen] = useState(false);
  const formattedDate = formatReleaseDate(course.estimated_release_date);
  const detailsId = `${testId}-details`;

  return (
    <Card className="flex h-full flex-col overflow-hidden" data-testid={testId}>
      <div className="relative aspect-video overflow-hidden bg-brand_primary">
        {course.thumbnail_url ? (
          <img src={course.thumbnail_url} alt={course.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand_gray_dark">
            <Clock aria-hidden="true" className="h-12 w-12 text-white/30" />
          </div>
        )}
        <Badge tone="accent" plain className="absolute left-2.5 top-2.5">
          <Clock aria-hidden="true" className="h-[11px] w-[11px]" />
          Próximamente
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <h3 className="line-clamp-2 font-mont text-[0.8125rem] font-bold uppercase leading-[1.5] tracking-[0.1em] text-brand_primary">
          {course.title}
        </h3>
        {course.instructor && (
          <p className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-brand_accent_text">
            <User aria-hidden="true" className="h-[13px] w-[13px]" />
            {course.instructor.full_name}
          </p>
        )}
        <p className="inline-flex items-center gap-1.5 text-[0.8125rem] text-gray-600" data-testid={`${testId}-date`}>
          {formattedDate ? (
            <>
              <Calendar aria-hidden="true" className="h-[13px] w-[13px]" />
              {formattedDate}
            </>
          ) : (
            <>
              <Clock aria-hidden="true" className="h-[13px] w-[13px]" />
              Fecha por confirmar
            </>
          )}
        </p>
        <Button
          variant="quiet"
          size="sm"
          className="mt-auto self-start"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((now) => !now)}
          data-testid={`${testId}-details-toggle`}
        >
          Detalles
          <ChevronDown aria-hidden="true" className={open ? 'rotate-180' : undefined} />
        </Button>
        {open && (
          <div id={detailsId} className="grid gap-2 border-t border-brand_primary/[0.12] pt-2" data-testid={detailsId}>
            {course.description && <p className="text-[0.8125rem] text-gray-600">{course.description}</p>}
            {formattedDate ? (
              <Badge tone="warning" plain className="justify-self-start">
                Disponible en {formattedDate}
              </Badge>
            ) : (
              <Badge tone="neutral" plain className="justify-self-start">
                Fecha por confirmar
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default UpcomingCardNuevo;
