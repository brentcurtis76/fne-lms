// @vitest-environment jsdom
/**
 * GC-8: Contexto Transversal sometimes showed «Cuestionario pendiente» for a
 * configured school until the page was reloaded. The sign-in effect re-runs
 * when Next hands out a new router object, raising the selection counter while
 * the first context request is still in flight; that answer was dropped and
 * never asked again, because the selected school had not changed.
 *
 * 1. The decision "is this answer still the current one" as a pure function.
 * 2. The real page with the context request answering late, after the effect
 *    has run a second time for the same school.
 * Synthetic data only.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { supabaseHolder, routerHolder } = vi.hoisted(() => ({
  supabaseHolder: { current: null as any },
  routerHolder: {
    current: { push: vi.fn(), replace: vi.fn(), pathname: '/school/transversal-context', query: {} as Record<string, string>, isReady: true },
  },
}));

vi.mock('next/router', () => ({ useRouter: () => routerHolder.current }));
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

import TransversalContextDashboard, { isCurrentContextAnswer } from '../../../pages/school/transversal-context/index';

const SCHOOL_ID = 42;
const context = {
  id: 'ctx-1', school_id: SCHOOL_ID, total_students: 120, grade_levels: ['3_basico'], courses_per_level: { '3_basico': 1 },
  implementation_year_2026: 2, period_system: 'semestral', programa_inicia_completed: false, programa_inicia_hours: null,
  updated_at: '2026-03-01T00:00:00Z', created_at: '2026-03-01T00:00:00Z',
};

describe('GC-8 isCurrentContextAnswer', () => {
  it('the review\'s sequence: effect runs twice for the same school, the first answer arrives after the second run → kept', () => {
    // run 1 raises the counter to 1 and the request starts with it; run 2 raises it to 2; the answer arrives.
    expect(isCurrentContextAnswer({ answerGeneration: 1, currentGeneration: 2, requestedSchoolId: SCHOOL_ID, currentSchoolId: SCHOOL_ID })).toBe(true);
  });

  it('an answer for a school the user has left is dropped (D5 unchanged)', () => {
    expect(isCurrentContextAnswer({ answerGeneration: 1, currentGeneration: 2, requestedSchoolId: SCHOOL_ID, currentSchoolId: 77 })).toBe(false);
    expect(isCurrentContextAnswer({ answerGeneration: 1, currentGeneration: 2, requestedSchoolId: SCHOOL_ID, currentSchoolId: null })).toBe(false);
  });

  it('an answer of the current generation is kept', () => {
    expect(isCurrentContextAnswer({ answerGeneration: 3, currentGeneration: 3, requestedSchoolId: SCHOOL_ID, currentSchoolId: SCHOOL_ID })).toBe(true);
  });
});

describe('GC-8 the page ends with the selected school\'s context', () => {
  let releaseContext: () => void;
  let rolesReads = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    rolesReads = 0;
    supabaseHolder.current = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'dir-1', email: 'd@example.test' } } } }), signOut: vi.fn() },
      from: vi.fn((table: string) => {
        if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
        if (table === 'user_roles') {
          rolesReads += 1;
          return buildChainableQuery([{ role_type: 'equipo_directivo', school_id: SCHOOL_ID }]);
        }
        if (table === 'schools') return buildChainableQuery({ name: 'Escuela Sintética' });
        return buildChainableQuery(null, null);
      }),
    };
    let contextCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.startsWith('/api/school/transversal-context?school_id=')) {
        contextCalls += 1;
        const body = { context, courseStructure: [] };
        if (contextCalls === 1) {
          // The first request answers only when the test says so.
          return new Promise<Response>((resolve) => { releaseContext = () => resolve(json(body)); });
        }
        return json(body);
      }
      if (url.startsWith('/api/school/transversal-context/questions')) return json({ questions: [] });
      if (url.startsWith('/api/school/transversal-context/custom-responses')) return json({ responses: [] });
      if (url.startsWith('/api/school/completion-status')) return json({ status: {} });
      return json({});
    }) as unknown as typeof fetch;
  });

  it('a configured school is shown as configured when the first answer arrives after the effect re-ran', async () => {
    const view = render(<TransversalContextDashboard />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(`/api/school/transversal-context?school_id=${SCHOOL_ID}`));

    // Next hands out a new router object (same school): the sign-in effect runs again.
    routerHolder.current = { ...routerHolder.current };
    view.rerender(<TransversalContextDashboard />);
    await waitFor(() => expect(rolesReads).toBe(2));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { releaseContext(); });

    expect(await screen.findByText('Contexto Estructural')).toBeInTheDocument();
    expect(screen.queryByText('Cuestionario pendiente')).not.toBeInTheDocument();
  });
});
