import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import pg from 'pg';
import { prepareFneStorageFixture } from './helpers/fne-storage-fixture';
import { loginViaUi, E2E_USERS } from './helpers/auth';

const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = process.env.SUPABASE_DB_URL!;
if (![api, db].every(url => ['localhost', '127.0.0.1'].includes(new URL(url).hostname))) throw new Error('Local synthetic stack only');
mkdirSync('.doclinks/screens', { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const run = Date.now();
test.beforeAll(() => prepareFneStorageFixture());
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
      // F12d: a new document is in the private store, shown through a link the application signed
      expect(url).toContain(`${new URL(api).origin}/storage/v1/object/sign/community-documents/documents/`);
      const served = await context.request.get(url.split('#')[0]);
      expect(served.status()).toBe(200);
      expect((await served.body()).equals(buffer)).toBe(true);
      if (format === 'png') await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      const downloadWait = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar', exact: true }).click();
      const download = await downloadWait;
      expect(readFileSync((await download.path())!).equals(buffer)).toBe(true);
      await page.screenshot({ path: `.doclinks/screens/${role}-${format}.png` });
      const [record] = await rows('SELECT id, storage_path, storage_bucket FROM community_documents WHERE file_name=$1', [filename]);
      expect(record.storage_path).toMatch(/^documents\//);
      expect(record.storage_bucket).toBe('community-documents');
      const versions = await rows('SELECT version_number, storage_path, storage_bucket FROM document_versions WHERE document_id=$1', [record.id]);
      expect(versions).toEqual([{ version_number: 1, storage_path: record.storage_path, storage_bucket: 'community-documents' }]);
      // A visitor cannot open the new document by any address: not the store's
      // public or authenticated address, not the link route.
      const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      for (const mode of ['public', 'authenticated']) {
        const answer = await visitor.request.get(`${api}/storage/v1/object/${mode}/community-documents/${record.storage_path}`);
        expect(answer.status()).not.toBe(200);
      }
      expect((await visitor.request.get(`/api/community/documents/${record.id}/link`)).status()).toBe(401);
      await visitor.close();
      // An OLD document (its file in the public store `resources`, a full public
      // address in storage_path, no storage_bucket) still opens through the
      // application, and its old public address still opens (until the owner
      // approves moving the old files).
      const oldAddress = `${api}/storage/v1/object/public/resources/${record.storage_path}`;
      const stored = await context.request.post(`${api}/storage/v1/object/resources/${record.storage_path}`, {
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': format === 'png' ? 'image/png' : 'application/pdf', 'x-upsert': 'true' },
        data: buffer,
      });
      expect(stored.ok()).toBe(true);
      await rows('UPDATE community_documents SET storage_path=$1, storage_bucket=NULL WHERE id=$2', [oldAddress, record.id]);
      await page.reload();
      await page.getByRole('heading', { name: title, exact: true }).click();
      await expect(preview).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/resources\/documents\//);
      const legacyUrl = (await preview.getAttribute('src'))!;
      const legacyServed = await context.request.get(legacyUrl.split('#')[0]);
      expect(legacyServed.status()).toBe(200);
      expect((await legacyServed.body()).equals(buffer)).toBe(true);
      const anonymousOld = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      expect((await anonymousOld.request.get(oldAddress)).status()).toBe(200);
      await anonymousOld.close();
      const legacyDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar', exact: true }).click();
      expect(readFileSync((await (await legacyDownload).path())!).equals(buffer)).toBe(true);
      await rows('UPDATE community_documents SET storage_path=$1, storage_bucket=$2 WHERE id=$3', [record.storage_path, 'community-documents', record.id]);
      await context.close();
    });
  }
}
