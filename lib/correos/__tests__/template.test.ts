// @vitest-environment node
// L1-L4 of the release-1 scenarios, for the kit alone (invented brands, no network).
import { describe, expect, it } from 'vitest';
import { renderEmail, validateBrand } from '../template';
import type { Brand, EmailContent } from '../types';
import { AURORA, BOREAL, SAMPLE } from './fixtures';

function leakValues(brand: Brand): string[] {
  return [
    brand.name,
    brand.sender.name,
    brand.sender.address,
    brand.footerLines[0],
    brand.logo.url,
    brand.accentColor,
    brand.onAccentColor,
    brand.textColor,
    brand.mutedTextColor,
    brand.pageBackgroundColor,
    brand.sheetBackgroundColor,
    brand.ruleColor,
  ];
}

/** Tags that carry an event-handler attribute (onerror=, onclick=, ...). */
const HANDLER_ATTRIBUTE = /<[a-z][^>]*\son[a-z]+\s*=/i;

describe('L1: two brands never leak into each other', () => {
  it('renders different HTML, and neither result holds the other brand, in any letter case', async () => {
    const a = await renderEmail(AURORA, SAMPLE);
    const b = await renderEmail(BOREAL, SAMPLE);
    expect(a.html).not.toEqual(b.html);
    for (const value of leakValues(BOREAL)) {
      expect(a.html.toLowerCase()).not.toContain(value.toLowerCase());
      expect(a.text.toLowerCase()).not.toContain(value.toLowerCase());
    }
    for (const value of leakValues(AURORA)) {
      expect(b.html.toLowerCase()).not.toContain(value.toLowerCase());
      expect(b.text.toLowerCase()).not.toContain(value.toLowerCase());
    }
    // Each holds its own look.
    expect(a.html).toContain(AURORA.logo.url);
    expect(a.html).toContain(AURORA.accentColor);
    expect(a.html).toContain(AURORA.footerLines[0]);
    expect(b.html).toContain(BOREAL.logo.url);
    expect(b.html).toContain(BOREAL.accentColor);
  });
});

describe('L2: inline styles, no rem, nothing external', () => {
  it('has no rem unit, no stylesheet link, no script and no web font', async () => {
    for (const brand of [AURORA, BOREAL]) {
      const { html } = await renderEmail(brand, SAMPLE);
      expect(html).not.toMatch(/\d\s*rem\b/i);
      expect(html).not.toMatch(/<link\b/i);
      expect(html).not.toMatch(/<script\b/i);
      expect(html).not.toMatch(/@font-face|@import|fonts\.googleapis/i);
    }
  });

  it('carries the look on the elements themselves, not in a <style> rule', async () => {
    const { html } = await renderEmail(AURORA, SAMPLE);
    // Whatever <style> blocks a library might add, the look survives without them.
    const withoutStyleBlocks = html.replace(/<style[\s\S]*?<\/style>/gi, '');
    expect(withoutStyleBlocks).toMatch(new RegExp(`<a[^>]*href="https://example.test/boton"[^>]*style="[^"]*background-color:${AURORA.accentColor}`));
    expect(withoutStyleBlocks).toMatch(new RegExp(`<a[^>]*href="https://example.test/boton"[^>]*style="[^"]*color:${AURORA.onAccentColor}`));
    expect(withoutStyleBlocks).toMatch(/<a[^>]*href="https:\/\/example.test\/boton"[^>]*style="[^"]*padding/);
    const style = (tag: RegExp) => (withoutStyleBlocks.match(tag)?.[1] ?? '').split(';');
    expect(style(/<h2[^>]*style="([^"]*)"/)).toEqual(expect.arrayContaining(['font-size:20px', `color:${AURORA.textColor}`]));
    expect(style(/<h2[^>]*style="([^"]*)"/).join(';')).toContain('font-family:Georgia');
    expect(style(/<p[^>]*style="([^"]*)"/)).toEqual(expect.arrayContaining(['font-size:16px', 'line-height:24px']));
    expect(style(/<p[^>]*style="([^"]*)"/).join(';')).toContain('font-family:Georgia');
    expect(style(/<li[^>]*style="([^"]*)"/).join(';')).toContain('font-family:Georgia');
    expect(withoutStyleBlocks).toMatch(/<td[^>]*style="[^"]*font-family:Georgia/);
    expect(withoutStyleBlocks).toMatch(/<table[^>]*style="[^"]*max-width:600px/);
    // The picture: alt, fixed maximum width, height:auto.
    expect(withoutStyleBlocks).toMatch(/<img[^>]*alt="Una foto inventada"[^>]*style="[^"]*max-width:552px[^"]*height:auto/);
    // Outlook's padding hint on the button.
    expect(html).toMatch(/mso-/);
    // The preview line is present but hidden.
    expect(html).toMatch(/<div[^>]*style="display:none[^"]*"[^>]*>Una línea de vista previa inventada\./);
    expect(html).toMatch(/<html[^>]*lang="es"/);
  });
});

describe('L3: three kinds of block, any number and order, nothing executable', () => {
  const ordered: EmailContent = {
    subject: 'Orden',
    previewLine: '',
    blocks: [
      { kind: 'button', label: 'Primer botón', link: 'https://example.test/uno' },
      { kind: 'text', title: 'Primer texto', body: 'Uno con **negrita**, un [enlace](https://example.test/a) y\n- viñeta uno\n- viñeta dos' },
      { kind: 'picture', url: 'https://example.test/foto.png', description: 'Descripción de la foto', link: 'https://example.test/foto' },
      { kind: 'text', body: 'Segundo texto, sin título.' },
      { kind: 'button', label: 'Segundo botón', link: 'mailto:alguien@example.test' },
    ],
  };

  it('keeps the order button, text, picture, text, button', async () => {
    const { html, text } = await renderEmail(AURORA, ordered);
    const kinds = [...html.matchAll(/data-block="(text|picture|button)"/g)].map((m) => m[1]);
    expect(kinds).toEqual(['button', 'text', 'picture', 'text', 'button']);
    const marks = ['Primer botón', 'Primer texto', 'Descripción de la foto', 'Segundo texto', 'Segundo botón'];
    const positions = marks.map((mark) => html.indexOf(mark));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    const textPositions = marks.map((mark) => text.indexOf(mark));
    expect([...textPositions].sort((x, y) => x - y)).toEqual(textPositions);
  });

  it('draws title, bold, link, bullets, alt, button label and link', async () => {
    const { html, text } = await renderEmail(AURORA, ordered);
    expect(html).toMatch(/<h2[^>]*>Primer texto<\/h2>/);
    expect(html).toMatch(/<strong[^>]*>negrita<\/strong>/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/example.test\/a"[^>]*>enlace<\/a>/);
    expect(html).toMatch(/<ul[^>]*><li[^>]*>viñeta uno<\/li><li[^>]*>viñeta dos<\/li><\/ul>/);
    expect(html).toMatch(/<img[^>]*alt="Descripción de la foto"/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/example.test\/foto"[^>]*><img/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/example.test\/uno"[^>]*>[\s\S]*Primer botón/);
    expect(html).toMatch(/href="mailto:alguien@example.test"/);
    expect(text).toContain('enlace (https://example.test/a)');
    expect(text).toContain('- viñeta uno');
    expect(text).toContain('Primer botón: https://example.test/uno');
  });

  it('turns typed HTML and dangerous links into harmless text', async () => {
    const hostile: EmailContent = {
      subject: 'Hostil <script>alert(1)</script>',
      previewLine: '<img src=x onerror=alert(1)>',
      blocks: [
        {
          kind: 'text',
          title: '<b onclick="alert(1)">Título</b>',
          body: [
            '<script>alert("x")</script>',
            '<img src="x" onerror="alert(2)">',
            '[pulsa](javascript:alert(3)) y [datos](data:text/html;base64,PHNjcmlwdD4=)',
            '<a href="javascript:alert(4)">enlace crudo</a>',
            '[raro](JaVaScRiPt:alert(5))',
          ].join('\n'),
        },
        { kind: 'picture', url: 'javascript:alert(6)', description: 'x" onerror="alert(7)' },
        { kind: 'picture', url: 'data:image/png;base64,AAAA', description: 'datos' },
        { kind: 'button', label: 'Botón', link: 'javascript:alert(8)' },
      ],
    };
    const { html } = await renderEmail(AURORA, hostile);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(HANDLER_ATTRIBUTE);
    expect(html).not.toMatch(/(href|src)\s*=\s*"\s*(javascript|data|vbscript):/i);
    expect(html).not.toMatch(/<a[^>]*href="javascript/i);
    expect(html).not.toMatch(/<img[^>]*src="x"/i);
    // The typed text is still there, as visible text.
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('pulsa');
    // The hostile picture and button draw nothing.
    expect(html.match(/data-block="picture"/g) ?? []).toHaveLength(0);
    expect(html.match(/data-block="button"/g) ?? []).toHaveLength(0);
  });
});

describe('L4: the brand drives everything visible, and only that', () => {
  async function html(brand: Brand) {
    return (await renderEmail(brand, SAMPLE)).html;
  }

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const cases: Array<[string, Partial<Brand>, Array<[string, string]>]> = [
    ['accent colour', { accentColor: '#123456' }, [[AURORA.accentColor, '#123456']]],
    ['text on accent', { onAccentColor: '#abcdef' }, [[AURORA.onAccentColor, '#abcdef']]],
    ['text colour', { textColor: '#010203' }, [[AURORA.textColor, '#010203']]],
    ['muted text colour', { mutedTextColor: '#040506' }, [[AURORA.mutedTextColor, '#040506']]],
    ['page background', { pageBackgroundColor: '#070809' }, [[AURORA.pageBackgroundColor, '#070809']]],
    ['sheet background', { sheetBackgroundColor: '#0a0b0c' }, [[AURORA.sheetBackgroundColor, '#0a0b0c']]],
    ['rule colour', { ruleColor: '#0d0e0f' }, [[AURORA.ruleColor, '#0d0e0f']]],
    [
      'logo',
      { logo: { ...AURORA.logo, url: 'https://otro.example.test/l.png' } },
      [[AURORA.logo.url, 'https://otro.example.test/l.png']],
    ],
    [
      'font stack',
      { fontStack: 'Trebuchet MS, Arial, sans-serif' },
      [[escape(AURORA.fontStack), 'Trebuchet MS, Arial, sans-serif']],
    ],
    [
      'legal footer',
      { footerLines: ['Otra Razón Social Inventada', AURORA.footerLines[1]] },
      [[AURORA.footerLines[0], 'Otra Razón Social Inventada']],
    ],
    ['language', { language: 'en' }, [['lang="es"', 'lang="en"']]],
    ['sender', { sender: { name: 'Otro Remitente', address: 'otro@example.test' } }, []],
    ['reply address', { replyTo: 'otra@example.test' }, []],
  ];

  it.each(cases)('changing the %s changes that and nothing else', async (_label, change, swaps) => {
    const before = await html(AURORA);
    const after = await html({ ...AURORA, ...change });
    let expected = before;
    for (const [from, to] of swaps) {
      expect(before).toContain(from);
      expected = expected.split(from).join(to);
    }
    expect(after).toEqual(expected);
    if (swaps.length) expect(after).not.toEqual(before);
  });

  it('refuses a brand it cannot draw', async () => {
    expect(validateBrand(AURORA)).toEqual([]);
    expect(validateBrand({ ...AURORA, accentColor: 'red' }).length).toBeGreaterThan(0);
    for (const field of ['textColor', 'mutedTextColor', 'pageBackgroundColor', 'sheetBackgroundColor', 'ruleColor'] as const) {
      expect(validateBrand({ ...AURORA, [field]: 'gray' }), field).toHaveLength(1);
      expect(validateBrand({ ...AURORA, [field]: undefined } as unknown as Brand), field).toHaveLength(1);
      await expect(renderEmail({ ...AURORA, [field]: '#fff; background:url(x)' }, SAMPLE), field).rejects.toThrow();
    }
    expect(validateBrand({ ...AURORA, logo: { ...AURORA.logo, url: 'javascript:alert(1)' } }).length).toBeGreaterThan(0);
    await expect(renderEmail({ ...AURORA, accentColor: 'red; background:url(x)' }, SAMPLE)).rejects.toThrow();
  });

  it('draws the release-2 list links only when given', async () => {
    const without = await renderEmail(AURORA, SAMPLE);
    expect(without.html).not.toContain('data-part="list-links"');
    const withLinks = await renderEmail(AURORA, SAMPLE, {
      unsubscribeUrl: 'https://example.test/baja?t=1',
      preferencesUrl: 'https://example.test/preferencias',
    });
    expect(withLinks.html).toContain('data-part="list-links"');
    expect(withLinks.html).toContain('href="https://example.test/baja?t=1"');
    expect(withLinks.html).toContain('Darse de baja');
    expect(withLinks.text).toContain('Darse de baja: https://example.test/baja?t=1');
  });
});
