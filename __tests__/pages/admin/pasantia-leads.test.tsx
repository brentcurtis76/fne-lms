// @vitest-environment jsdom
/**
 * PASANT-B004 remediation-1 — the ACTUAL admin page (`pages/admin/pasantia-leads.tsx`),
 * rendered with only its chrome stubbed: MainLayout, the page header, toasts, and the
 * server-only auth imports that `getServerSideProps` uses and a client render never reaches.
 *
 * Every request the page makes goes through a fake `fetch` that the test answers
 * explicitly, in an order the test chooses. Nothing waits on wall-clock time. The only
 * faked timer is `setTimeout` (the search debounce), advanced deliberately and drained
 * at the end of each test, so the assertions read the screen after everything has
 * settled, not as soon as the expected text first appears.
 *
 * B004-R1-01: a save started under one filter/page must not repaint the screen with
 *             that old context after the admin has moved to another one.
 * B004-R1-02: an export whose last page the API refuses must download nothing, say so,
 *             and leave the button usable for a retry.
 *
 * The fake server answers by the request's own URL. The tab counts in these answers
 * are deliberately different per context, although the real API's tab counts are
 * global: that is how the final screen shows WHICH answer painted it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({ toast: { success: toastSuccess, error: toastError } }));

vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({
    children,
    title,
  }: {
    children?: React.ReactNode;
    title: string;
  }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Server-side only (`getServerSideProps`); never called by a client render.
vi.mock('../../../lib/api-auth', () => ({
  createServiceRoleClient: vi.fn(),
  getServerSideUser: vi.fn(),
}));
vi.mock('../../../utils/roleUtils', () => ({ isGlobalAdmin: vi.fn() }));

// Import AFTER mocks.
import PasantiaLeadsAdminPage from '../../../pages/admin/pasantia-leads';
import { ReportExporter } from '../../../lib/exportUtils';

// ---------------------------------------------------------------------------
// Fake fetch: every request waits until the test answers it.
// ---------------------------------------------------------------------------

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  params: URLSearchParams;
  /** The fake server's version when the request was sent. */
  version: number;
  answered: boolean;
  answer: (status: number, body: unknown) => void;
}

let calls: Call[] = [];
let serverVersion = 0;

function installFetch() {
  calls = [];
  serverVersion = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: { method?: string; body?: unknown }) => {
      const url = String(input);
      let settle!: (response: FakeResponse) => void;
      const promise = new Promise<FakeResponse>((resolve) => {
        settle = resolve;
      });
      const call: Call = {
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        params: new URL(url, 'http://localhost').searchParams,
        version: serverVersion,
        answered: false,
        answer: (status, body) => {
          if (call.answered) throw new Error(`answered twice: ${url}`);
          call.answered = true;
          settle({ ok: status >= 200 && status < 300, status, json: async () => body });
        },
      };
      calls.push(call);
      return promise;
    })
  );
}

const gets = () => calls.filter((call) => call.method === 'GET');
const patches = () => calls.filter((call) => call.method === 'PATCH');

/** Let every already-answered request run to completion and React commit it. Finite. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 25; i += 1) {
      await Promise.resolve();
    }
  });
}

/** Run any pending timer (the search debounce), then settle again. */
async function drain() {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  await flush();
}

// ---------------------------------------------------------------------------
// Synthetic contacts and answers.
// ---------------------------------------------------------------------------

function contact(id: string, firstName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    cohort: 'enero-2027',
    first_name: firstName,
    last_name: 'Sintético',
    email: `${firstName.toLowerCase()}@example.com`,
    institution: 'Colegio Sintético',
    phone: null,
    role_title: null,
    num_people: null,
    message: null,
    notes: null,
    status: 'new',
    source_path: '/pasantias',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    consent_accepted_at: '2026-10-10T09:00:00.000Z',
    consent_notice_version: 'v2',
    marketing_opt_in: false,
    marketing_opt_in_at: null,
    brochure_sent_at: null,
    created_at: '2026-10-10T09:00:00.000000+00:00',
    updated_at: '2026-10-10T09:00:00.000000+00:00',
    program_interests: [],
    ...overrides,
  };
}

const ALFA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BETA = 'bbbbbbbb-0000-4000-8000-000000000002';
const UNO = 'cccccccc-0000-4000-8000-000000000001';
const DOS = 'cccccccc-0000-4000-8000-000000000002';
const TRES = 'cccccccc-0000-4000-8000-000000000003';

const COUNTS_A = { new: 11, contacted: 12, converted: 13, dismissed: 14, total: 50 };
const COUNTS_B = { new: 21, contacted: 22, converted: 23, dismissed: 24, total: 90 };

function screenPage(
  leads: unknown[],
  counts: Record<string, number>,
  page: number,
  total: number
) {
  return {
    leads,
    counts,
    pagination: { page, pageSize: 50, total, pageCount: Math.ceil(total / 50) },
    watermark: '2026-10-15T12:00:00.000000+00:00',
  };
}

/**
 * Context A is "no filter"; context B is whatever filter the test switched to. A later
 * server version (after the save) answers B with counts one higher, so a stale B answer
 * is distinguishable from the fresh one.
 */
function filterServer(call: Call) {
  const filtered = call.params.has('status') || call.params.has('program');
  if (!filtered) return screenPage([contact(ALFA, 'Alfa')], COUNTS_A, 1, 1);
  const counts = Object.fromEntries(
    Object.entries(COUNTS_B).map(([key, value]) => [key, value + call.version])
  );
  return screenPage([contact(BETA, 'Beta', { status: 'contacted' })], counts, 1, 1);
}

/** 120 contacts, three screen pages; each page has its own unique contact. */
function pagingServer(call: Call) {
  const page = Number(call.params.get('page'));
  const lead = [contact(UNO, 'Uno'), contact(DOS, 'Dos'), contact(TRES, 'Tres')][page - 1];
  return screenPage([lead], COUNTS_A, page, 120);
}

function answerFrom(server: (call: Call) => unknown, call: Call) {
  call.answer(200, server(call));
}

function answerPatch(call: Call) {
  serverVersion += 1;
  call.answer(200, { lead: { ...contact(String(call.body?.id), 'Guardado'), ...call.body } });
}

// ---------------------------------------------------------------------------
// Screen reads.
// ---------------------------------------------------------------------------

function tabCount(key: string) {
  return screen.getByTestId(`pasantia-leads-tab-${key}`).querySelector('span')?.textContent;
}

function rowShown(id: string) {
  return (
    screen.queryByTestId(`pasantia-lead-toggle-${id}`) !== null ||
    screen.queryByTestId(`pasantia-lead-toggle-mobile-${id}`) !== null
  );
}

function rangeText() {
  return screen.getByTestId('pasantia-leads-range').textContent;
}

/** Render, let the mount debounce fire, and answer the first screen request. */
async function renderLoaded(server: (call: Call) => unknown) {
  render(<PasantiaLeadsAdminPage />);
  // Let 300 ms pass, as for an admin who has been on the page that long; with no search
  // typed, the debounce must not send a request of its own.
  act(() => {
    vi.advanceTimersByTime(300);
  });
  expect(gets()).toHaveLength(1);
  answerFrom(server, gets()[0]);
  await flush();
}

/** Open the contact's detail and start a save through the real controls. */
function startSave(id: string, kind: 'notes' | 'status') {
  fireEvent.click(screen.getByTestId(`pasantia-lead-toggle-${id}`));
  if (kind === 'notes') {
    fireEvent.change(screen.getByTestId(`desktop-lead-notes-${id}`), {
      target: { value: 'Llamar el lunes' },
    });
    fireEvent.click(screen.getByTestId(`desktop-lead-notes-save-${id}`));
  } else {
    fireEvent.change(screen.getByTestId(`desktop-lead-status-select-${id}`), {
      target: { value: 'contacted' },
    });
  }
  expect(patches()).toHaveLength(1);
  const patch = patches()[0];
  expect(patch.body).toEqual(
    kind === 'notes' ? { id, notes: 'Llamar el lunes' } : { id, status: 'contacted' }
  );
  return patch;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  installFetch();
  toastSuccess.mockReset();
  toastError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// B004-R1-01 — a save that ends after the context changed.
// ---------------------------------------------------------------------------

describe('a save that ends after the admin changed filter (B004-R1-01)', () => {
  type FilterSwitch = [string, () => void, (params: URLSearchParams) => boolean];
  const SWITCHES: FilterSwitch[] = [
    [
      'status tab',
      () => fireEvent.click(screen.getByTestId('pasantia-leads-tab-contacted')),
      (params: URLSearchParams) =>
        params.get('status') === 'contacted' && !params.has('program') && params.get('page') === '1',
    ],
    [
      'program filter',
      () =>
        fireEvent.change(screen.getByTestId('pasantia-leads-program-filter'), {
          target: { value: 'mirada-profunda' },
        }),
      (params: URLSearchParams) =>
        params.get('program') === 'mirada-profunda' &&
        !params.has('status') &&
        params.get('page') === '1',
    ],
  ];

  const ORDERS = ['new-filter GET first', 'PATCH first'] as const;

  describe.each(SWITCHES)('switching the %s', (_label, switchFilter, isContextB) => {
    it.each(ORDERS)('keeps the new filter on screen (%s)', async (order) => {
      await renderLoaded(filterServer);
      expect(rowShown(ALFA)).toBe(true);
      expect(tabCount('all')).toBe('50');

      const patch = startSave(ALFA, 'notes');
      switchFilter();
      const switched = gets()[1];
      expect(isContextB(switched.params)).toBe(true);

      if (order === 'new-filter GET first') {
        answerFrom(filterServer, switched);
        await flush();
        expect(rowShown(BETA)).toBe(true);
        answerPatch(patch);
        await flush();
      } else {
        answerPatch(patch);
        await flush();
      }

      // The save's refresh: exactly one more GET, for the context ON SCREEN.
      expect(gets()).toHaveLength(3);
      const refresh = gets()[2];
      expect(isContextB(refresh.params)).toBe(true);
      answerFrom(filterServer, refresh);
      await flush();
      if (order === 'PATCH first') {
        // The switch's own answer, sent before the save ended, arrives last.
        answerFrom(filterServer, switched);
        await flush();
      }
      await drain();

      // Nothing else was asked, and nothing for context A after the switch.
      expect(calls.every((call) => call.answered)).toBe(true);
      expect(gets()).toHaveLength(3);
      for (const call of gets().slice(1)) {
        expect(isContextB(call.params)).toBe(true);
      }

      // The final screen is B's, from the newest answer (server version 1).
      expect(rowShown(BETA)).toBe(true);
      expect(rowShown(ALFA)).toBe(false);
      expect(screen.queryAllByText('alfa@example.com')).toHaveLength(0);
      expect(tabCount('all')).toBe(String(COUNTS_B.total + 1));
      expect(tabCount('contacted')).toBe(String(COUNTS_B.contacted + 1));
      expect(rangeText()).toBe('Mostrando 1–1 de 1 contacto · Página 1 de 1');
      expect(toastSuccess).toHaveBeenCalledWith('Nota guardada');
    });
  });

  it('a status change that ends after the switch, with a stale context-A answer arriving last', async () => {
    await renderLoaded(filterServer);
    const patch = startSave(ALFA, 'status');

    // A context-A refresh is in flight when the admin switches filter.
    fireEvent.click(screen.getByTestId('pasantia-leads-refresh'));
    const staleA = gets()[1];
    expect(staleA.params.has('status')).toBe(false);
    fireEvent.click(screen.getByTestId('pasantia-leads-tab-contacted'));
    const switched = gets()[2];
    expect(switched.params.get('status')).toBe('contacted');

    answerFrom(filterServer, switched);
    await flush();
    answerPatch(patch);
    await flush();
    expect(gets()).toHaveLength(4);
    const refresh = gets()[3];
    expect(refresh.params.get('status')).toBe('contacted');
    answerFrom(filterServer, refresh);
    await flush();

    // The pre-switch context-A answer lands last of all.
    answerFrom(filterServer, staleA);
    await flush();
    await drain();

    expect(calls.every((call) => call.answered)).toBe(true);
    expect(gets()).toHaveLength(4);
    expect(screen.getByTestId('pasantia-leads-tab-contacted')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('pasantia-leads-tab-all')).toHaveAttribute('aria-selected', 'false');
    expect(rowShown(BETA)).toBe(true);
    expect(rowShown(ALFA)).toBe(false);
    expect(tabCount('all')).toBe(String(COUNTS_B.total + 1));
    expect(rangeText()).toBe('Mostrando 1–1 de 1 contacto · Página 1 de 1');
    expect(toastSuccess).toHaveBeenCalledWith('Estado actualizado');
  });
});

describe('a save that ends after the admin changed page (B004-R1-01)', () => {
  it.each(['page-2 GET first', 'PATCH first'] as const)(
    'keeps page 2 on screen (%s)',
    async (order) => {
      await renderLoaded(pagingServer);
      expect(rowShown(UNO)).toBe(true);
      expect(rangeText()).toBe('Mostrando 1–50 de 120 contactos · Página 1 de 3');

      const patch = startSave(UNO, 'notes');
      fireEvent.click(screen.getByTestId('pasantia-leads-page-next'));
      const next = gets()[1];
      expect(next.params.get('page')).toBe('2');

      if (order === 'page-2 GET first') {
        answerFrom(pagingServer, next);
        await flush();
        expect(rowShown(DOS)).toBe(true);
        answerPatch(patch);
        await flush();
      } else {
        answerPatch(patch);
        await flush();
      }

      expect(gets()).toHaveLength(3);
      const refresh = gets()[2];
      // Never page 1, the page the save began on.
      expect(refresh.params.get('page')).toBe('2');
      answerFrom(pagingServer, refresh);
      await flush();
      if (order === 'PATCH first') {
        answerFrom(pagingServer, next);
        await flush();
      }
      await drain();

      expect(calls.every((call) => call.answered)).toBe(true);
      expect(gets().map((call) => call.params.get('page'))).toEqual(['1', '2', '2']);
      expect(rowShown(DOS)).toBe(true);
      expect(rowShown(UNO)).toBe(false);
      expect(rowShown(TRES)).toBe(false);
      expect(rangeText()).toBe('Mostrando 51–100 de 120 contactos · Página 2 de 3');
      // The pager is live again and moves on from page 2, not from page 1.
      fireEvent.click(screen.getByTestId('pasantia-leads-page-next'));
      expect(gets()[3].params.get('page')).toBe('3');
    }
  );
});

// ---------------------------------------------------------------------------
// BROWSER-RUNTIME-01 — only a changed search resets the page.
// ---------------------------------------------------------------------------

describe('the search debounce resets the page only for a new search (BROWSER-RUNTIME-01)', () => {
  it('a last-page click inside the first 300 ms stays on the last page', async () => {
    render(<PasantiaLeadsAdminPage />);
    // No timer is advanced: the admin clicks before 300 ms have passed.
    expect(gets()).toHaveLength(1);
    answerFrom(pagingServer, gets()[0]);
    await flush();
    expect(rangeText()).toBe('Mostrando 1–50 de 120 contactos · Página 1 de 3');

    fireEvent.click(screen.getByTestId('pasantia-leads-page-last'));
    expect(gets()).toHaveLength(2);
    answerFrom(pagingServer, gets()[1]);
    await flush();

    // Now the 300 ms pass, with the search still empty.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await flush();
    await drain();

    expect(calls.every((call) => call.answered)).toBe(true);
    expect(gets().map((call) => call.params.get('page'))).toEqual(['1', '3']);
    expect(rowShown(TRES)).toBe(true);
    expect(rowShown(UNO)).toBe(false);
    expect(rangeText()).toBe('Mostrando 101–120 de 120 contactos · Página 3 de 3');
  });

  it('typing a search still returns to page 1, once, after the debounce', async () => {
    await renderLoaded(pagingServer);
    fireEvent.click(screen.getByTestId('pasantia-leads-page-next'));
    answerFrom(pagingServer, gets()[1]);
    await flush();
    expect(rangeText()).toBe('Mostrando 51–100 de 120 contactos · Página 2 de 3');

    fireEvent.change(screen.getByTestId('pasantia-leads-search'), { target: { value: '  Dos ' } });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    // A keystroke is not a request.
    expect(gets()).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(gets()).toHaveLength(3);
    const searched = gets()[2];
    expect(searched.params.get('search')).toBe('Dos');
    expect(searched.params.get('page')).toBe('1');
    answerFrom(pagingServer, searched);
    await flush();
    await drain();

    expect(calls.every((call) => call.answered)).toBe(true);
    expect(gets()).toHaveLength(3);
    expect(rangeText()).toBe('Mostrando 1–50 de 120 contactos · Página 1 de 3');
  });
});

// ---------------------------------------------------------------------------
// B004-R1-02 — the export's last page refused by the API.
// ---------------------------------------------------------------------------

const WATERMARK = '2026-10-15T12:00:00.000001+00:00';

/** 1205 contacts in the API's order, in runs of seven equal timestamps. */
const EXPORT_ROWS = Array.from({ length: 1205 }, (_, index) => {
  const second = String(Math.floor(index / 7) % 60).padStart(2, '0');
  const minute = String(Math.floor(index / 420)).padStart(2, '0');
  const id = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
  return contact(id, `Lote${index}`, {
    created_at: `2026-10-01T12:${minute}:${second}.123456+00:00`,
  });
}).sort((a, b) =>
  a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1
);

function exportPage(call: Call) {
  const page = Number(call.params.get('page'));
  const pageSize = Number(call.params.get('pageSize'));
  return {
    leads: EXPORT_ROWS.slice((page - 1) * pageSize, page * pageSize),
    counts: COUNTS_A,
    pagination: { page, pageSize, total: EXPORT_ROWS.length, pageCount: Math.ceil(1205 / pageSize) },
    watermark: WATERMARK,
  };
}

describe('the export when the API refuses its last page (B004-R1-02)', () => {
  // jsdom has no `URL.createObjectURL`; the shared exporter needs one to download.
  const urlStatics = URL as unknown as { createObjectURL?: unknown };
  let originalCreateObjectURL: unknown;
  beforeEach(() => {
    originalCreateObjectURL = urlStatics.createObjectURL;
  });
  afterEach(() => {
    urlStatics.createObjectURL = originalCreateObjectURL;
  });

  it('downloads nothing, says so, and a retry exports all 1205', async () => {
    // A download is the shared exporter clicking an <a download>; count those.
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      if (this.hasAttribute('download')) downloads.push(this.getAttribute('download') ?? '');
    });
    const createObjectURL = vi.fn(() => 'blob:synthetic');
    urlStatics.createObjectURL = createObjectURL;
    const exportSpy = vi.spyOn(ReportExporter, 'exportToCSV');

    await renderLoaded(filterServer);
    const button = screen.getByTestId('pasantia-leads-export-csv');

    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    for (const page of [1, 2]) {
      const call = gets()[gets().length - 1];
      expect(call.params.get('page')).toBe(String(page));
      expect(call.params.get('pageSize')).toBe('500');
      call.answer(200, exportPage(call));
      await flush();
    }
    // The last page: the API saw a write inside its read (B004-R1-02) and refused.
    const last = gets()[gets().length - 1];
    expect(last.params.get('page')).toBe('3');
    last.answer(409, {
      error: 'Los leads cambiaron mientras se leían',
      code: 'LEADS_CHANGED_DURING_READ',
    });
    await flush();
    await drain();

    expect(exportSpy).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(downloads).toEqual([]);
    const alert = screen.getByTestId('pasantia-leads-export-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(
      'Los leads cambiaron mientras se leían. No se descargó ningún archivo.'
    );
    expect(toastError).toHaveBeenCalledWith(
      'Los leads cambiaron mientras se leían. No se descargó ningún archivo.'
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
    // The screen itself was not touched by the failed export.
    expect(rowShown(ALFA)).toBe(true);

    // Retry through the same button: the table is still now, so it completes.
    const before = gets().length;
    fireEvent.click(button);
    for (const page of [1, 2, 3]) {
      const call = gets()[gets().length - 1];
      expect(call.params.get('page')).toBe(String(page));
      call.answer(200, exportPage(call));
      await flush();
    }
    await drain();

    expect(gets().length - before).toBe(3);
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(exportSpy.mock.calls[0][0].data).toHaveLength(1205);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^pasantias-leads-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(toastSuccess).toHaveBeenCalledWith('CSV exportado: 1205 contactos');
    expect(screen.queryByTestId('pasantia-leads-export-error')).toBeNull();
    expect(button).not.toBeDisabled();
  });
});
