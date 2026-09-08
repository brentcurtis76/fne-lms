// Shared presentation for contract previews and browser PDF printing.
export const CONTRACT_DOCUMENT_CSS = `
@font-face{font-family:Mont;src:url('/fonts/Mont-Book.otf') format('opentype');font-weight:400}
@font-face{font-family:Mont;src:url('/fonts/Mont-Bold.otf') format('opentype');font-weight:700}
@font-face{font-family:Mont;src:url('/fonts/Mont-Heavy.otf') format('opentype');font-weight:800}
@font-face{font-family:Mont;src:url('/fonts/Mont-SemiBold.otf') format('opentype');font-weight:600}
body{margin:0;background:#F3F4F6;color:#1F1F1F;font-family:Mont,Arial,sans-serif}
.fne-document{box-sizing:border-box;width:8.5in;min-height:11in;margin:24px auto;padding:.55in .7in .45in;background:white;font:400 9.5pt/1.4 Mont,Arial,sans-serif;color:#1F1F1F}
.fne-document *{box-sizing:border-box}
.fne-document header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.fne-document header img{width:150px;height:auto;display:block}
.fne-document .doc-meta{text-align:right;font-size:8pt;line-height:1.5;color:#6B7280}
.fne-document .doc-meta strong{display:block;color:#0A0A0A;letter-spacing:.08em}
.fne-document h1{margin:20px 0 0;font-size:19pt;font-weight:800;line-height:1.15;letter-spacing:-.01em;color:#0A0A0A}
.fne-document .title-rule{width:56px;height:4px;background:#FBBF24;margin:10px 0}
.fne-document p{margin:0 0 10px;orphans:3;widows:3}
.fne-document .doc-parties{margin-bottom:14px}
.fne-document h2{font-size:10.5pt;line-height:1.3;color:#0A0A0A;margin:14px 0 4px;font-weight:700;break-after:avoid}
.fne-document .annex-clause{position:relative;padding-left:42px}
.fne-document .clause-index{position:absolute;left:0;top:0;font-weight:800;font-size:12pt}
.fne-document .annex-clause h2{margin-top:11px}
.fne-document table{width:100%;border-collapse:collapse;margin:8px 0;font-size:9.5pt}
.fne-document thead{display:table-header-group}
.fne-document th{text-align:left;padding:6px 8px;font-size:8pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6B7280;border-bottom:1px solid #0A0A0A}
.fne-document td{padding:8px;border-bottom:1px solid #E5E7EB}
.fne-document tr{break-inside:avoid}
.fne-document th:last-child,.fne-document td:last-child{text-align:right}
.fne-document td:nth-child(2){font-weight:700;color:#0A0A0A}
.fne-document .doc-closing{break-inside:avoid}
.fne-document .doc-signatures{display:flex;gap:40px;margin-top:18px;break-inside:avoid}
.fne-document .doc-signature{flex:1;min-width:0;padding-top:44px}
.fne-document .signature-name{border-top:1px solid #0A0A0A;padding-top:8px;font-size:10pt;font-weight:700;color:#0A0A0A}
.fne-document .signature-entity{font-size:9pt;color:#6B7280}
.fne-document footer{margin-top:18px;padding-top:8px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;gap:12px;font-size:7pt;color:#6B7280;break-inside:avoid}
.print-controls{padding:16px 24px;background:#0A0A0A;color:white;display:flex;align-items:center;justify-content:space-between;gap:16px}
.print-guidance{max-width:816px;margin:16px auto;padding:0 16px;font:400 13px/1.5 Mont,Arial,sans-serif;color:#374151}
.print-controls h2{font-size:16px;margin:0}.print-controls-buttons{display:flex;gap:12px}
.print-controls button{font:600 14px Mont,Arial,sans-serif;border:0;padding:10px 16px;border-radius:6px;cursor:pointer;background:#FBBF24;color:#0A0A0A;display:flex;align-items:center;gap:8px}
@media screen and (max-width:816px){.page-container{overflow-x:auto}.fne-document{margin:0}.print-controls{flex-wrap:wrap}}
@media print{
 @page{size:letter;margin:.55in .7in .45in}
 html,body{background:white;margin:0;padding:0;height:auto}
 .print-controls,.print-guidance{display:none!important}
 .page-container{margin:0;padding:0;overflow:visible}
 .fne-document{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
 .fne-document *{-webkit-print-color-adjust:exact;print-color-adjust:exact}

}
`;

export const CONTRACT_PRINT_GUIDANCE = 'Para guardar el PDF, selecciona tamaño Carta y escala 100 %. Desactiva los encabezados y pies de página del navegador y activa la impresión de fondos.';

export function escapeDocumentText(value: unknown): string {
 return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
}

export function documentHeader(title: string, number: string, date: string, client: string, annex = ''): string {
 return `<header><img src="/logos/contract-horizontal-gold.png" alt="Fundación Nueva Educación"><div class="doc-meta"><strong>Contrato ${number}</strong>${annex ? `<div>Anexo N.º ${annex}</div>` : ''}<div>Santiago de Chile, ${date}</div></div></header><h1>${title}</h1><div class="title-rule"></div><p class="doc-parties">Entre <strong>Fundación Instituto Relacional (Nueva Educación)</strong> y <strong>${client}</strong></p>`;
}
export function documentSignatures(representative: string, client: string): string {
 return `<div class="doc-signatures"><div class="doc-signature"><div class="signature-name">${representative}</div><div class="signature-entity">p.p. ${client}</div></div><div class="doc-signature"><div class="signature-name">ARNOLDO CISTERNAS CHÁVEZ</div><div class="signature-entity">p.p Representante Legal FUNDACIÓN NUEVA EDUCACIÓN</div></div></div>`;
}
export const DOCUMENT_FOOTER = `<footer><span>Fundación Nueva Educación · Agencia Técnica Educativa certificada por Mineduc</span><span>www.nuevaeducacion.org</span></footer>`;

/** Open synchronously from a click so the browser permits the preview. */
export function openDocumentPreview(): Window {
 const preview = window.open('', '_blank');
 if (!preview) throw new Error('Permita ventanas emergentes para abrir la vista previa');
 preview.opener = null;
 return preview;
}
export async function renderDocumentPreview(preview: Window, html: string, title: string): Promise<void> {
 preview.document.open();
 preview.document.write(`<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><base href="${escapeDocumentText(window.location.origin)}/"><title>${escapeDocumentText(title)}</title><style>${CONTRACT_DOCUMENT_CSS}</style></head><body><div class="print-controls"><h2>Vista previa</h2><button id="print-document" data-testid="print-document" disabled>Preparando documento…</button></div><p class="print-guidance">${CONTRACT_PRINT_GUIDANCE}</p><main class="page-container">${html}</main></body></html>`);
 preview.document.close();
 await preview.document.fonts.ready;
 await Promise.all(Array.from(preview.document.images).map(img => img.decode()));
 const button = preview.document.getElementById('print-document') as HTMLButtonElement;
 button.disabled = false;
 button.textContent = 'Imprimir / Guardar PDF';
 button.onclick = () => preview.print();
}
