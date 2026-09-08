// @vitest-environment jsdom
/**
 * pages/docente/assessments/index.tsx — list cards (PR 3 item 3)
 *
 * Each card names the grade and course it evaluates (from the list API's
 * gradeLevel / courseName), with the es-CL grade label, plus the generation
 * type. Renders the real page with its data sources mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { supabaseHolder, routerMock } = vi.hoisted(() => ({
  supabaseHolder: { current: null as any },
  routerMock: { push: vi.fn(), replace: vi.fn(), pathname: '/docente/assessments', query: {}, isReady: true },
}));

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('../../../components/tutorials/HelpButton', () => ({ default: () => null }));

import DocenteAssessmentsPage from '../../../pages/docente/assessments/index';

const base = {
  assigneeId: 'asg', templateId: 'tpl-1', templateName: 'Plantilla Sintética', templateArea: 'evaluacion',
  templateVersion: '1.1.0', transformationYear: 2, status: 'in_progress', canEdit: true, canSubmit: true,
  hasStarted: true, hasSubmitted: false, assignedAt: '2026-03-01T00:00:00Z',
};

function installFetch(assessments: unknown[]) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ success: true, assessments, total: assessments.length }),
  })) as unknown as typeof fetch;
}

function installSupabase() {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'docente-1' } } } }),
      signOut: vi.fn(),
    },
    from: vi.fn(() => buildChainableQuery({ avatar_url: null })),
  };
}

describe('docente assessments list — course/grade on cards', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    installSupabase();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the es-CL grade label and the course name, and the generation type', async () => {
    installFetch([
      { ...base, id: 'i-1', generationType: 'GI', gradeLevel: '3_basico', courseName: '3° Básico A' },
    ]);
    render(<DocenteAssessmentsPage />);

    const course = await screen.findByTestId('assessment-card-course-i-1');
    expect(course).toHaveTextContent('3° Básico · 3° Básico A');
    expect(screen.getByText('Año 2')).toBeInTheDocument();
    expect(screen.getByTitle('Generación Innova')).toHaveTextContent('GI');
  });

  it('does not repeat the grade when the course name equals the grade label, and copes with a missing course', async () => {
    installFetch([
      { ...base, id: 'i-2', generationType: 'GT', gradeLevel: 'kinder', courseName: 'Kinder' },
      { ...base, id: 'i-3', generationType: 'GT', gradeLevel: undefined, courseName: undefined },
    ]);
    render(<DocenteAssessmentsPage />);

    expect(await screen.findByTestId('assessment-card-course-i-2')).toHaveTextContent(/^Kinder$/);
    expect(screen.queryByTestId('assessment-card-course-i-3')).toBeNull();
    expect(screen.getAllByTitle('Generación Tractor')).toHaveLength(2);
  });
});
