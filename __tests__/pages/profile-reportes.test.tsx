// @vitest-environment jsdom
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor, within } from '@testing-library/react';

// Next.js pages use the automatic JSX runtime; vitest's transform here is classic.
(globalThis as any).React = React;
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GetServerSidePropsContext } from 'next';

/**
 * F15e (GES-2.18, E2-page) — `/profile/reportes`, «Mis reportes».
 *
 * getServerSideProps runs with the real lib/api-auth (only the auth-helpers
 * server client and the service-role client are fakes), as the notification
 * settings page test does. The page reads with the browser client of the
 * signed-in person (a fake that records every query), so the database rules
 * decide what the person sees. Synthetic ids and texts only.
 */

const OWNER = '44444444-4444-4444-8444-444444444444';
const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

type Query = { table: string; select?: string; eq: Array<[string, unknown]>; in: Array<[string, unknown[]]>; order: Array<[string, unknown]> };

const { auth, db, sessionContext, service, router } = vi.hoisted(() => ({
  auth: { session: null as null | { access_token: string; user: { id: string } }, verified: null as null | { id: string } },
  db: {
    tickets: [] as Array<Record<string, unknown>>,
    activity: [] as Array<Record<string, unknown>>,
    ticketsError: false,
    activityError: false,
    hold: null as null | Promise<void>,
    queries: [] as Query[],
    profile: { must_change_password: false } as Record<string, unknown>,
  },
  sessionContext: { isLoading: false, session: null as null | { user: { id: string } }, error: null },
  service: { calls: 0 },
  router: { replace: null as any, push: null as any },
}));

vi.mock('next/router', () => {
  const instance = {
    replace: (...args: unknown[]) => router.replace(...args),
    push: (...args: unknown[]) => router.push(...args),
  };
  return { useRouter: () => instance, default: instance };
});

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session }, error: null }),
      getUser: async () => (auth.verified ? { data: { user: auth.verified }, error: null } : { data: { user: null }, error: { message: 'invalid token' } }),
    },
  }),
}));

vi.mock('../../lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-auth')>()),
  createServiceRoleClient: () => {
    service.calls += 1;
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: db.profile, error: null }),
    };
    return { from: () => chain };
  },
}));

function browserChain(table: string) {
  const query: Query = { table, eq: [], in: [], order: [] };
  db.queries.push(query);
  const answer = async () => {
    if (db.hold) await db.hold;
    if (table === 'platform_feedback') return db.ticketsError ? { data: null, error: { message: 'down' } } : { data: db.tickets, error: null };
    if (table === 'feedback_activity') return db.activityError ? { data: null, error: { message: 'down' } } : { data: db.activity, error: null };
    return { data: null, error: { message: `unexpected table ${table}` } };
  };
  const chain: any = {
    select: (columns: string) => ((query.select = columns), chain),
    eq: (column: string, value: unknown) => (query.eq.push([column, value]), chain),
    in: (column: string, values: unknown[]) => (query.in.push([column, values]), chain),
    order: (column: string, options: unknown) => (query.order.push([column, options]), chain),
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => answer().then(resolve, reject),
  };
  return chain;
}

const browserClient = { from: browserChain };
vi.mock('@supabase/auth-helpers-react', () => ({
  useSessionContext: () => sessionContext,
  useSupabaseClient: () => browserClient,
}));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children, pageTitle, currentPage }: { children: React.ReactNode; pageTitle: string; currentPage: string }) => (
    <div data-current-page={currentPage}>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

import Page, { getServerSideProps } from '../../pages/profile/reportes';

const context = () => ({ req: { headers: {} }, res: {}, query: {}, resolvedUrl: '/profile/reportes' }) as unknown as GetServerSidePropsContext;

function ticket(id: string, extra: Record<string, unknown>) {
  return { id, title: null, description: 'Descripción sintética', type: 'bug', status: 'new', created_at: '2026-11-10T15:00:00Z', ...extra };
}

function row(id: string, extra: Record<string, unknown>) {
  return { id, feedback_id: T1, message: 'Mensaje', is_system_message: false, created_by: ADMIN, created_at: '2026-11-11T15:00:00Z', visible_to_reporter: true, ...extra };
}

beforeEach(() => {
  auth.session = null;
  auth.verified = null;
  db.tickets = [];
  db.activity = [];
  db.ticketsError = false;
  db.activityError = false;
  db.hold = null;
  db.queries = [];
  db.profile = { must_change_password: false };
  service.calls = 0;
  sessionContext.isLoading = false;
  sessionContext.session = { user: { id: OWNER } };
  router.replace = vi.fn(async () => true);
  router.push = vi.fn(async () => true);
});

const LOGIN = '/login?next=%2Fprofile%2Freportes';

describe('(1) getServerSideProps', () => {
  it('a visitor is sent to the login with this page as the destination', async () => {
    expect(await getServerSideProps(context())).toEqual({ redirect: { destination: '/login?next=%2Fprofile%2Freportes', permanent: false } });
    expect(service.calls).toBe(0);
  });

  it('a user who must change their password is sent there', async () => {
    auth.session = { access_token: 'token', user: { id: OWNER } };
    auth.verified = { id: OWNER };
    db.profile = { must_change_password: true };
    expect(await getServerSideProps(context())).toEqual({ redirect: { destination: '/change-password', permanent: false } });
  });

  it('a signed-in user gets the page, owned by the verified user', async () => {
    auth.session = { access_token: 'token', user: { id: 'cookie-user' } };
    auth.verified = { id: OWNER };
    expect(await getServerSideProps(context())).toEqual({ props: { ownerId: OWNER } });
  });
});

describe('(2) the reads use the person\'s own client', () => {
  it('asks for the own tickets newest first, then their comments, naming only the columns shown', async () => {
    db.tickets = [ticket(T2, { created_at: '2026-11-12T15:00:00Z' }), ticket(T1, {})];
    render(<Page ownerId={OWNER} />);
    await screen.findAllByTestId('report-card');
    expect(db.queries).toEqual([
      {
        table: 'platform_feedback',
        select: 'id, title, description, type, status, created_at',
        eq: [['created_by', OWNER]],
        in: [],
        order: [['created_at', { ascending: false }]],
      },
      {
        table: 'feedback_activity',
        select: 'id, feedback_id, message, is_system_message, created_by, created_at, visible_to_reporter',
        eq: [],
        in: [['feedback_id', [T2, T1]]],
        order: [['created_at', { ascending: true }]],
      },
    ]);
    for (const q of db.queries) expect(q.select).not.toContain('*');
    expect(service.calls).toBe(0);
  });

  it('the service client appears only inside getServerSideProps', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../pages/profile/reportes.tsx'), 'utf8');
    const start = source.indexOf('export const getServerSideProps');
    const end = source.indexOf('\n};\n', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const outside = source.slice(0, start) + source.slice(end);
    const uses = outside.split('\n').filter((line) => line.includes('createServiceRoleClient') && !line.startsWith('import '));
    expect(uses).toEqual([]);
    expect(outside).not.toContain('service_role');
  });

  it('waits for the session to finish loading before reading', async () => {
    sessionContext.isLoading = true;
    const { rerender } = render(<Page ownerId={OWNER} />);
    expect(screen.getByText('Cargando tus reportes…')).toBeInTheDocument();
    expect(db.queries).toEqual([]);
    sessionContext.isLoading = false;
    rerender(<Page ownerId={OWNER} />);
    await screen.findByText('Todavía no has reportado ningún problema.');
    expect(db.queries.map((q) => q.table)).toEqual(['platform_feedback']);
  });
});

describe('(3) the cards', () => {
  it('two tickets: two cards newest first with title, type, date and state in Spanish', async () => {
    const long = 'Al guardar la planificación semanal la página se queda en blanco y no aparece ningún mensaje de error visible ahí';
    db.tickets = [
      ticket(T2, { title: 'El botón de guardar no responde', type: 'idea', status: 'in_progress', created_at: '2026-11-12T15:00:00Z' }),
      ticket(T1, { title: null, description: long, type: 'bug', status: 'resolved', created_at: '2026-11-03T15:00:00Z' }),
    ];
    render(<Page ownerId={OWNER} />);
    const cards = await screen.findAllByTestId('report-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole('heading', { level: 2 })).toHaveTextContent('El botón de guardar no responde');
    expect(within(cards[0]).getByText('Idea')).toBeInTheDocument();
    expect(within(cards[0]).getByText('12-11-2026')).toBeInTheDocument();
    expect(within(cards[0]).getByTestId('report-status')).toHaveTextContent('En Progreso');
    expect(within(cards[1]).getByRole('heading', { level: 2 })).toHaveTextContent(long.slice(0, 80));
    expect(within(cards[1]).getByRole('heading', { level: 2 }).textContent).toBe(long.slice(0, 80));
    expect(within(cards[1]).getByText('Problema')).toBeInTheDocument();
    expect(within(cards[1]).getByText('03-11-2026')).toBeInTheDocument();
    expect(within(cards[1]).getByTestId('report-status')).toHaveTextContent('Resuelto');
  });

  it('a ticket of type feedback is labelled «Comentario»', async () => {
    db.tickets = [ticket(T1, { type: 'feedback', title: 'Sugerencia' })];
    render(<Page ownerId={OWNER} />);
    const [card] = await screen.findAllByTestId('report-card');
    expect(within(card).getByText('Comentario')).toBeInTheDocument();
  });
});

describe('(4) replies and own comments', () => {
  it('a reply shows as «Respuesta de Soporte», an own comment as «Tu comentario», system lines are hidden, in time order', async () => {
    db.tickets = [ticket(T1, { title: 'Ticket uno' })];
    db.activity = [
      row('a1', { message: 'Estamos revisando tu caso.', created_at: '2026-11-11T15:00:00Z' }),
      row('a2', { message: 'Status changed from new to seen', is_system_message: true, created_by: OWNER, visible_to_reporter: false, created_at: '2026-11-11T16:00:00Z' }),
      row('a3', { message: 'Gracias, sigue pasando.', created_by: OWNER, visible_to_reporter: false, created_at: '2026-11-13T15:00:00Z' }),
    ];
    render(<Page ownerId={OWNER} />);
    const [card] = await screen.findAllByTestId('report-card');
    const items = within(card).getAllByTestId('report-comment');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Respuesta de Soporte')).toBeInTheDocument();
    expect(within(items[0]).getByText('11-11-2026')).toBeInTheDocument();
    expect(within(items[0]).getByText('Estamos revisando tu caso.')).toBeInTheDocument();
    expect(within(items[1]).getByText('Tu comentario')).toBeInTheDocument();
    expect(within(items[1]).getByText('13-11-2026')).toBeInTheDocument();
    expect(within(items[1]).getByText('Gracias, sigue pasando.')).toBeInTheDocument();
    expect(screen.queryByText(/Status changed/)).not.toBeInTheDocument();
  });

  it('comments go under their own ticket', async () => {
    db.tickets = [ticket(T2, { title: 'Ticket dos', created_at: '2026-11-12T15:00:00Z' }), ticket(T1, { title: 'Ticket uno' })];
    db.activity = [row('a1', { feedback_id: T1, message: 'Respuesta al uno' })];
    render(<Page ownerId={OWNER} />);
    const cards = await screen.findAllByTestId('report-card');
    expect(within(cards[0]).queryAllByTestId('report-comment')).toHaveLength(0);
    expect(within(cards[1]).getByText('Respuesta al uno')).toBeInTheDocument();
  });
});

describe('(4b) rows the person must not see (send-back 1, guard for later changes)', () => {
  it('another person\'s row not marked for the reporter is not shown; a marked one is «Respuesta de Soporte»', async () => {
    db.tickets = [ticket(T1, { title: 'Ticket uno' })];
    db.activity = [
      row('a1', { message: 'Nota interna sintética', created_by: ADMIN, visible_to_reporter: false, is_system_message: false, created_at: '2026-11-11T15:00:00Z' }),
      row('a2', { message: 'Respuesta sintética', created_by: ADMIN, visible_to_reporter: true, is_system_message: false, created_at: '2026-11-12T15:00:00Z' }),
    ];
    render(<Page ownerId={OWNER} />);
    const [card] = await screen.findAllByTestId('report-card');
    const items = within(card).getAllByTestId('report-comment');
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByText('Respuesta de Soporte')).toBeInTheDocument();
    expect(within(items[0]).getByText('Respuesta sintética')).toBeInTheDocument();
    expect(screen.queryByText('Nota interna sintética')).not.toBeInTheDocument();
  });
});

describe('(5)–(7) empty, failure, loading', () => {
  it('no ticket', async () => {
    render(<Page ownerId={OWNER} />);
    expect(await screen.findByText('Todavía no has reportado ningún problema.')).toBeInTheDocument();
    expect(db.queries.map((q) => q.table)).toEqual(['platform_feedback']);
  });

  it('a failed read of the tickets shows the message and «Reintentar» reads again', async () => {
    db.ticketsError = true;
    render(<Page ownerId={OWNER} />);
    expect(await screen.findByText('No se pudieron cargar tus reportes. Inténtalo de nuevo.')).toBeInTheDocument();
    db.ticketsError = false;
    db.tickets = [ticket(T1, { title: 'Ticket uno' })];
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findAllByTestId('report-card')).toHaveLength(1);
    expect(db.queries.filter((q) => q.table === 'platform_feedback')).toHaveLength(2);
  });

  it('a failed read of the comments shows the same message', async () => {
    db.tickets = [ticket(T1, { title: 'Ticket uno' })];
    db.activityError = true;
    render(<Page ownerId={OWNER} />);
    expect(await screen.findByText('No se pudieron cargar tus reportes. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(screen.queryByTestId('report-card')).not.toBeInTheDocument();
  });

  it('the session ends while the error is shown: «Reintentar» does not read and goes to the login (send-back 1)', async () => {
    db.ticketsError = true;
    const { rerender } = render(<Page ownerId={OWNER} />);
    expect(await screen.findByText('No se pudieron cargar tus reportes. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(db.queries).toHaveLength(1);
    sessionContext.session = null;
    rerender(<Page ownerId={OWNER} />);
    db.ticketsError = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(LOGIN));
    expect(db.queries).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('no session once loading is over: no read, the login (send-back 1)', async () => {
    sessionContext.session = null;
    render(<Page ownerId={OWNER} />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(LOGIN));
    expect(db.queries).toEqual([]);
  });

  it('while the session is still loading, «Reintentar» does nothing (send-back 1)', async () => {
    db.ticketsError = true;
    const { rerender } = render(<Page ownerId={OWNER} />);
    expect(await screen.findByText('No se pudieron cargar tus reportes. Inténtalo de nuevo.')).toBeInTheDocument();
    sessionContext.isLoading = true;
    sessionContext.session = null;
    rerender(<Page ownerId={OWNER} />);
    db.ticketsError = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(db.queries).toHaveLength(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('while loading', async () => {
    let release!: () => void;
    db.hold = new Promise<void>((resolve) => (release = resolve));
    render(<Page ownerId={OWNER} />);
    expect(screen.getByText('Cargando tus reportes…')).toBeInTheDocument();
    release();
    await screen.findByText('Todavía no has reportado ningún problema.');
  });
});

describe('(8)–(9) plain text, no English state words, no e-mail address', () => {
  it('markup written in a ticket, a reply or a comment is shown as literal text', async () => {
    const script = '<script>alert("x")</script>';
    const link = '<a href="https://example.invalid">clic</a>';
    db.tickets = [ticket(T1, { title: null, description: script })];
    db.activity = [row('a1', { message: link }), row('a2', { message: script, created_by: OWNER, visible_to_reporter: false, created_at: '2026-11-12T15:00:00Z' })];
    const { container } = render(<Page ownerId={OWNER} />);
    const [card] = await screen.findAllByTestId('report-card');
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe(script);
    expect(within(card).getByText(link)).toBeInTheDocument();
    expect(within(card).getByText(script, { selector: 'p' })).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href="https://example.invalid"]')).toBeNull();
  });

  it('every state in Spanish; no English state word and no e-mail address on the page', async () => {
    const states = ['new', 'seen', 'in_progress', 'resolved', 'closed'];
    db.tickets = states.map((status, i) => ticket(`${i}0000000-0000-4000-8000-000000000000`, { title: `Ticket ${i}`, status }));
    const { container } = render(<Page ownerId={OWNER} />);
    await screen.findAllByTestId('report-card');
    expect(screen.getAllByTestId('report-status').map((el) => el.textContent)).toEqual(['Nuevo', 'Visto', 'En Progreso', 'Resuelto', 'Cerrado']);
    const text = container.textContent ?? '';
    for (const word of states) expect(text).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
    expect(text).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  });

  it('an unknown state or type is named plainly, in Spanish (send-back 1)', async () => {
    db.tickets = [ticket(T1, { title: 'Ticket raro', status: 'archived', type: 'question' })];
    const { container } = render(<Page ownerId={OWNER} />);
    const [card] = await screen.findAllByTestId('report-card');
    expect(within(card).getByTestId('report-status')).toHaveTextContent('Estado desconocido');
    expect(within(card).getByText('Reporte')).toBeInTheDocument();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/archived|question/i);
  });

  it('the frame: title «Mis reportes» and the profile page as current page', async () => {
    const { container } = render(<Page ownerId={OWNER} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mis reportes');
    expect(container.querySelector('[data-current-page="profile"]')).not.toBeNull();
    await screen.findByText('Todavía no has reportado ningún problema.');
  });
});
