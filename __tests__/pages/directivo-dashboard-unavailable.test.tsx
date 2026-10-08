// @vitest-environment jsdom
/**
 * pages/directivo/assessments/dashboard.tsx — unavailable results
 * (20261008120000, Codex B4 r1): a completed registro without a stored result
 * is never shown as a zero score or as "no completed registros".
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../api/assessment-builder/_helpers';

const { supabaseHolder, routerMock } = vi.hoisted(() => ({
  supabaseHolder: { current: null as any },
  routerMock: { push: vi.fn(), replace: vi.fn(), pathname: '/directivo/assessments/dashboard', query: {}, isReady: true },
}));

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../components/layout/MainLayout', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('recharts', () => {
  const Stub = ({ children }: any) => <div>{children}</div>;
  const names = ['BarChart', 'Bar', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'ResponsiveContainer', 'RadarChart',
    'PolarGrid', 'PolarAngleAxis', 'PolarRadiusAxis', 'Radar', 'Legend', 'PieChart', 'Pie', 'Cell'];
  return Object.fromEntries(names.map((n) => [n, Stub]));
});

import Dashboard from '../../pages/directivo/assessments/dashboard';

const course = (id: string, summary: Record<string, unknown>, byArea: Record<string, unknown> = {}) => ({
  courseId: id, gradeLevel: '1_basico', gradeLevelLabel: '1° Básico', courseName: `Curso ${id}`, generationType: 'GT',
  summary: { completedAssessments: 0, avgScore: 0, avgLevel: 0, avgLevelLabel: 'Incipiente', meetsExpectations: false, ...summary },
  byArea,
});

function mount(school: unknown, courses: unknown[]) {
  supabaseHolder.current = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'dir-1' } } } }) },
    from: (table: string) =>
      table === 'user_roles' ? buildChainableQuery([{ role_type: 'equipo_directivo' }]) : buildChainableQuery(null),
  };
  global.fetch = vi.fn((url: any) => {
    const body = String(url).includes('school-results') ? school : { success: true, transformationYear: 1, expectedLevel: { level: 1, label: 'x' }, courses };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  }) as any;
  render(<Dashboard />);
}

const baseSchool = {
  success: true, school: { id: 5, name: 'Escuela' }, transformationYear: 1, expectedLevel: { level: 1, label: 'Incipiente' },
};

beforeEach(() => vi.clearAllMocks());

describe('directivo dashboard — unavailable results', () => {
  it('when every completed registro lacks a result it says so, not "no completed registros"', async () => {
    mount({ ...baseSchool, unavailableResults: 2, results: { byArea: {}, overall: { avgScore: 0, avgLevel: 0, totalInstances: 0 } } }, []);
    expect(await screen.findByTestId('results-all-unavailable')).toHaveTextContent('Resultados aún no disponibles');
    expect(screen.getByTestId('results-unavailable-note')).toHaveTextContent('2 registros completados');
    expect(screen.queryByText('No hay registros completados')).not.toBeInTheDocument();
  });

  it('an unavailable-only course shows no score and stays out of the scored summary', async () => {
    mount(
      { ...baseSchool, unavailableResults: 1, results: { byArea: {}, overall: { avgScore: 70, avgLevel: 2, levelLabel: 'x', totalInstances: 1, meetsExpectations: true } } },
      [
        course('A', { completedAssessments: 1, avgScore: 70, avgLevel: 2, meetsExpectations: true }, { personalizacion: { area: 'personalizacion', label: 'Crecimiento', totalScore: 70, level: 2, levelLabel: 'x', completedAt: null } }),
        course('B', { unavailableResults: 1 }),
      ]
    );
    fireEvent.click(await screen.findByText('Por Curso'));
    expect(await screen.findByTestId('course-unavailable-B')).toHaveTextContent('Resultado no disponible');
    expect(screen.getByText('1 registro completado sin resultado disponible')).toBeInTheDocument();
    // B is listed once (detail card), not in the scored summary list
    expect(screen.getAllByText('Curso B')).toHaveLength(1);
    expect(screen.getAllByText('Curso A')).toHaveLength(2);
  });
});
