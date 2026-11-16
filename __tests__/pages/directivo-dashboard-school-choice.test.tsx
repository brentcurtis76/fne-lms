// @vitest-environment jsdom
/**
 * GC-7: «Panel de Resultados» for admins and consultores. They choose a
 * school (same list as the Plan de Migración picker) and the page sends it to
 * both results APIs; with no school chosen it asks for one instead of saying
 * «No hay registros completados». Directivos are unchanged (no school sent).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../api/assessment-builder/_helpers';

const { supabaseHolder, routerMock } = vi.hoisted(() => ({
  supabaseHolder: { current: null as any },
  routerMock: { push: vi.fn(), replace: vi.fn(), pathname: '/directivo/assessments/dashboard', query: {} as Record<string, string>, isReady: true },
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
  ResponsiveFunctionalPageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
  ),
}));
vi.mock('recharts', () => {
  const Stub = ({ children }: any) => <div>{children}</div>;
  const names = ['BarChart', 'Bar', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'ResponsiveContainer', 'RadarChart',
    'PolarGrid', 'PolarAngleAxis', 'PolarRadiusAxis', 'Radar', 'Legend', 'PieChart', 'Pie', 'Cell'];
  return Object.fromEntries(names.map((n) => [n, Stub]));
});

import Dashboard from '../../pages/directivo/assessments/dashboard';

const SCHOOLS = [{ id: 701, name: 'Colegio Sintético Uno' }, { id: 702, name: 'Colegio Sintético Dos' }];
const school = (id: number) => ({
  success: true, school: { id, name: `Colegio ${id}` }, transformationYear: 1, expectedLevel: { level: 1, label: 'Incipiente' },
  results: { byArea: {}, overall: { avgScore: 0, avgLevel: 0, totalInstances: 0 } },
});

let urls: string[] = [];

function mount(role: string) {
  supabaseHolder.current = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u-1' } } } }) },
    from: (table: string) => (table === 'user_roles' ? buildChainableQuery([{ role_type: role }]) : buildChainableQuery(null)),
  };
  global.fetch = vi.fn((url: any) => {
    const u = String(url);
    urls.push(u);
    const m = u.match(/school_id=(\d+)/);
    const body = u.includes('/transversal-context/schools')
      ? { schools: SCHOOLS }
      : u.includes('school-results')
        ? school(m ? Number(m[1]) : 5)
        : { success: true, courses: [] };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  }) as any;
  render(<Dashboard />);
}

const resultCalls = () => urls.filter((u) => u.includes('/api/directivo/assessments/'));

beforeEach(() => {
  vi.clearAllMocks();
  urls = [];
  routerMock.query = {};
});

describe('GC-7 results panel school choice', () => {
  it.each(['admin', 'consultor'])('%s without a school sees the picker and the request to choose, not the empty-results message', async (role) => {
    mount(role);
    expect(await screen.findByTestId('results-choose-school')).toHaveTextContent('Elige un colegio para ver sus resultados');
    expect(await screen.findByText('Colegio Sintético Uno')).toBeInTheDocument();
    expect(screen.queryByText('No hay registros completados')).not.toBeInTheDocument();
    expect(resultCalls()).toEqual([]);
  });

  it('choosing a school sends it to both results APIs', async () => {
    mount('admin');
    fireEvent.click(await screen.findByText('Colegio Sintético Dos'));
    await waitFor(() => expect(resultCalls()).toHaveLength(2));
    expect(resultCalls()).toEqual(
      expect.arrayContaining([
        '/api/directivo/assessments/school-results?school_id=702',
        '/api/directivo/assessments/course-results?school_id=702',
      ])
    );
    expect(routerMock.push).toHaveBeenCalledWith('/directivo/assessments/dashboard?school_id=702', undefined, { shallow: true });
    expect(await screen.findByText('Colegio 702')).toBeInTheDocument();
  });

  it('a school already in the address is used directly', async () => {
    routerMock.query = { school_id: '701' };
    mount('consultor');
    await waitFor(() => expect(resultCalls()).toContain('/api/directivo/assessments/school-results?school_id=701'));
  });

  it('a directivo is unchanged: no picker, no school sent', async () => {
    mount('equipo_directivo');
    await waitFor(() => expect(resultCalls()).toHaveLength(2));
    expect(resultCalls()).toEqual(
      expect.arrayContaining(['/api/directivo/assessments/school-results', '/api/directivo/assessments/course-results'])
    );
    expect(screen.queryByTestId('results-choose-school')).not.toBeInTheDocument();
    expect(urls.some((u) => u.includes('/transversal-context/schools'))).toBe(false);
  });
});
