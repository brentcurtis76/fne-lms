// GES-1.4 (F2c, send-back 1): open an instalment's invoice in a new tab
// through /api/contracts/invoice-link. The tab is reserved DURING the click
// (before the request starts): a browser blocks a window.open that comes only
// after the request's wait. The reserved tab is then sent to the answered
// five-minute link, or closed when there is none. Call this straight from the
// click handler, before any other await.

export const INVOICE_OPEN_FAILED = 'No se pudo abrir la factura';
export const INVOICE_POPUP_BLOCKED =
  'El navegador bloqueó la ventana. Permite las ventanas emergentes para ver la factura.';

async function requestInvoiceLink(cuotaId: string): Promise<string | null> {
  try {
    const response = await fetch('/api/contracts/invoice-link?cuotaId=' + encodeURIComponent(cuotaId), {
      credentials: 'same-origin',
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body?.url === 'string' && body.url ? body.url : null;
  } catch (error) {
    console.error('Error requesting invoice link:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

export async function openInvoiceInNewTab(
  cuotaId: string,
  showError: (message: string) => void
): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) {
    showError(INVOICE_POPUP_BLOCKED);
    return;
  }
  tab.opener = null;
  const url = await requestInvoiceLink(cuotaId);
  if (!url) {
    tab.close();
    showError(INVOICE_OPEN_FAILED);
    return;
  }
  tab.location.href = url;
}
