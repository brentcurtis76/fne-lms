// @vitest-environment jsdom
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TipTapEditor from '../TipTapEditor';

const docA = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Document A' }],
    },
  ],
};

const docB = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Document B' }],
    },
  ],
};

describe('TipTapEditor initialContent sync', () => {
  it('updates the editor content when initialContent prop changes', async () => {
    const onChange = vi.fn();
    const { rerender, container } = render(
      <TipTapEditor initialContent={docA} onChange={onChange} />
    );

    await waitFor(() => {
      expect(container.querySelector('.tiptap-editor')?.textContent).toContain('Document A');
    });

    rerender(<TipTapEditor initialContent={docB} onChange={onChange} />);

    await waitFor(() => {
      expect(container.querySelector('.tiptap-editor')?.textContent).toContain('Document B');
    });

    expect(container.querySelector('.tiptap-editor')?.textContent).not.toContain('Document A');
  });
});
