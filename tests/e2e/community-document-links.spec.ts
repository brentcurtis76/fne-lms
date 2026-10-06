import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import pg from 'pg';
import { loginViaUi, E2E_USERS } from './helpers/auth';

const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const db = process.env.SUPABASE_DB_URL!;
if (![api, db].every(url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname))) throw new Error('Local synthetic stack only');
mkdirSync('.doclinks/screens', { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const run = Date.now();
async function rows(sql: string, params: unknown[]) {
  const client = new pg.Client({ connectionString: db });
  await client.connect();
  try { return (await client.query(sql, params)).rows; } finally { await client.end(); }
}

for (const role of ['gcLeader', 'consultorAssigned'] as const) {
  for (const format of ['png', 'pdf'] as const) {
    test(`${role}: upload, preview, exact download, version and reload (${format})`, async ({ browser }) => {
      let buffer = png;
      if (format === 'pdf') {
        const pdf = await PDFDocument.create();
        pdf.addPage([200, 200]).drawText('Synthetic document-link acceptance');
        buffer = Buffer.from(await pdf.save());
      }
      const title = `doclinks-${role}-${format}-${run}`;
      const filename = `${title}.${format}`;
      const context = await browser.newContext({ acceptDownloads: true });
      await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const page = await context.newPage();
      await loginViaUi(page, E2E_USERS[role]);
      await page.goto('/community/workspace?section=documents');
      await page.getByRole('button', { name: 'Subir Documento', exact: true }).click();
      await page.locator('input[type="file"]').last().setInputFiles({ name: filename, mimeType: format === 'png' ? 'image/png' : 'application/pdf', buffer });
      await page.getByRole('button', { name: /^Subir Documentos/ }).click();
      await expect(page.getByText(/documento\(s\) subido\(s\) exitosamente/)).toBeVisible();
      await page.reload();
      await page.getByRole('heading', { name: title, exact: true }).click();
      const preview = format === 'png' ? page.locator(`img[alt="${title}"]`) : page.locator(`iframe[title="${title}"]`);
      await expect(preview).toBeVisible();
      const url = (await preview.getAttribute('src'))!;
      expect(url).toContain(`${new URL(api).origin}/storage/v1/object/public/resources/documents/`);
      const served = await context.request.get(url.split('#')[0]);
      expect(served.status()).toBe(200);
      expect((await served.body()).equals(buffer)).toBe(true);
      if (format === 'png') await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      const downloadWait = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar', exact: true }).click();
      const download = await downloadWait;
      expect(readFileSync((await download.path())!).equals(buffer)).toBe(true);
      await page.screenshot({ path: `.doclinks/screens/${role}-${format}.png` });
      const [record] = await rows('SELECT id, storage_path FROM community_documents WHERE file_name=$1', [filename]);
      expect(record.storage_path).toMatch(/^documents\//);
      const versions = await rows('SELECT version_number, storage_path FROM document_versions WHERE document_id=$1', [record.id]);
      expect(versions).toEqual([{ version_number: 1, storage_path: record.storage_path }]);
      // Existing absolute-URL compatibility is checked separately after the real upload path succeeds.
      await rows('UPDATE community_documents SET storage_path=$1 WHERE id=$2', [url.split('#')[0], record.id]);
      await page.reload();
      await page.getByRole('heading', { name: title, exact: true }).click();
      await expect(preview).toHaveAttribute('src', format === 'png' ? url : `${url.split('#')[0]}#view=FitH`);
      const legacyDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar', exact: true }).click();
      expect(readFileSync((await (await legacyDownload).path())!).equals(buffer)).toBe(true);
      await rows('UPDATE community_documents SET storage_path=$1 WHERE id=$2', [record.storage_path, record.id]);
      await context.close();
    });
  }
}
