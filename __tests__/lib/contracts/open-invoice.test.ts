// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openInvoiceInNewTab,
  INVOICE_OPEN_FAILED,
  INVOICE_POPUP_BLOCKED,
} from '../../../lib/contracts/open-invoice';

// GES-1.4 (F2c, send-back 1): the tab is reserved during the click (before the
// link request), then sent to the answered link; on failure it is closed.
// Invented ids and addresses.

const CUOTA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SIGNED = 'https://example-project.supabase.co/storage/v1/object/sign/facturas/x.pdf?token=fresh';

const makeTab = () => ({ opener: {} as unknown, location: { href: '' }, close: vi.fn() });
let fetchMock: ReturnType<typeof vi.fn>;
let openMock: ReturnType<typeof vi.fn>;
let showError: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ url: SIGNED, expiresIn: 300 }) }));
  vi.stubGlobal('fetch', fetchMock);
  openMock = vi.fn();
  window.open = openMock as any;
  showError = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('openInvoiceInNewTab', () => {
  it('the texts', () => {
    expect(INVOICE_OPEN_FAILED).toBe('No se pudo abrir la factura');
    expect(INVOICE_POPUP_BLOCKED).toBe(
      'El navegador bloqueó la ventana. Permite las ventanas emergentes para ver la factura.'
    );
  });

  it('reserves a blank tab synchronously, before the request starts', () => {
    const tab = makeTab();
    openMock.mockReturnValue(tab);
    void openInvoiceInNewTab(CUOTA, showError);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
  });

  it('success: the reserved tab goes to the answered link; asks the route for this instalment', async () => {
    const tab = makeTab();
    openMock.mockReturnValue(tab);
    await openInvoiceInNewTab(CUOTA, showError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/invoice-link?cuotaId=${CUOTA}`);
    expect(tab.location.href).toBe(SIGNED);
    expect(tab.close).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(showError).not.toHaveBeenCalled();
  });

  it('pop-ups blocked: the person is told, no request', async () => {
    openMock.mockReturnValue(null);
    await openInvoiceInNewTab(CUOTA, showError);
    expect(showError).toHaveBeenCalledWith(INVOICE_POPUP_BLOCKED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a refused request', () => ({ ok: false, json: async () => ({ error: 'Factura no encontrada' }) })],
    ['an answer with no url', () => ({ ok: true, json: async () => ({}) })],
    ['an answer that is not JSON', () => ({ ok: true, json: async () => { throw new Error('bad json'); } })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('%s: the reserved tab is closed and «No se pudo abrir la factura» shows', async (_l, answer) => {
    const tab = makeTab();
    openMock.mockReturnValue(tab);
    fetchMock.mockImplementation(answer as any);
    await openInvoiceInNewTab(CUOTA, showError);
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('');
    expect(showError).toHaveBeenCalledWith(INVOICE_OPEN_FAILED);
  });
});
