// F26 (N146): open a contract's document (a signed contract or an imported
// PDF) through /api/contracts/contract-link, as lib/contracts/open-invoice.ts
// opens an invoice. The tab is reserved DURING the click (before the request
// starts): a browser blocks a window.open that comes only after the request's
// wait. The reserved tab is then sent to the answered five-minute link, or
// closed when there is none. Call this straight from the click handler, before
// any other await.

export const CONTRACT_OPEN_FAILED = 'No se pudo abrir el documento del contrato.';
export const CONTRACT_POPUP_BLOCKED =
  'El navegador bloqueó la ventana. Permite las ventanas emergentes para ver el documento.';

async function requestContractLink(contratoId: string, download = false): Promise<string | null> {
  try {
    const query = 'contratoId=' + encodeURIComponent(contratoId) + (download ? '&download=1' : '');
    const response = await fetch('/api/contracts/contract-link?' + query, {
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body?.url === 'string' && body.url ? body.url : null;
  } catch (error) {
    console.error('Error requesting contract link:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

export async function openContractDocumentInNewTab(
  contratoId: string,
  showError: (message: string) => void
): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) {
    showError(CONTRACT_POPUP_BLOCKED);
    return;
  }
  tab.opener = null;
  const url = await requestContractLink(contratoId);
  if (!url) {
    tab.close();
    showError(CONTRACT_OPEN_FAILED);
    return;
  }
  tab.location.href = url;
}

// «Descargar documento original»: the route signs a link the store answers with
// "save this file", and the CURRENT window is sent to it: the browser saves the
// file and the page stays where it is. No new tab, so nothing for a pop-up
// blocker to stop after the request's wait.
export async function downloadContractDocument(
  contratoId: string,
  showError: (message: string) => void
): Promise<void> {
  const url = await requestContractLink(contratoId, true);
  if (!url) {
    showError(CONTRACT_OPEN_FAILED);
    return;
  }
  window.location.assign(url);
}
