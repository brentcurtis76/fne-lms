// @vitest-environment jsdom
// F12e N97: the post composer's @mention search names the workspace it is in,
// so the server can answer with the people of THAT community (and so an admin
// or an assigned consultor, who has no community role row, gets an answer).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

(globalThis as any).React = React;

const captured = vi.hoisted(() => ({ mentionOptions: null as any }));

vi.mock('@tiptap/react', () => ({
  useEditor: () => null,
  EditorContent: () => null,
  ReactRenderer: class {},
}));
vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-mention', () => ({
  default: {
    configure: (options: unknown) => {
      captured.mentionOptions = options;
      return {};
    },
  },
}));
vi.mock('tippy.js', () => ({ default: () => [] }));
vi.mock('../../../components/feed/MentionList', () => ({ default: () => null }));

import CreatePostModal from '../../../components/feed/CreatePostModal';

const WORKSPACE_ID = '0b9c1d1e-2f3a-4b5c-8d6e-7f8091a2b3c4';

describe('CreatePostModal mention search (F12e N97)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    captured.mentionOptions = null;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the request carries the workspace_id of the workspace it is in', async () => {
    render(
      <CreatePostModal
        isOpen
        onClose={() => {}}
        onSubmit={async () => {}}
        authorName="Autora Sintética"
        workspaceId={WORKSPACE_ID}
      />
    );
    expect(captured.mentionOptions).toBeTruthy();
    await captured.mentionOptions.suggestion.items({ query: 'Ana María' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe('/api/community/search-users');
    expect(url.searchParams.get('q')).toBe('Ana María');
    expect(url.searchParams.get('workspace_id')).toBe(WORKSPACE_ID);
  });
});
