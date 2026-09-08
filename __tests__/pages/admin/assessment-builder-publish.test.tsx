// @vitest-environment jsdom
/**
 * pages/admin/assessment-builder/[templateId]/index.tsx — publish flow
 *
 * PROC-CONTAIN-01 (A-01): the inline publish confirmation must never offer or
 * send `upgradeExisting: true`. Renders the real page with its data sources
 * mocked and asserts the exact body the UI posts to the publish endpoint.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildChainableQuery } from '../../api/assessment-builder/_helpers';

const TEMPLATE_ID = 'ab000002-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockRouterPush, mockToastError, mockToastSuccess, supabaseHolder, routerMock } = vi.hoisted(() => {
  const mockRouterPush = vi.fn();
  return {
    mockRouterPush,
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
    supabaseHolder: { current: null as any },
    // One stable object, like Next's real router: the page memoizes fetchTemplate on it.
    routerMock: {
      push: mockRouterPush,
      replace: vi.fn(),
      pathname: '/admin/assessment-builder/[templateId]',
      query: { templateId: 'ab000002-0000-0000-0000-000000000001' },
      isReady: true,
    },
  };
});

vi.mock('next/router', () => ({
  useRouter: () => routerMock,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => supabaseHolder.current,
}));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: mockToastError, success: mockToastSuccess });
  return { toast, default: toast };
});

vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="main-layout">{children}</div>,
}));

vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}));

// Import the page AFTER mocks are registered.
import TemplateEditor from '../../../pages/admin/assessment-builder/[templateId]/index';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const template = {
  id: TEMPLATE_ID,
  name: 'CRE Tercero Básico',
  description: '',
  area: 'evaluacion',
  status: 'draft',
  version: '1.0.0',
  is_archived: false,
  grade_id: 7,
  scoring_config: {
    level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 },
    default_weights: { objective: 1, module: 1, indicator: 1 },
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const objective = { id: 'obj-1', template_id: TEMPLATE_ID, name: 'Objetivo A', description: '', display_order: 1, weight: 1 };
const module = {
  id: 'mod-1',
  template_id: TEMPLATE_ID,
  objective_id: 'obj-1',
  name: 'Módulo A',
  description: '',
  instructions: '',
  display_order: 1,
  weight: 1,
  indicators: [
    { id: 'ind-1', moduleId: 'mod-1', code: 'C1', name: 'Cobertura', description: '', category: 'cobertura', weight: 1, displayOrder: 1 },
  ],
};

type FetchCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body } as unknown as Response;
}

function installFetch(log: FetchCall[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    log.push({ url, init });
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.endsWith(`/templates/${TEMPLATE_ID}`) && method === 'GET') return jsonResponse({ template });
    if (url.endsWith('/objectives') && method === 'GET') return jsonResponse({ objectives: [objective] });
    if (url.endsWith('/modules') && method === 'GET') return jsonResponse({ modules: [module] });
    if (url.endsWith('/publish') && method === 'POST') {
      return jsonResponse({
        success: true,
        message: 'Template publicado como versión 1.1.0',
        template: { id: TEMPLATE_ID, name: template.name, area: 'evaluacion', status: 'published', version: '1.1.0' },
        snapshot: { id: 'snap-1', version: '1.1.0', createdAt: '2026-01-02T00:00:00Z' },
      });
    }
    return jsonResponse({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function installSupabase() {
  supabaseHolder.current = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'admin-1', email: 'admin@example.test' } } },
      }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return buildChainableQuery([{ role_type: 'admin' }]);
      if (table === 'profiles') return buildChainableQuery({ avatar_url: null });
      return buildChainableQuery(null, null);
    }),
  };
}

const UPGRADE_PROMPT = /¿Crear evaluaciones para docentes existentes\?/;

describe('Template editor — publish confirmation (PROC-CONTAIN-01 A-01)', () => {
  let fetchLog: FetchCall[];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchLog = [];
    installFetch(fetchLog);
    installSupabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('publishes with a single confirmation and never sends upgradeExisting', async () => {
    render(<TemplateEditor />);

    const publishBtn = await screen.findByTestId('publish-btn');
    expect(publishBtn).not.toBeDisabled();
    fireEvent.click(publishBtn);

    const confirmBtn = await screen.findByTestId('publish-confirm-btn');
    expect(screen.getByText('¿Publicar este template?')).toBeInTheDocument();
    // The removed second step must not exist at any point
    expect(screen.queryByText(UPGRADE_PROMPT)).toBeNull();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchLog.some(c => c.url.endsWith('/publish') && c.init?.method === 'POST')).toBe(true);
    });

    const publishCalls = fetchLog.filter(c => c.url.endsWith('/publish') && c.init?.method === 'POST');
    expect(publishCalls).toHaveLength(1);
    const body = JSON.parse(String(publishCalls[0].init?.body ?? '{}'));
    expect(body).toEqual({});
    expect('upgradeExisting' in body).toBe(false);

    expect(screen.queryByText(UPGRADE_PROMPT)).toBeNull();
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Template publicado como versión 1.1.0'));
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('cancelling the confirmation sends no publish request', async () => {
    render(<TemplateEditor />);

    fireEvent.click(await screen.findByTestId('publish-btn'));
    fireEvent.click(await screen.findByTestId('publish-cancel-btn'));

    await waitFor(() => expect(screen.queryByText('¿Publicar este template?')).toBeNull());
    expect(fetchLog.some(c => c.url.endsWith('/publish'))).toBe(false);
    expect(screen.queryByText(UPGRADE_PROMPT)).toBeNull();
  });
});
