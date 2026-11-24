// @vitest-environment node
/**
 * L1 and L8 on GENERA's side: GENERA's real brand file against an invented brand, and the brand file's
 * own rules (a logo that exists, no invented postal address, no reply mailbox yet).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderEmail, sampleContent, validateBrand, type Brand } from '../../lib/correos';
import { GENERA_LOGO_PATH, GENERA_SAMPLE_PICTURE_PATH, generaBrand, generaSamplePictureUrl } from '../../lib/correos-host/brand';

const BASE = 'https://genera.example.test';

const AURORA: Brand = {
  name: 'Colegio Aurora',
  logo: { url: 'https://aurora.example.test/marca/logo-aurora.png', description: 'Logo del Colegio Aurora', width: 160, height: 48 },
  accentColor: '#1a7f5a',
  onAccentColor: '#fffaf0',
  fontStack: 'Georgia, "Times New Roman", serif',
  footerLines: ['Corporación Educacional Aurora'],
  sender: { name: 'Boletín Aurora', address: 'boletin@aurora.example.test' },
  language: 'es',
};

function leakValues(brand: Brand): string[] {
  return [brand.name, brand.sender.name, brand.sender.address, brand.footerLines[0], brand.logo.url, brand.accentColor, brand.onAccentColor];
}

describe("GENERA's brand file", () => {
  const genera = generaBrand(BASE);

  it('is a valid brand with the logo and sample picture that exist under public/', () => {
    expect(validateBrand(genera)).toEqual([]);
    expect(genera.logo.url).toBe(`${BASE}${GENERA_LOGO_PATH}`);
    expect(fs.existsSync(path.join(process.cwd(), 'public', GENERA_LOGO_PATH))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'public', GENERA_SAMPLE_PICTURE_PATH))).toBe(true);
    expect(generaSamplePictureUrl(`${BASE}/`)).toBe(`${BASE}${GENERA_SAMPLE_PICTURE_PATH}`);
  });

  it('carries the agreed sender, language, colours and a footer marked as not final', () => {
    expect(genera.sender).toEqual({ name: 'Fundación Nueva Educación', address: 'novedades@boletin.nuevaeducacion.org' });
    expect(genera.language).toBe('es');
    expect(genera.accentColor).toBe('#fbbf24');
    expect(genera.footerLines[0]).toBe('Fundación Nueva Educación');
    expect(genera.footerLines[1]).toMatch(/provisional/i);
    expect(genera.replyTo).toBeUndefined();
  });

  it('L1: GENERA and an invented brand never leak into each other', async () => {
    const content = sampleContent({ baseUrl: BASE, pictureUrl: generaSamplePictureUrl(BASE) });
    const a = await renderEmail(genera, content);
    const b = await renderEmail(AURORA, content);
    expect(a.html).not.toEqual(b.html);
    for (const value of leakValues(AURORA)) expect(a.html.toLowerCase()).not.toContain(value.toLowerCase());
    for (const value of leakValues(genera)) expect(b.html.toLowerCase()).not.toContain(value.toLowerCase());
    expect(a.html).not.toMatch(/\d\s*rem\b/i);
  });
});
