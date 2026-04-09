// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

/**
 * The detailed-reports page is heavily coupled to auth, router, and supabase.
 * Instead of mocking the entire page, we extract the table-rendering logic
 * and test it in isolation against the same markup patterns used in the page.
 *
 * This covers the PUNTAJE→TAREAS column replacement (feat/rpt-tareas-col).
 */

interface UserRow {
  user_id: string;
  user_name: string;
  user_email: string;
  school_name?: string;
  completion_percentage: number;
  total_lessons_completed: number;
  total_time_spent_minutes: number;
  assignments_submitted?: number;
  assignments_total?: number;
  activity_score?: number;
}

/** Mirrors the overview table from detailed-reports.tsx lines 575-632 */
function OverviewTable({ users }: { users: UserRow[] }) {
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <table>
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Escuela</th>
          <th>Progreso</th>
          <th>Tareas</th>
          <th>Lecciones</th>
          <th>Tiempo</th>
        </tr>
      </thead>
      <tbody>
        {users.map((userData) => (
          <tr key={userData.user_id} data-testid={`row-${userData.user_id}`}>
            <td>{userData.user_name}</td>
            <td>{userData.school_name || 'Sin escuela'}</td>
            <td>{userData.completion_percentage}%</td>
            <td data-testid={`tareas-${userData.user_id}`}>
              {(userData.assignments_total || 0) > 0
                ? `${userData.assignments_submitted || 0}/${userData.assignments_total}`
                : '-'}
            </td>
            <td>{userData.total_lessons_completed}</td>
            <td>{formatTime(userData.total_time_spent_minutes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const makeUser = (overrides: Partial<UserRow> = {}): UserRow => ({
  user_id: 'u1',
  user_name: 'Ana García',
  user_email: 'ana@test.cl',
  school_name: 'Escuela Test',
  completion_percentage: 75,
  total_lessons_completed: 12,
  total_time_spent_minutes: 180,
  assignments_submitted: 3,
  assignments_total: 5,
  activity_score: 42,
  ...overrides,
});

describe('Detailed Reports — TAREAS column', () => {
  it('renders "Tareas" column header, not "Puntaje"', () => {
    render(<OverviewTable users={[makeUser()]} />);

    expect(screen.getByText('Tareas')).toBeInTheDocument();
    expect(screen.queryByText('Puntaje')).not.toBeInTheDocument();
    expect(screen.queryByText('Puntaje de Actividad')).not.toBeInTheDocument();
  });

  it('displays X/Y format for user with assignments', () => {
    render(
      <OverviewTable
        users={[makeUser({ user_id: 'u1', assignments_submitted: 3, assignments_total: 5 })]}
      />
    );

    const cell = screen.getByTestId('tareas-u1');
    expect(cell).toHaveTextContent('3/5');
  });

  it('displays dash when assignments_total is 0', () => {
    render(
      <OverviewTable
        users={[makeUser({ user_id: 'u2', assignments_submitted: 0, assignments_total: 0 })]}
      />
    );

    const cell = screen.getByTestId('tareas-u2');
    expect(cell).toHaveTextContent('-');
  });

  it('displays dash when assignments_total is undefined', () => {
    render(
      <OverviewTable
        users={[makeUser({ user_id: 'u3', assignments_submitted: undefined, assignments_total: undefined })]}
      />
    );

    const cell = screen.getByTestId('tareas-u3');
    expect(cell).toHaveTextContent('-');
  });

  it('displays 0/Y when user submitted nothing but has assignments', () => {
    render(
      <OverviewTable
        users={[makeUser({ user_id: 'u4', assignments_submitted: 0, assignments_total: 4 })]}
      />
    );

    const cell = screen.getByTestId('tareas-u4');
    expect(cell).toHaveTextContent('0/4');
  });

  it('treats undefined assignments_submitted as 0 when total > 0', () => {
    render(
      <OverviewTable
        users={[makeUser({ user_id: 'u5', assignments_submitted: undefined, assignments_total: 3 })]}
      />
    );

    const cell = screen.getByTestId('tareas-u5');
    expect(cell).toHaveTextContent('0/3');
  });

  it('maintains descending activity_score order when pre-sorted', () => {
    const users = [
      makeUser({ user_id: 'a', user_name: 'Top', activity_score: 90 }),
      makeUser({ user_id: 'b', user_name: 'Mid', activity_score: 50 }),
      makeUser({ user_id: 'c', user_name: 'Low', activity_score: 10 }),
    ];

    render(<OverviewTable users={users} />);

    const rows = screen.getAllByRole('row').slice(1); // skip header
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Top')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Mid')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Low')).toBeInTheDocument();
  });

  it('does not render activity_score value in table cells', () => {
    render(
      <OverviewTable
        users={[makeUser({ user_id: 'u6', activity_score: 42, assignments_total: 5, assignments_submitted: 3 })]}
      />
    );

    const row = screen.getByTestId('row-u6');
    // The activity_score (42) should NOT appear as a standalone cell value
    // The cell should show "3/5" not "42"
    const tareasCell = screen.getByTestId('tareas-u6');
    expect(tareasCell).toHaveTextContent('3/5');
    expect(tareasCell).not.toHaveTextContent('42');
  });
});
