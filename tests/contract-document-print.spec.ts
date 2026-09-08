import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { generateAnnexFromTemplate } from '../lib/annex-template';
import { generateContractFromTemplate } from '../lib/contract-template';
import { CONTRACT_DOCUMENT_CSS } from '../lib/contract-document';

const parent = { numero_contrato: 'FNE-DEMO-2026', fecha_contrato: '2026-06-22', fecha_fin:'2027-06-22', cliente:{ nombre_legal:'Corporación Educacional de Ejemplo', nombre_fantasia:'Colegio de Ejemplo', nombre_representante:'Representante de Ejemplo', rut:'99.999.999-9', direccion:'Calle de Ejemplo 123', comuna:'Santiago', ciudad:'Santiago' }, programa:{ nombre:'Asesoría Integral para Desarrollar una Cultura de Innovación Educativa Centrada en el Aprendizaje' } };
const data = { ...parent, parentContract:parent, anexo_numero:1, anexo_fecha:'2026-09-08', numero_participantes:2, nombre_ciclo:'Primer Ciclo', tipo_moneda:'CLP', precio_total_uf:4969000, cuotas:[{numero_cuota:1,monto_clp:4969000,fecha_vencimiento:'2026-09-09'}] };

for (const kind of ['annex', 'contract', 'long-annex'] as const) {
  test(`${kind} prints with Mont, payment rows and intact signatures`, async ({ page }, testInfo) => {
    // Only synthetic HTML and local assets; no application, database or external requests.
    await page.route('**/*', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (!/^\/(fonts\/Mont-(Book|Bold|Heavy|SemiBold)\.otf|logos\/contract-horizontal-gold\.png)$/.test(pathname)) return route.abort();
      return route.fulfill({ body:await readFile(path.join(process.cwd(),'public',pathname)),contentType:pathname.endsWith('.png')?'image/png':'font/otf' });
    });
    const html = kind === 'contract' ? generateContractFromTemplate(data) : generateAnnexFromTemplate(kind === 'annex' ? data : { ...data, cuotas:Array.from({length:30},(_,i)=>({numero_cuota:i+1,monto_clp:100000,fecha_vencimiento:'2026-09-09'})) });
    await page.setContent(`<!doctype html><html lang="es-CL"><head><base href="http://127.0.0.1/"><style>${CONTRACT_DOCUMENT_CSS}</style></head><body>${html}</body></html>`);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(img=>img.decode())); });
    await expect(page.locator('tbody tr')).toHaveCount(kind === 'long-annex' ? 30 : 1);
    await expect(page.locator('.doc-signature')).toHaveCount(2);
    await expect(page.locator('h2')).toHaveCount(kind === 'contract' ? 16 : 4);
    await page.emulateMedia({media:'print'});
    const metrics = await page.locator('.fne-document').evaluate(element => ({height:element.getBoundingClientRect().height, scroll:element.scrollHeight, font:document.fonts.check('9.5pt Mont')}));
    expect(metrics.font).toBe(true);
    if (kind === 'annex') expect(metrics.height).toBeLessThanOrEqual(960); // Letter minus 1in vertical margins.
    const pdf = await page.pdf({path:testInfo.outputPath(`${kind}.pdf`),preferCSSPageSize:true,printBackground:true});
    expect(pdf.byteLength).toBeGreaterThan(10000);
    await page.screenshot({path:testInfo.outputPath(`${kind}.png`),fullPage:true});
  });
}

test('form preview opens a printable document and waits for local assets', async ({ page }) => {
  const ts = await import('typescript');
  const { createServer } = await import('node:http');
  const source = await readFile(path.join(process.cwd(),'lib/contract-document.ts'),'utf8');
  const module = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText;
  const server = createServer(async (request,response) => {
    const pathname = request.url || '/';
    if (pathname === '/contract-document.js') { response.setHeader('Content-Type','text/javascript'); response.end(module); return; }
    if (/^\/(fonts\/Mont-(Book|Bold|Heavy|SemiBold)\.otf|logos\/contract-horizontal-gold\.png)$/.test(pathname)) { response.end(await readFile(path.join(process.cwd(),'public',pathname))); return; }
    if (pathname === '/') { response.setHeader('Content-Type','text/html; charset=utf-8'); response.end(`<button id="preview">Vista previa / PDF</button><script type="module">import {openDocumentPreview,renderDocumentPreview} from '/contract-document.js';document.querySelector('#preview').onclick=()=>renderDocumentPreview(openDocumentPreview(),${JSON.stringify(generateAnnexFromTemplate(data))},'Anexo de ejemplo');</script>`); return; }
    response.statusCode=404;response.end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address = server.address() as {port:number};
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button',{name:'Vista previa / PDF'}).click();
    const popup = await popupPromise;
    await expect(popup.getByRole('button',{name:'Imprimir / Guardar PDF'})).toBeEnabled();
    await expect(popup.locator('.doc-signature')).toHaveCount(2);
    expect(await popup.evaluate(()=>window.opener)).toBeNull();
    await popup.close();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
