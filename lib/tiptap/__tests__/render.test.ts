import { describe, it, expect } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';
import { docToHtml, docToPlainText, isEmptyDoc } from '../render';
import { MEETING_ALLOWED_TAGS, MEETING_ALLOWED_ATTR } from '../sanitize';

const richDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Resumen' }],
    },
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Contexto' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Una ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'reunión' },
        { type: 'text', text: ' con ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'acuerdos' },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Primer punto' }],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Segundo punto' }],
            },
          ],
        },
      ],
    },
  ],
};

describe('docToHtml', () => {
  it('strips script tags', () => {
    const malicious = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<script>alert(1)</script>hello' }],
        },
      ],
    };
    const html = docToHtml(malicious);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('hello');
  });

  it('applies inline styles on headings, lists, and paragraphs', () => {
    const html = docToHtml(richDoc);
    expect(html).toMatch(/<h2[^>]*style="[^"]*font-weight: 700/);
    expect(html).toMatch(/<h3[^>]*style="[^"]*font-weight: 700/);
    expect(html).toMatch(/<p[^>]*style="[^"]*font-family: Arial/);
    expect(html).toMatch(/<ul[^>]*style="[^"]*padding-left: 24px/);
    expect(html).toMatch(/<li[^>]*style="[^"]*margin:/);
  });

  it('drops class attributes', () => {
    const html = docToHtml(richDoc);
    expect(html).not.toMatch(/\sclass=/);
  });

  it('returns empty string for empty doc', () => {
    const html = docToHtml({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(html).toBe('');
  });

  it('renders bold and italic marks', () => {
    const html = docToHtml(richDoc);
    expect(html).toMatch(/<strong[^>]*>reunión<\/strong>/);
    expect(html).toMatch(/<em[^>]*>acuerdos<\/em>/);
  });

  it('applies padding-left to <ol> lists', () => {
    const orderedDoc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
          ],
        },
      ],
    };
    const html = docToHtml(orderedDoc);
    expect(html).toMatch(/<ol[^>]*style="[^"]*padding-left: 24px/);
  });

  it('applies text-decoration: underline to <u>', () => {
    const underlineDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'underline' }], text: 'subrayado' }],
        },
      ],
    };
    const html = docToHtml(underlineDoc);
    expect(html).toMatch(/<u[^>]*style="[^"]*text-decoration: underline/);
    expect(html).toContain('subrayado');
  });

  it('strips attributes set on input nodes (no id, no data-*)', () => {
    const docWithAttrs = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'evil', 'data-track': 'x' },
          content: [{ type: 'text', text: 'contenido' }],
        },
      ],
    };
    const html = docToHtml(docWithAttrs);
    expect(html).not.toMatch(/\sid=/);
    expect(html).not.toMatch(/\sdata-/);
    expect(html).toContain('contenido');
  });

  it('matches expected snapshot shape', () => {
    const html = docToHtml(richDoc);
    expect(html).toMatchSnapshot();
  });
});

describe('MEETING_ALLOWED_TAGS sanitization', () => {
  it('strips tags not in the allowlist but keeps allowed siblings', () => {
    const dirty = '<iframe src="evil"></iframe><p>ok</p>';
    const clean = DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: MEETING_ALLOWED_TAGS,
      ALLOWED_ATTR: MEETING_ALLOWED_ATTR,
    });
    expect(clean).not.toMatch(/<iframe/i);
    expect(clean).toContain('<p>ok</p>');
  });
});

describe('docToPlainText', () => {
  it('extracts plain text in reading order', () => {
    const text = docToPlainText(richDoc);
    expect(text).toContain('Resumen');
    expect(text).toContain('Contexto');
    expect(text).toContain('Una reunión con acuerdos.');
    expect(text).toContain('Primer punto');
    expect(text).toContain('Segundo punto');
  });

  it('returns empty string for null doc', () => {
    expect(docToPlainText(null)).toBe('');
  });
});

describe('isEmptyDoc', () => {
  it('returns true for empty paragraph doc', () => {
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
  });
  it('returns false for doc with text', () => {
    expect(isEmptyDoc(richDoc)).toBe(false);
  });
});
