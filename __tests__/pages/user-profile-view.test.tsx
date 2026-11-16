// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opArgs, type RecordedRequest } from '../helpers/recordingSupabase';

/**
 * EC-S5 (GENERA fixes F11): a person's page (/user/[userId]).
 * A viewer who is neither an admin nor the person cannot read the person's
 * profile row (that rule stays); the page then shows the person's card (name,
 * picture) and what the viewer's own session can read (school, roles,
 * courses), never contact data, and never «Usuario no encontrado» for a
 * co-member. An admin and the person themself see the page as before.
 */

const fake = vi.hoisted(() => ({ ref: null as any, role: 'docente', query: { userId: 'user-a2' } as Record<string, string> }));
vi.mock('@supabase/auth-helpers-react', async () => {
  const { createRecordingSupabase } = await import('../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { useSupabaseClient: () => fake.ref.client };
});
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const router = { query: fake.query, push: vi.fn() };
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title }: { title?: string }) => <div data-testid="header">{title}</div>,
}));
vi.mock('../../utils/roleUtils', () => ({
  getUserPrimaryRole: async () => fake.role,
  getUserRoles: async () => [{ id: 'role-1', role_type: 'docente' }],
}));

// The page uses JSX without importing React (Next's automatic runtime).
(globalThis as any).React = React;

import UserProfileView from '../../pages/user/[userId]';

const h = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => { data: unknown; error: unknown };
  userId: string | null;
};

const VIEWER = 'user-a1';
const PERSON = {
  id: 'user-a2',
  first_name: 'María-José',
  last_name: 'Núñez',
  avatar_url: 'https://example.invalid/a2.png',
  email: 'a2@f11.test.local',
  description: 'Profesora de ciencias',
};

/** What the database answers: profile rows per the rules (own row, or all for an admin); cards for co-members. */
function database({ admin, cardKnown = true }: { admin: boolean; cardKnown?: boolean }) {
  h.respond = (req) => {
    if (req.kind === 'rpc' && req.target === 'get_profile_cards') {
      const ids = (req.args as { p_ids: string[] }).p_ids;
      const card = { id: PERSON.id, first_name: PERSON.first_name, last_name: PERSON.last_name, avatar_url: PERSON.avatar_url };
      return { data: cardKnown && ids.includes(PERSON.id) ? [card] : [], error: null };
    }
    if (req.target === 'profiles') {
      const id = opArgs(req, 'eq')?.[1];
      if (id === VIEWER) return { data: { avatar_url: null, id: VIEWER, first_name: 'Ana', last_name: 'Uno', email: 'a1@f11.test.local' }, error: null };
      if (id === PERSON.id && admin) return { data: PERSON, error: null };
      return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    if (req.target === 'course_assignments') {
      return { data: [{ course_id: 'c1', courses: { id: 'c1', title: 'Curso de prueba', description: 'd', created_at: '2026-01-01T00:00:00Z', instructors: null } }], error: null };
    }
    return { data: null, error: null };
  };
}

beforeEach(() => {
  h.requests.length = 0;
  h.userId = VIEWER;
  fake.query.userId = PERSON.id;
  fake.role = 'docente';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ school_name: 'Escuela F11' }), { status: 200 })) as any;
});

describe('EC-S5 a person\'s page', () => {
  it('a co-member sees the name, picture, school, roles and courses — no e-mail, no «Usuario no encontrado»', async () => {
    database({ admin: false });
    render(<UserProfileView />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('María-José Núñez'));
    expect(screen.queryByText('Usuario no encontrado')).toBeNull();
    expect(screen.getByAltText('María-José Núñez').getAttribute('src')).toBe(PERSON.avatar_url);
    expect(screen.getByText('Escuela F11')).toBeTruthy();
    expect(screen.getByText('Docente')).toBeTruthy();
    expect(screen.getByText('Curso de prueba')).toBeTruthy();
    expect(document.body.textContent).not.toContain('a2@f11.test.local');
    expect(document.body.textContent).not.toContain('Email:');
  });

  it('a person the viewer may not know is still «Usuario no encontrado»', async () => {
    database({ admin: false, cardKnown: false });
    render(<UserProfileView />);
    await waitFor(() => expect(screen.getByText('Usuario no encontrado')).toBeTruthy());
  });

  it('an admin sees the page as before, e-mail and description included', async () => {
    fake.role = 'admin';
    database({ admin: true });
    render(<UserProfileView />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('María-José Núñez'));
    expect(screen.getAllByText(/a2@f11\.test\.local/).length).toBeGreaterThan(0);
    expect(screen.getByText('Profesora de ciencias')).toBeTruthy();
  });

  it('a person\'s own page is unchanged', async () => {
    fake.query.userId = VIEWER;
    database({ admin: false });
    render(<UserProfileView />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ana Uno'));
    expect(screen.getAllByText(/a1@f11\.test\.local/).length).toBeGreaterThan(0);
    expect(h.requests.some((r) => r.kind === 'rpc')).toBe(false);
  });
});
