// @vitest-environment jsdom
/**
 * Redesign 6B, step 0: today's course card, upcoming card and route card pinned BEFORE the words and
 * rules inside them move into a module both looks import. Each case renders today's piece with
 * invented props and keeps one digest of its markup (closed and, where it opens, opened) and of the
 * calls it makes, produced by the pieces as they were before 6B (`cards.pin.digests.json`; see
 * `__tests__/helpers/pin.ts` for how to see or accept a case's text).
 *
 * `framer-motion` is replaced by plain elements (`__tests__/helpers/motionFake.tsx`) and the
 * browser's media queries by a fake, so the pin holds the pieces' own logic, not an animation's
 * timing. The time zone is fixed to UTC and the clock to one instant.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { makePin, serialise } from '../../helpers/pin';
import { installMatchMedia } from '../../helpers/motionFake';

vi.hoisted(() => {
  process.env.TZ = 'UTC';
});
vi.mock('framer-motion', () => import('../../helpers/motionFake'));

import { NetflixCourseCard } from '@/components/courses/NetflixCourseCard';
import { UpcomingCourseCard, type UpcomingCourse } from '@/components/courses/UpcomingCourseCard';
import { LearningPathCard } from '@/components/learning-paths/LearningPathCard';

const { pinned, digestsFileHolds } = makePin(
  join(dirname(fileURLToPath(import.meta.url)), 'cards.pin.digests.json'),
  'PANEL_CARDS'
);

const NOW = new Date('2026-11-16T12:00:00Z');
const media = { mobile: false };
const calls: unknown[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(NOW);
  media.mobile = false;
  installMatchMedia(media);
  calls.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

let view: ReturnType<typeof render>;
const markup = () => serialise(view.asFragment());
const theLog = () => serialise(calls);
const onSelect = (id: string) => calls.push({ onSelect: id });

/** The card's outer element (the one with the pointer and tap handlers). */
const outer = () => view.container.firstElementChild as HTMLElement;

async function hoverOpen() {
  fireEvent.mouseEnter(outer());
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

// ── Course card ──

const course = (over: Record<string, unknown> = {}) => ({
  id: 'course-x',
  title: 'Curso Inventado de Prueba',
  description: 'Una descripción inventada del curso.',
  thumbnail_url: null as string | null,
  estimated_duration_hours: null as number | null,
  difficulty_level: null as string | null,
  learning_objectives: null as string[] | null,
  instructor: undefined as { full_name: string; photo_url?: string | null } | undefined,
  ...over,
});

async function courseCase(props: { course: any; enrollment: any }) {
  view = render(<NetflixCourseCard course={props.course} enrollment={props.enrollment} onSelect={onSelect} />);
  const closed = markup();
  await hoverOpen();
  return [closed, markup(), theLog()];
}

describe("today's course card (NetflixCourseCard)", () => {
  pinned('N1. no enrollment: «Ver Detalles», instructor photo, beginner, 30 min, five objectives', () =>
    courseCase({
      course: course({
        instructor: { full_name: 'Relatora Ficticia', photo_url: 'https://img.example.invalid/relatora.png' },
        thumbnail_url: 'https://img.example.invalid/curso.png',
        difficulty_level: 'Beginner',
        estimated_duration_hours: 0.5,
        learning_objectives: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'],
      }),
      enrollment: null,
    })
  );

  pinned('N2. approved: «Repasar», thumbnail only, intermediate, 6h, lessons and tasks', () =>
    courseCase({
      course: course({ thumbnail_url: 'https://img.example.invalid/curso.png', difficulty_level: 'intermediate', estimated_duration_hours: 6 }),
      enrollment: {
        progress_percentage: 100,
        is_completed: true,
        lessons_completed: 8,
        total_lessons: 8,
        completion_status: 'aprobado',
        assignments_submitted: 3,
        assignments_total: 3,
      },
    })
  );

  pinned('N3. completed: «Continuar», generated picture, advanced, 1.5h, zero lessons (the stray 0)', () =>
    courseCase({
      course: course({ instructor: { full_name: 'Relator Imaginario', photo_url: null }, difficulty_level: 'advanced', estimated_duration_hours: 1.5 }),
      enrollment: { progress_percentage: 90, is_completed: false, lessons_completed: 0, total_lessons: 0, completion_status: 'completado' },
    })
  );

  pinned('N4. in progress: «Continuar», an unknown difficulty (no label), no duration, lessons without a count done', () =>
    courseCase({
      course: course({ difficulty_level: 'intermedio', learning_objectives: ['Solo uno'] }),
      enrollment: { progress_percentage: 40, is_completed: false, total_lessons: 10 },
    })
  );

  pinned('N5. not started: «Comenzar», nothing optional', () =>
    courseCase({
      course: course({ description: null, learning_objectives: [] }),
      enrollment: { progress_percentage: 0, is_completed: false, lessons_completed: 0, total_lessons: 0 },
    })
  );

  pinned('N6. on a phone: the first tap opens, the second navigates; the action navigates once', async () => {
    media.mobile = true;
    view = render(<NetflixCourseCard course={course()} enrollment={{ progress_percentage: 10, is_completed: false }} onSelect={onSelect} />);
    const closed = markup();
    fireEvent.click(outer());
    const opened = markup();
    fireEvent.click(outer());
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    return [closed, opened, theLog()];
  });

  pinned('N7. on a desktop: closes when the pointer leaves; the action navigates; a tap does nothing', async () => {
    view = render(<NetflixCourseCard course={course()} enrollment={{ progress_percentage: 0, is_completed: false }} onSelect={onSelect} />);
    fireEvent.click(outer());
    const tapped = markup();
    await hoverOpen();
    fireEvent.click(screen.getByRole('button', { name: /Comenzar/ }));
    fireEvent.mouseLeave(outer());
    return [tapped, markup(), theLog()];
  });

  pinned('N8. a pointer that leaves before 300 ms: never opens', async () => {
    view = render(<NetflixCourseCard course={course()} enrollment={null} onSelect={onSelect} />);
    fireEvent.mouseEnter(outer());
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    fireEvent.mouseLeave(outer());
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.queryByRole('button')).toBeNull();
    return [markup(), theLog()];
  });
});

// ── Upcoming card ──

const upcoming = (over: Partial<UpcomingCourse> = {}): UpcomingCourse => ({
  id: 'up-x',
  title: 'Próximo Curso Inventado',
  description: 'Pronto estará disponible.',
  instructor_id: null,
  thumbnail_url: null,
  estimated_release_date: null,
  display_order: 1,
  is_active: true,
  instructor: null,
  ...over,
});

async function upcomingCase(course: UpcomingCourse) {
  view = render(<UpcomingCourseCard course={course} />);
  const closed = markup();
  await hoverOpen();
  return [closed, markup()];
}

describe("today's upcoming card (UpcomingCourseCard)", () => {
  pinned('U1. a release date, a thumbnail and an instructor', () =>
    upcomingCase(
      upcoming({
        estimated_release_date: '2027-03-15T12:00:00Z',
        thumbnail_url: 'https://img.example.invalid/proximo.png',
        instructor_id: 'instructor-1',
        instructor: { id: 'instructor-1', full_name: 'Relatora Ficticia' },
      })
    )
  );

  pinned('U2. no date, no thumbnail, no instructor, no description', () => upcomingCase(upcoming({ description: null })));

  pinned('U3. a date that is not a date', () => upcomingCase(upcoming({ estimated_release_date: 'no es una fecha' })));

  pinned('U4. on a phone: a tap opens, another closes', async () => {
    media.mobile = true;
    view = render(<UpcomingCourseCard course={upcoming({ estimated_release_date: '2027-12-01T12:00:00Z' })} />);
    fireEvent.click(outer());
    const opened = markup();
    fireEvent.click(outer());
    return [opened, markup()];
  });
});

// ── Route card ──

describe("today's route card (LearningPathCard)", () => {
  const route = (progress: any, assigned_at = '2026-08-16T12:00:00Z') => {
    view = render(
      <LearningPathCard
        id="path-x"
        name="Ruta Inventada"
        description="Una ruta inventada"
        assigned_at={assigned_at}
        progress={progress}
        onClick={() => calls.push('route onClick')}
      />
    );
    fireEvent.click(outer());
    return [markup(), theLog()];
  };

  pinned('R1. completed, three courses («Nivel 1», «Completado», no action)', () =>
    route({ path_id: 'path-x', total_courses: 3, completed_courses: 3, progress_percentage: 100, last_accessed: '2026-11-01T00:00:00Z' })
  );

  pinned('R2. started, four courses («Nivel 2», a rounded percentage, «Continuar aprendiendo»)', () =>
    route({ path_id: 'path-x', total_courses: 4, completed_courses: 1, progress_percentage: 33.4, last_accessed: '2026-11-01T00:00:00Z' }, '2026-11-10T12:00:00Z')
  );

  pinned('R3. no progress at all («0 de 0 cursos», «Comenzar ruta»), no description', () => {
    view = render(<LearningPathCard id="path-y" name="Ruta Sin Avance" assigned_at="2026-11-16T11:59:00Z" />);
    return [markup()];
  });

  pinned('R4. not started, five courses', () =>
    route({ path_id: 'path-x', total_courses: 5, completed_courses: 0, progress_percentage: 0, last_accessed: '2026-11-01T00:00:00Z' }, '2025-11-16T12:00:00Z')
  );
});

digestsFileHolds(16);
