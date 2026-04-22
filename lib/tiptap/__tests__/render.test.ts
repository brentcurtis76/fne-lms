import { describe, it, expect } from 'vitest';
import { docToHtml, docToPlainText, isEmptyDoc } from '../render';

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

  it('matches expected snapshot shape', () => {
    const html = docToHtml(richDoc);
    expect(html).toMatchSnapshot();
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
