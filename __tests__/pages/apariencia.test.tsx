// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Next.js pages use the automatic JSX runtime; vitest's transform here is classic.
(globalThis as any).React = React;
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';

/**
 * Redesign 4d — `/configuracion/apariencia`.
 *
 * getServerSideProps runs with the real lib/api-auth (only the auth-helpers client and the
 * service-role client are fakes), so identity comes from the auth server and the
 * forced-password rule is the real one. The page runs for real against a fake of
 * `/api/user/look`. Synthetic ids only.
 */

const OWNER = '44444444-4444-4444-8444-444444444444';

const { auth, db, lookContext } = vi.hoisted(() => ({
  auth: { session: null as null | { access_token: string; user: { id: string } }, verified: null as null | { id: string } },
  db: {
    profile: { must_change_password: false, can_run_qa_tests: true, learning_preferences: {} } as Record<string, unknown> | null,
    profileError: false,
    reads: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  },
  lookContext: { look: 'clasico', setLook: vi.fn() },
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session }, error: null }),
      getUser: async () => (auth.verified ? { data: { user: auth.verified }, error: null } : { data: { user: null }, error: { message: 'invalid token' } }),
    },
  }),
}));

function serviceChain(table: string) {
  const read = { table, filters: [] as Array<[string, unknown]> };
  db.reads.push(read);
  const answer = () => (db.profileError ? { data: null, error: { message: 'down' } } : { data: db.profile, error: null });
  const chain: any = {
    select: () => chain,
    eq: (column: string, value: unknown) => (read.filters.push([column, value]), chain),
    maybeSingle: async () => answer(),
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(answer()).then(resolve, reject),
  };
  return chain;
}

vi.mock('../../lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-auth')>()),
  createServiceRoleClient: () => ({ from: serviceChain }),
}));
vi.mock('../../contexts/LookContext', () => ({ useLook: () => lookContext }));
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

import Page, { getServerSideProps } from '../../pages/configuracion/apariencia';

const context = () =>
  ({ req: { headers: {} }, res: {}, query: {}, resolvedUrl: '/configuracion/apariencia' }) as unknown as GetServerSidePropsContext;

function signedIn() {
  auth.session = { access_token: 'token', user: { id: OWNER } };
  auth.verified = { id: OWNER };
}

const TO_SETTINGS = { redirect: { destination: '/configuracion/notificaciones', permanent: false } };

beforeEach(() => {
  auth.session = null;
  auth.verified = null;
  db.profile = { must_change_password: false, can_run_qa_tests: true, learning_preferences: {} };
  db.profileError = false;
  db.reads = [];
  lookContext.setLook.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('who reaches «Apariencia»', () => {
  it('no session: login with the destination, nothing read', async () => {
    expect(await getServerSideProps(context())).toEqual({
      redirect: { destination: '/login?next=%2Fconfiguracion%2Fapariencia', permanent: false },
    });
    expect(db.reads).toEqual([]);
  });

  it('a user who must change their password is sent there first', async () => {
    signedIn();
    db.profile = { must_change_password: true, can_run_qa_tests: true, learning_preferences: {} };
    expect(await getServerSideProps(context())).toEqual({ redirect: { destination: '/change-password', permanent: false } });
  });

  it('an account that is not a QA tester is sent to the notification settings', async () => {
    signedIn();
    db.profile = { must_change_password: false, can_run_qa_tests: false, learning_preferences: { ui_look: 'nuevo' } };
    expect(await getServerSideProps(context())).toEqual(TO_SETTINGS);
  });

  it('a missing profile is treated as not offered', async () => {
    signedIn();
    db.profile = null;
    const result = await getServerSideProps(context());
    expect('redirect' in result).toBe(true);
  });

  it('a QA tester gets the stored look, read from their own row', async () => {
    signedIn();
    expect(await getServerSideProps(context())).toEqual({ props: { storedLook: 'clasico' } });
    db.profile = { must_change_password: false, can_run_qa_tests: true, learning_preferences: { ui_look: 'nuevo' } };
    expect(await getServerSideProps(context())).toEqual({ props: { storedLook: 'nuevo' } });
    for (const read of db.reads) expect(read.filters).toEqual([['id', OWNER]]);
  });
});

describe('the page', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const save = () => screen.getByTestId('look-save') as HTMLButtonElement;
  const option = (look: string) => screen.getByTestId(`look-option-${look}`) as HTMLInputElement;

  it('shows the stored look selected, with nothing to save', () => {
    render(<Page storedLook="clasico" />);
    expect(screen.getByRole('heading', { name: 'Apariencia' })).toBeInTheDocument();
    expect(option('clasico').checked).toBe(true);
    expect(option('nuevo').checked).toBe(false);
    expect(screen.getByLabelText(/Diseño actual/)).toBe(option('clasico'));
    expect(screen.getByText('La plataforma tal como se ve hoy.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Diseño nuevo \(en construcción\)/)).toBe(option('nuevo'));
    expect(save()).toBeDisabled();
    expect(screen.getByTestId('look-to-notifications')).toHaveAttribute('href', '/configuracion/notificaciones');
  });

  it('saves a choice through the route, shows it at once and says so', async () => {
    const fetchMock = vi.fn(async () => json(200, { look: 'nuevo' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Page storedLook="clasico" />);
    await user.click(option('nuevo'));
    expect(screen.getByTestId('look-unsaved')).toBeInTheDocument();
    await user.click(save());
    await waitFor(() => expect(screen.getByTestId('look-saved')).toHaveTextContent('Tu preferencia se guardó.'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/user/look');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ look: 'nuevo' });
    expect(lookContext.setLook).toHaveBeenCalledWith('nuevo');
    expect(save()).toBeDisabled();
  });

  it('a failed save shows the reason, keeps the choice and changes nothing on the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(403, { error: 'Tu cuenta no tiene esta opción.', code: 'not_offered' })));
    const user = userEvent.setup();
    render(<Page storedLook="clasico" />);
    await user.click(option('nuevo'));
    await user.click(save());
    await waitFor(() => expect(screen.getByTestId('look-save-error')).toHaveTextContent('Tu cuenta no tiene esta opción.'));
    expect(option('nuevo').checked).toBe(true);
    expect(lookContext.setLook).not.toHaveBeenCalled();
    expect(save()).not.toBeDisabled();
  });

  it('an answer that is not a look is an error, never a success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { look: 'azul' })));
    const user = userEvent.setup();
    render(<Page storedLook="nuevo" />);
    await user.click(option('clasico'));
    await user.click(save());
    await waitFor(() => expect(screen.getByTestId('look-save-error')).toBeInTheDocument());
    expect(lookContext.setLook).not.toHaveBeenCalled();
  });

  it('an expired session offers to log in again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: 'No autorizado' })));
    const user = userEvent.setup();
    render(<Page storedLook="clasico" />);
    await user.click(option('nuevo'));
    await user.click(save());
    await waitFor(() => expect(screen.getByTestId('look-expired')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Inicia sesión nuevamente' })).toHaveAttribute('href', '/login?next=%2Fconfiguracion%2Fapariencia');
  });

  it('a network failure is an error; a double click sends one request', async () => {
    let release: (value: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<Page storedLook="clasico" />);
    await user.click(option('nuevo'));
    await user.click(save());
    await user.click(save());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(save()).toBeDisabled();
    // While it saves the options keep the focus they have (they are not disabled) and ignore a change.
    expect(option('clasico')).not.toBeDisabled();
    await user.click(option('clasico'));
    expect(option('nuevo').checked).toBe(true);
    release(json(500, {}));
    await waitFor(() => expect(screen.getByTestId('look-save-error')).toHaveTextContent('No pudimos guardar tu apariencia. Intenta nuevamente.'));
  });
});
