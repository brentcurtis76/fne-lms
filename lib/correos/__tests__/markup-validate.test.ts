// @vitest-environment node
// The text markup, the address rule and the block checks (invented data).
import { describe, expect, it } from 'vitest';
import { bodyToText, parseBody, safeUrl } from '../markup';
import { validateBlocks, validateContent } from '../validate';

describe('safeUrl', () => {
  it('keeps https, http and (when allowed) mailto', () => {
    expect(safeUrl('https://example.test/a?b=1')).toBe('https://example.test/a?b=1');
    expect(safeUrl('http://example.test')).toBe('http://example.test/');
    expect(safeUrl('mailto:alguien@example.test', { allowMailto: true })).toBe('mailto:alguien@example.test');
  });

  it('drops everything else', () => {
    for (const value of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,hola',
      'vbscript:x',
      '/relativa',
      'example.test',
      'https://',
      'https://example.test/a b',
      'https://example.test/"onmouseover="x',
      'mailto:alguien@example.test',
      '',
      undefined,
      42,
    ]) {
      expect(safeUrl(value)).toBeNull();
    }
    expect(safeUrl('mailto:sin-arroba', { allowMailto: true })).toBeNull();
  });
});

describe('parseBody', () => {
  it('reads bold, links, bullets, paragraphs and line breaks', () => {
    const nodes = parseBody('Hola **mundo** y [sitio](https://example.test).\nOtra línea\n\n- uno\n- **dos**\n\nFin');
    expect(nodes.map((n) => n.type)).toEqual(['paragraph', 'list', 'paragraph']);
    expect(nodes[0]).toEqual({
      type: 'paragraph',
      lines: [
        [
          { type: 'text', value: 'Hola ' },
          { type: 'bold', children: [{ type: 'text', value: 'mundo' }] },
          { type: 'text', value: ' y ' },
          { type: 'link', href: 'https://example.test/', children: [{ type: 'text', value: 'sitio' }] },
          { type: 'text', value: '.' },
        ],
        [{ type: 'text', value: 'Otra línea' }],
      ],
    });
    expect(bodyToText(nodes)).toBe('Hola mundo y sitio (https://example.test/).\nOtra línea\n\n- uno\n- dos\n\nFin');
  });

  it('keeps the label and drops a link it does not allow', () => {
    for (const body of ['[x](javascript:alert(1))', '[x](javascript:void)', '[x](JAVASCRIPT:void)', '[x](data:text/html,a)']) {
      expect(JSON.stringify(parseBody(body))).not.toContain('"link"');
    }
    expect(parseBody('[y](data:text/html,a)')).toEqual([{ type: 'paragraph', lines: [[{ type: 'text', value: 'y' }]] }]);
  });

  it('treats HTML as text', () => {
    expect(parseBody('<b>hola</b>')).toEqual([{ type: 'paragraph', lines: [[{ type: 'text', value: '<b>hola</b>' }]] }]);
  });
});

describe('validateBlocks and validateContent', () => {
  it('accepts a good email', () => {
    expect(
      validateContent({
        subject: 'Asunto',
        previewLine: 'Vista previa',
        blocks: [
          { kind: 'text', body: 'Hola' },
          { kind: 'picture', url: 'https://example.test/a.png', description: 'Una foto' },
          { kind: 'button', label: 'Ir', link: 'https://example.test' },
        ],
      })
    ).toEqual([]);
  });

  it('returns plain messages naming each problem', () => {
    const errors = validateBlocks([
      { kind: 'text', body: '  ' },
      { kind: 'picture', url: 'data:image/png;base64,AA', description: '' },
      { kind: 'button', label: '', link: 'javascript:alert(1)' },
      { kind: 'video' },
    ]);
    expect(errors).toEqual([
      'El bloque 1 (texto) no tiene texto.',
      'El bloque 2 (imagen) necesita una dirección de imagen que empiece con https:// o http://.',
      'El bloque 2 (imagen) necesita una descripción de la imagen.',
      'El bloque 3 (botón) necesita un texto para el botón.',
      'El bloque 3 (botón) necesita un enlace que empiece con https://, http:// o mailto:.',
      'El bloque 4 no es de texto, imagen ni botón.',
    ]);
    expect(validateBlocks([])).toEqual(['El correo necesita al menos un bloque.']);
    expect(validateBlocks('x')).toEqual(['El correo no tiene bloques.']);
    expect(validateContent({ subject: '', blocks: [{ kind: 'text', body: 'a' }] })).toEqual(['El correo necesita un asunto.']);
  });
});
