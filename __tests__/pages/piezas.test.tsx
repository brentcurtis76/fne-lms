// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

// Next.js pages use the automatic JSX runtime; vitest's transform here is classic.
(globalThis as any).React = React;
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';

/**
 * Redesign 5c — `/configuracion/piezas`, the tester-only sample page of the shared pieces.
 *
 * getServerSideProps runs with the real lib/api-auth (only the auth-helpers client and the service-role
 * client are fakes), as in apariencia.test.tsx: the page has exactly «Apariencia»'s gate. The page
 * itself saves nothing and calls nothing: `fetch` is a spy that must stay untouched. Synthetic ids only.
 */

const OWNER = '55555555-5555-4555-8555-555555555555';

const { auth, db } = vi.hoisted(() => ({
  auth: { session: null as null | { access_token: string; user: { id: string } }, verified: null as null | { id: string } },
  db: {
    profile: { must_change_password: false, can_run_qa_tests: true, learning_preferences: {} } as Record<string, unknown> | null,
    profileError: false,
    reads: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  },
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
vi.mock('../../components/layout/MainLayout', () => ({
  default: ({ children, pageTitle }: { children: React.ReactNode; pageTitle: string }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

import Page, { getServerSideProps } from '../../pages/configuracion/piezas';

const context = () =>
  ({ req: { headers: {} }, res: {}, query: {}, resolvedUrl: '/configuracion/piezas' }) as unknown as GetServerSidePropsContext;

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
});

describe('who reaches «Piezas de la interfaz»', () => {
  it('no session: login with the destination, nothing read', async () => {
    expect(await getServerSideProps(context())).toEqual({
      redirect: { destination: '/login?next=%2Fconfiguracion%2Fpiezas', permanent: false },
    });
    expect(db.reads).toEqual([]);
  });

  it('a user who must change their password is sent there first', async () => {
    signedIn();
    db.profile = { must_change_password: true, can_run_qa_tests: true, learning_preferences: {} };
    expect(await getServerSideProps(context())).toEqual({ redirect: { destination: '/change-password', permanent: false } });
  });

  it('an account that is not a QA tester is sent to the notification settings, whatever look it stored', async () => {
    signedIn();
    db.profile = { must_change_password: false, can_run_qa_tests: false, learning_preferences: { ui_look: 'nuevo' } };
    expect(await getServerSideProps(context())).toEqual(TO_SETTINGS);
  });

  it('a profile that is missing or cannot be read never gets the page', async () => {
    signedIn();
    // A read error already stops the forced-password check (its own redirect); either way, no page.
    db.profileError = true;
    const failed = await getServerSideProps(context());
    expect('redirect' in failed).toBe(true);
    db.profileError = false;
    db.profile = null;
    expect('redirect' in (await getServerSideProps(context()))).toBe(true);
  });

  it('a QA tester gets the page, read from their own row', async () => {
    signedIn();
    expect(await getServerSideProps(context())).toEqual({ props: {} });
    for (const read of db.reads) expect(read.filters).toEqual([['id', OWNER]]);
  });
});

describe('the page', () => {
  const SECTIONS = ['buttons', 'fields', 'dialogs', 'table', 'tabs', 'badges', 'cards', 'notices', 'states', 'header'];

  it('shows the title, the sentence and every section with its heading; calls nothing', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: 'Piezas de la interfaz' })).toBeInTheDocument();
    expect(screen.getByText('Muestras de las piezas del diseño. Nada de lo que hagas aquí se guarda.')).toBeInTheDocument();
    for (const id of SECTIONS) {
      const section = screen.getByTestId(`kit-section-${id}`);
      expect(within(section).getByRole('heading', { level: 2 })).toBeInTheDocument();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('the confirmation shows «Cancelado», then «Confirmado»', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByTestId('kit-open-confirm'));
    expect(screen.getByRole('dialog', { name: '¿Enviar el registro?' })).toBeInTheDocument();
    await user.click(screen.getByTestId('kit-confirm-cancel'));
    await waitFor(() => expect(screen.getByTestId('kit-confirm-result')).toHaveTextContent('Cancelado'));
    await user.click(screen.getByTestId('kit-open-confirm'));
    await user.click(screen.getByTestId('kit-confirm-confirm'));
    await waitFor(() => expect(screen.getByTestId('kit-confirm-result')).toHaveTextContent('Confirmado'));
  });

  it('the table has twelve rows in pages of five, sorts by progress and selects a row', async () => {
    const user = userEvent.setup();
    render(<Page />);
    const table = screen.getByRole('table', { name: 'Participantes de ejemplo' });
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(screen.getByTestId('kit-pagination-range')).toHaveTextContent('Mostrando 1–5 de 12 participantes');
    await user.click(screen.getByTestId('kit-pagination-next'));
    await user.click(screen.getByTestId('kit-pagination-next'));
    expect(screen.getByTestId('kit-pagination-range')).toHaveTextContent('Mostrando 11–12 de 12 participantes');
    expect(screen.getByTestId('kit-pagination-next')).toBeDisabled();

    await user.click(within(screen.getByTestId('kit-sort-progress')).getByRole('button'));
    expect(screen.getByTestId('kit-sort-progress')).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByTestId('kit-pagination-range')).toHaveTextContent('Mostrando 1–5 de 12 participantes');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('0%');

    await user.click(screen.getByRole('radio', { name: 'Seleccionar a Participante G' }));
    expect(screen.getByTestId('kit-row-p-7')).toHaveAttribute('aria-selected', 'true');
  });

  it('the long-text field says what is true in both looks, not that it grows', () => {
    render(<Page />);
    expect(screen.getByText('Un texto largo, en varias líneas.')).toBeInTheDocument();
    // The old sentence is built from parts so that it is never whole in this file.
    const old = ['Un texto largo:', 'el campo crece', 'hacia abajo.'].join(' ');
    expect(screen.queryByText(old)).toBeNull();
    expect(document.body.textContent ?? '').not.toContain('crece hacia abajo');
  });

  it('the window opens from its button and Escape closes it', async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(screen.getByTestId('kit-open-dialog'));
    expect(screen.getByRole('dialog', { name: 'Gestión de roles' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('kit-open-dialog')).toHaveFocus());
  });
});
