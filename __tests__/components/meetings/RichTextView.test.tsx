// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@tiptap/html', () => ({
  generateHTML: vi.fn(),
}));

import { generateHTML } from '@tiptap/html';
import RichTextView from '../../../components/meetings/RichTextView';

const doc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
};

describe('RichTextView XSS sanitization', () => {
  it('strips <script> tags from rendered HTML', () => {
    (generateHTML as any).mockReturnValue(
      '<p>hello</p><script>alert(1)</script>'
    );

    const { container } = render(<RichTextView doc={doc} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).not.toContain('alert(1)');
    expect(container.textContent).toContain('hello');
  });

  it('strips on* event handler attributes', () => {
    (generateHTML as any).mockReturnValue(
      '<p onclick="alert(1)">click</p>'
    );

    const { container } = render(<RichTextView doc={doc} />);

    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.getAttribute('onclick')).toBeNull();
    expect(container.innerHTML).not.toContain('onclick');
  });

  it('strips onerror event handlers from elements', () => {
    (generateHTML as any).mockReturnValue(
      '<p onerror="alert(1)">x</p>'
    );

    const { container } = render(<RichTextView doc={doc} />);

    expect(container.innerHTML).not.toContain('onerror');
  });

  it('strips <iframe> tags', () => {
    (generateHTML as any).mockReturnValue(
      '<p>ok</p><iframe src="https://evil.example"></iframe>'
    );

    const { container } = render(<RichTextView doc={doc} />);

    expect(container.querySelector('iframe')).toBeNull();
  });

  it('preserves allowed TipTap tags (h2, h3, p, ul, ol, li, strong, em, u, br)', () => {
    (generateHTML as any).mockReturnValue(
      '<h2>Title</h2><h3>Sub</h3><p><strong>bold</strong> <em>ital</em> <u>und</u><br></p><ul><li>a</li></ul><ol><li>b</li></ol>'
    );

    const { container } = render(<RichTextView doc={doc} />);

    expect(container.querySelector('h2')).not.toBeNull();
    expect(container.querySelector('h3')).not.toBeNull();
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('em')).not.toBeNull();
    expect(container.querySelector('u')).not.toBeNull();
    expect(container.querySelector('br')).not.toBeNull();
    expect(container.querySelector('ul > li')).not.toBeNull();
    expect(container.querySelector('ol > li')).not.toBeNull();
  });
});
