// @vitest-environment jsdom
/**
 * pages/admin/assessment-builder/create.tsx — vía rules (20261008120000)
 *
 * Renders the real page with its data sources mocked:
 * - a school-level vía hides the grade, posts grade_id null and auto-names
 *   from a grade-less count (grade_id=none);
 * - Codex B3 r1: when the vía changes while a count request is in flight, the
 *   obsolete answer never sets the name, whatever order the answers arrive in.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const { supabaseHolder, routerMock } = vi.hoisted(() => ({
  supabaseHolder: { current: null as any },
  routerMock: { push: vi.fn(), replace: vi.fn(), pathname: '/admin/assessment-builder/create', query: {}, isReady: true },
}));

vi.mock('next/router', () => ({ useRouter: () => routerMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => supabaseHolder.current }));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import CreateTemplate from '../../../pages/admin/assessment-builder/create';

const RULES = [
  { area: 'personalizacion', target: 'course_docente' },
  { area: 'aprendizaje', target: 'course_docente' },
  { area: 'evaluacion', target: 'course_docente' },
  { area: 'trabajo_docente', target: 'course_docente' },
  { area: 'familias', target: 'course_docente' },
  { area: 'liderazgo', target: 'school_responsible' },
  { area: 'proposito', target: 'school_responsible' },
];

type Pending = { url: string; resolve: (count: number) => void };
let pendingCounts: Pending[] = [];
let posted: any[] = [];

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

beforeEach(() => {
  pendingCounts = [];
  posted = [];
  supabaseHolder.current = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'admin-1' } } } }) },
    from: (table: string) => {
      if (table === 'user_roles') return buildChainableQuery([{ role_type: 'admin' }]);
      if (table === 'ab_via_assignment_rules') return buildChainableQuery(RULES);
      return buildChainableQuery(null);
    },
  };
  global.fetch = vi.fn((input: any, init?: any) => {
    const url = String(input);
    if (url.includes('/grades')) return jsonResponse({ grades: [{ id: 7, name: 'Primero Básico', is_always_gt: false }] });
    if (url.includes('count_only=true')) {
      return new Promise((resolveFetch) => {
        pendingCounts.push({ url, resolve: (count) => resolveFetch({ ok: true, json: () => Promise.resolve({ count }) } as Response) });
      });
    }
    if (init?.method === 'POST') {
      posted.push(JSON.parse(init.body));
      return jsonResponse({ template: { id: 'new' } });
    }
    return jsonResponse({});
  }) as any;
});

afterEach(() => vi.restoreAllMocks());

async function ready() {
  render(<CreateTemplate />);
  await screen.findByLabelText(/Vía de Evolución/);
  await act(async () => {});
}

const year = new Date().getFullYear();

describe('create template — school-level vías', () => {
  it('hides the grade, counts grade-less templates, and posts grade_id null', async () => {
    await ready();
    fireEvent.change(screen.getByLabelText(/Vía de Evolución/), { target: { value: 'liderazgo' } });
    expect(await screen.findByTestId('template-school-via-note')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Nivel/)).not.toBeInTheDocument();

    await waitFor(() => expect(pendingCounts.length).toBe(1));
    expect(pendingCounts[0].url).toContain('grade_id=none');
    await act(async () => pendingCounts[0].resolve(2));
    await waitFor(() => expect(screen.getByLabelText(/Nombre del Template/)).toHaveValue(`LID_${year}_V3`));

    fireEvent.click(screen.getByRole('button', { name: /Crear|Guardar/ }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ area: 'liderazgo', grade_id: null });
  });

  it('an obsolete count answer arriving last never names the new vía', async () => {
    await ready();
    fireEvent.change(screen.getByLabelText(/Vía de Evolución/), { target: { value: 'liderazgo' } });
    await waitFor(() => expect(pendingCounts.length).toBe(1));
    fireEvent.change(screen.getByLabelText(/Vía de Evolución/), { target: { value: 'proposito' } });
    await waitFor(() => expect(pendingCounts.length).toBe(2));

    // Propósito answers first, Liderazgo (obsolete) last.
    await act(async () => pendingCounts[1].resolve(0));
    await waitFor(() => expect(screen.getByLabelText(/Nombre del Template/)).toHaveValue(`PRO_${year}_V1`));
    await act(async () => pendingCounts[0].resolve(5));
    await act(async () => {});
    expect(screen.getByLabelText(/Nombre del Template/)).toHaveValue(`PRO_${year}_V1`);
  });

  async function suggestedName() {
    await ready();
    fireEvent.change(screen.getByLabelText(/Vía de Evolución/), { target: { value: 'liderazgo' } });
    await waitFor(() => expect(pendingCounts.length).toBe(1));
    await act(async () => pendingCounts[0].resolve(0));
    const input = screen.getByLabelText(/Nombre del Template/) as HTMLInputElement;
    await waitFor(() => expect(input).toHaveValue(`LID_${year}_V1`));
    return input;
  }

  const mouseUp = (input: HTMLInputElement) => {
    const event = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('the click that focuses the suggested name selects all of it, so typing replaces it', async () => {
    const input = await suggestedName();
    input.setSelectionRange(input.value.length, input.value.length);
    fireEvent.mouseDown(input);
    input.focus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    expect(mouseUp(input)).toBe(true);
    // A second click in the already-focused field places the caret normally.
    fireEvent.mouseDown(input);
    expect(mouseUp(input)).toBe(false);
  });

  it('keyboard focus selects the suggestion; after editing, a later click is never suppressed', async () => {
    const input = await suggestedName();
    input.setSelectionRange(0, 0);
    input.focus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    fireEvent.change(input, { target: { value: 'Mi nombre' } });
    fireEvent.mouseDown(input);
    expect(mouseUp(input)).toBe(false);
  });

  it('a custom name is not selected on focus', async () => {
    const input = await suggestedName();
    fireEvent.change(input, { target: { value: 'Mi nombre' } });
    input.blur();
    input.setSelectionRange(2, 2);
    fireEvent.mouseDown(input);
    input.focus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
    expect(mouseUp(input)).toBe(false);
  });
});
