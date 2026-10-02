// @vitest-environment jsdom
/**
 * pages/docente/assessments/index.tsx — list cards (PR 3 item 3)
 *
 * Each card names the grade and course it evaluates (from the list API's
 * gradeLevel / courseName), with the es-CL grade label, plus the generation
 * type. Archived instances get their own read-only group and status filter
 * option. Renders the real page with its data sources mocked.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { supabaseHolder, routerMock } = vi.hoisted(() => ({
  supabaseHolder: { current: null as any },
  routerMock: { push: vi.fn(), replace: vi.fn(), pathname: '/docente/assessments', query: {}, isReady: true },
}));

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', async () => {
  const { cloneElement, isValidElement } = await vi.importActual<typeof import('react')>('react');
  return {
    // Like next/link with legacyBehavior: the child anchor receives the href instead of being wrapped.
    default: ({ children, href, legacyBehavior }: any) =>
      legacyBehavior && isValidElement(children)
        ? cloneElement(children as React.ReactElement<{ href?: string }>, { href })
        : <a href={href}>{children}</a>,
  };
});
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

const pending = { ...base, id: 'p-1', templateId: 'tpl-p', templateName: 'Plantilla Pendiente', status: 'pending', hasStarted: false };
const inProgress = { ...base, id: 'p-2', templateId: 'tpl-i', templateName: 'Plantilla En Curso', status: 'in_progress' };
const completed = {
  ...base, id: 'c-1', templateId: 'tpl-c', templateName: 'Plantilla Completada', status: 'completed',
  canEdit: false, canSubmit: false, hasSubmitted: true, completedAt: '2026-04-01T00:00:00Z',
};
const archived = {
  ...base, id: 'a-1', templateId: 'tpl-a', templateName: 'Plantilla Archivada', templateVersion: '1.0.0', status: 'archived',
  canEdit: false, canSubmit: false, generationType: 'GT', gradeLevel: '3_basico', courseName: '3° Básico A',
};

// Emulates the list API: an optional ?status= narrows the docente's own assignments.
function installApiFetch(dataset: Array<{ status: string }>) {
  const fetchMock = vi.fn(async (input: string) => {
    const status = new URL(input, 'http://localhost').searchParams.get('status');
    const assessments = status ? dataset.filter((a) => a.status === status) : dataset;
    return { ok: true, status: 200, json: async () => ({ success: true, assessments, total: assessments.length }) };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function sectionFor(heading: string) {
  return screen.getByRole('heading', { level: 2, name: heading }).closest('section') as HTMLElement;
}

describe('docente assessments list — archived assessments', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    installSupabase();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders an archived-only response in the Archivados group with a read-only detail link', async () => {
    installApiFetch([archived]);
    render(<DocenteAssessmentsPage />);

    await screen.findByRole('heading', { level: 2, name: 'Archivados (1)' });
    const section = sectionFor('Archivados (1)');
    expect(within(section).getByRole('heading', { level: 3, name: 'Plantilla Archivada' })).toBeInTheDocument();
    expect(within(section).getByText('v1.0.0')).toBeInTheDocument();
    expect(within(section).getByText('Archivado')).toBeInTheDocument();
    expect(within(section).getByTestId('assessment-card-course-a-1')).toHaveTextContent('3° Básico · 3° Básico A');
    expect(within(section).getByText(/solo para consulta, no se puede continuar ni enviar/)).toBeInTheDocument();

    const links = within(section).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Ver registro');
    expect(links[0]).toHaveAttribute('href', '/docente/assessments/a-1');
    expect(screen.queryByRole('link', { name: /Continuar/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Ver Resultados/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Por Completar/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Completados/ })).toBeNull();
    expect(screen.queryByText('No hay registros asignados')).toBeNull();
  });

  it('groups a mixed response into active, completed and archived with their own actions', async () => {
    installApiFetch([pending, inProgress, completed, archived]);
    render(<DocenteAssessmentsPage />);

    await screen.findByRole('heading', { level: 2, name: 'Por Completar (2)' });
    expect(screen.getAllByRole('link')).toHaveLength(4);

    const activeLinks = within(sectionFor('Por Completar (2)')).getAllByRole('link');
    expect(activeLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/docente/assessments/p-1',
      '/docente/assessments/p-2',
    ]);
    activeLinks.forEach((link) => expect(link).toHaveAccessibleName('Continuar'));

    const completedLinks = within(sectionFor('Completados (1)')).getAllByRole('link');
    expect(completedLinks).toHaveLength(1);
    expect(completedLinks[0]).toHaveAccessibleName('Ver Resultados');
    expect(completedLinks[0]).toHaveAttribute('href', '/docente/assessments/c-1/results');

    const archivedSection = sectionFor('Archivados (1)');
    expect(within(archivedSection).getByRole('heading', { level: 3, name: 'Plantilla Archivada' })).toBeInTheDocument();
    const archivedLinks = within(archivedSection).getAllByRole('link');
    expect(archivedLinks).toHaveLength(1);
    expect(archivedLinks[0]).toHaveAccessibleName('Ver registro');
    expect(archivedLinks[0]).toHaveAttribute('href', '/docente/assessments/a-1');
  });

  it('requests archived assessments through the status filter and returns to the unfiltered list', async () => {
    const fetchMock = installApiFetch([pending, inProgress, completed, archived]);
    render(<DocenteAssessmentsPage />);

    await screen.findByRole('heading', { level: 2, name: 'Por Completar (2)' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/docente/assessments?');

    const filter = screen.getByRole('combobox', { name: 'Filtrar por estado' });
    expect(filter).toBe(screen.getByTestId('assessment-status-filter'));
    fireEvent.change(filter, { target: { value: 'archived' } });
    expect(filter).toHaveValue('archived');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/docente/assessments?status=archived');
      expect(screen.getByRole('heading', { level: 2, name: 'Archivados (1)' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /Por Completar/ })).toBeNull();
      expect(screen.queryByRole('heading', { name: /Completados/ })).toBeNull();
    });
    expect(screen.getAllByRole('link')).toHaveLength(1);

    fireEvent.change(filter, { target: { value: '' } });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/docente/assessments?');
      expect(screen.getByRole('heading', { level: 2, name: 'Por Completar (2)' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Completados (1)' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Archivados (1)' })).toBeInTheDocument();
    });
  });

  it('keeps the loading state until the response arrives and shows the empty message for no assessments', async () => {
    let resolveResponse: (value: unknown) => void = () => {};
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { resolveResponse = resolve; })) as unknown as typeof fetch;
    render(<DocenteAssessmentsPage />);

    expect(await screen.findByText('Cargando registros...')).toBeInTheDocument();
    resolveResponse({ ok: true, status: 200, json: async () => ({ success: true, assessments: [], total: 0 }) });

    expect(await screen.findByText('No hay registros asignados')).toBeInTheDocument();
    expect(screen.queryByText('Cargando registros...')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
