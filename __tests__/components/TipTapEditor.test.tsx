// @vitest-environment jsdom
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import TipTapEditor from '../../src/components/TipTapEditor';

const docA = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello A' }] }],
};

const docB = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello B' }] }],
};

describe('TipTapEditor reactivity to initialContent', () => {
  it('updates rendered content when initialContent prop changes', async () => {
    const onChange = vi.fn();

    const { container, rerender } = render(
      <TipTapEditor initialContent={docA} onChange={onChange} />
    );

    await waitFor(() => {
      expect(container.textContent).toContain('Hello A');
    });

    rerender(<TipTapEditor initialContent={docB} onChange={onChange} />);

    await waitFor(() => {
      expect(container.textContent).toContain('Hello B');
      expect(container.textContent).not.toContain('Hello A');
    });
  });
});
