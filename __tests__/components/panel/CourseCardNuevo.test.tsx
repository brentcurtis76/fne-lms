// @vitest-environment jsdom
/**
 * Redesign 6B, send-back 2, point 2: the new look's course card shows the lesson line «{x} de {n}
 * lecciones» and its percentage under today's condition (`showsLessons`), and the bar with its
 * percentage under `showsProgress`, as today's card (`NetflixCourseCard.tsx`) does: the lesson line
 * on the face beside the bar when there is one, inside «Detalles» otherwise. Invented courses only.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { CourseCardNuevo } from '@/components/panel/CourseCardNuevo';
import type { CourseWithEnrollment } from '@/types/courses';

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

afterEach(() => cleanup());

const course = (enrollment: Record<string, unknown>): CourseWithEnrollment =>
  ({
    id: 'course-x',
    title: 'Curso Inventado de Prueba',
    description: 'Una descripción inventada',
    thumbnail_url: null,
    estimated_duration_hours: 2,
    difficulty_level: 'beginner',
    learning_objectives: null,
    instructor: { id: 'i-1', full_name: 'Relatora Ficticia', photo_url: null },
    enrollment: { progress_percentage: 0, is_completed: false, lessons_completed: 0, total_lessons: 0, last_activity: null, ...enrollment },
  }) as unknown as CourseWithEnrollment;

function draw(enrollment: Record<string, unknown>) {
  render(<CourseCardNuevo course={course(enrollment)} href="/student/course/course-x" onOpen={() => {}} testId="card" />);
  const card = screen.getByTestId('card');
  const open = () => fireEvent.click(screen.getByTestId('card-details-toggle'));
  return { card, open };
}

describe('the new course card: the lesson line and the percentage under today\'s conditions', () => {
  it('lessons and no progress: no bar; «0 de 10 lecciones» and «0%» once «Detalles» is open', () => {
    const { card, open } = draw({ total_lessons: 10, lessons_completed: 0, progress_percentage: 0 });
    expect(within(card).queryByRole('progressbar')).toBeNull();
    expect(card.textContent).not.toContain('de 10 lecciones');
    open();
    const details = screen.getByTestId('card-details');
    expect(within(details).getByText('0 de 10 lecciones')).toBeTruthy();
    expect(within(details).getByText('0%')).toBeTruthy();
    // The lessons pill too, as today's opened card has it.
    expect(within(details).getByText('10 lecciones')).toBeTruthy();
    expect(card.textContent!.match(/de 10 lecciones/g)).toHaveLength(1);
  });

  it('no lessons and 70% progress: the bar with its percentage, and no lesson line, opened or not', () => {
    const { card, open } = draw({ total_lessons: 0, lessons_completed: 0, progress_percentage: 70 });
    const bar = within(card).getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('70');
    expect(bar.getAttribute('aria-label')).toBe('Avance: 70%');
    expect(card.textContent).toContain('70%');
    open();
    expect(card.textContent).not.toContain('lecciones');
    // The stray «0» of today's card (a number used as a condition) is not drawn.
    expect([...card.querySelectorAll('*')].some((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent === '0'))).toBe(false);
  });

  it('lessons and progress: the lesson line on the face beside the bar, not repeated inside «Detalles»', () => {
    const { card, open } = draw({ total_lessons: 10, lessons_completed: 7, progress_percentage: 70 });
    expect(within(card).getByRole('progressbar')).toBeTruthy();
    expect(within(card).getByText('7 de 10 lecciones')).toBeTruthy();
    open();
    expect(card.textContent!.match(/7 de 10 lecciones/g)).toHaveLength(1);
    expect(card.textContent!.match(/70%/g)).toHaveLength(1);
  });

  it('no lessons and no progress: neither the bar nor the line', () => {
    const { card, open } = draw({ total_lessons: 0, lessons_completed: 0, progress_percentage: 0 });
    open();
    expect(within(card).queryByRole('progressbar')).toBeNull();
    expect(card.textContent).not.toContain('lecciones');
    expect(card.textContent).not.toContain('%');
  });
});
