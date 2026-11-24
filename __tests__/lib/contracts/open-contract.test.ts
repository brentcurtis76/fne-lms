// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  downloadContractDocument,
  openContractDocumentInNewTab,
  CONTRACT_OPEN_FAILED,
  CONTRACT_POPUP_BLOCKED,
} from '../../../lib/contracts/open-contract';

// F26 (N146): a contract's document opens through /api/contracts/contract-link.
// The tab is reserved during the click (before the link request), then sent to
// the answered link; on failure it is closed. Invented ids and addresses.

const CONTRATO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SIGNED = 'https://example-project.supabase.co/storage/v1/object/sign/contracts/x.pdf?token=fresh';

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

describe('openContractDocumentInNewTab', () => {
  it('the texts', () => {
    expect(CONTRACT_OPEN_FAILED).toBe('No se pudo abrir el documento del contrato.');
    expect(CONTRACT_POPUP_BLOCKED).toBe(
      'El navegador bloqueó la ventana. Permite las ventanas emergentes para ver el documento.'
    );
  });

  it('reserves a blank tab synchronously, before the request starts', () => {
    const tab = makeTab();
    openMock.mockReturnValue(tab);
    void openContractDocumentInNewTab(CONTRATO, showError);
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(openMock).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
  });

  it('success: the reserved tab goes to the answered link; asks the route for this contract', async () => {
    const tab = makeTab();
    openMock.mockReturnValue(tab);
    await openContractDocumentInNewTab(CONTRATO, showError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/contract-link?contratoId=${CONTRATO}`);
    expect(fetchMock.mock.calls[0][1]).toEqual({ credentials: 'same-origin' });
    expect(tab.location.href).toBe(SIGNED);
    expect(tab.close).not.toHaveBeenCalled();
    expect(openMock).toHaveBeenCalledTimes(1);
    expect(showError).not.toHaveBeenCalled();
  });

  it('pop-ups blocked: the person is told, no request', async () => {
    openMock.mockReturnValue(null);
    await openContractDocumentInNewTab(CONTRATO, showError);
    expect(showError).toHaveBeenCalledWith(CONTRACT_POPUP_BLOCKED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a refused request', () => ({ ok: false, json: async () => ({ error: 'Contrato no encontrado' }) })],
    ['an answer with no url', () => ({ ok: true, json: async () => ({}) })],
    ['an answer that is not JSON', () => ({ ok: true, json: async () => { throw new Error('bad json'); } })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('%s: the reserved tab is closed and «No se pudo abrir el documento del contrato.» shows', async (_l, answer) => {
    const tab = makeTab();
    openMock.mockReturnValue(tab);
    fetchMock.mockImplementation(answer as any);
    await openContractDocumentInNewTab(CONTRATO, showError);
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('');
    expect(showError).toHaveBeenCalledWith(CONTRACT_OPEN_FAILED);
  });
});

// «Descargar documento original» asks for a download link and sends the
// CURRENT window to it; the store answers "save this file", so the page stays
// where it is and no new tab is opened.
describe('downloadContractDocument', () => {
  let assign: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
  });

  it('asks the route with download=1 and sends the current window to the answered link', async () => {
    const createSpy = vi.spyOn(document, 'createElement');
    await downloadContractDocument(CONTRATO, showError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/contracts/contract-link?contratoId=${CONTRATO}&download=1`);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(SIGNED);
    expect(openMock).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalledWith('a');
    expect(showError).not.toHaveBeenCalled();
  });

  it.each([
    ['a refused request', () => ({ ok: false, json: async () => ({ error: 'Contrato no encontrado' }) })],
    ['an answer with no url', () => ({ ok: true, json: async () => ({}) })],
    ['an answer that is not JSON', () => ({ ok: true, json: async () => { throw new Error('bad json'); } })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('%s: «No se pudo abrir el documento del contrato.» shows and the window goes nowhere', async (_l, answer) => {
    fetchMock.mockImplementation(answer as any);
    await downloadContractDocument(CONTRATO, showError);
    expect(assign).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(CONTRACT_OPEN_FAILED);
  });
});
