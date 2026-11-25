// @vitest-environment jsdom
/**
 * F26b (EC-F2): a feed post's pictures and documents open through the
 * application's route /api/community/post-media/<media id> (a five-minute link
 * for the post's readers), never through the address stored in the row.
 * Synthetic ids, names and text only.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { CommunityPost } from '../../../types/feed';

// PostCard is compiled with the classic JSX runtime and does not import React itself.
(globalThis as any).React = React;

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('../../../lib/services/feedService', () => ({
  FeedService: { toggleReaction: vi.fn(), toggleSavePost: vi.fn(), deletePost: vi.fn() },
}));

import PostCard from '../../../components/feed/PostCard';

const POST = 'c0000000-0000-4000-8000-00000000000a';
const OLD_ADDRESS = `https://storage.invalid/storage/v1/object/public/post-media/${POST}/0.png`;

function post(type: 'image' | 'document', media: CommunityPost['media']): CommunityPost {
  return {
    id: POST,
    workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    author_id: '11111111-1111-4111-8111-111111111111',
    type,
    content: { text: 'Publicación sintética' },
    visibility: 'community',
    is_pinned: false,
    is_archived: false,
    view_count: 0,
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
    author: { id: '11111111-1111-4111-8111-111111111111', full_name: 'Persona Sintética' } as any,
    media,
  };
}

afterEach(cleanup);

describe('PostCard — feed files through the post-media route (F26b)', () => {
  it("an image post's <img> src is /api/community/post-media/<media id>, also after moving in the carousel", () => {
    const { container } = render(
      <PostCard
        post={post('image', [
          { id: 'm-1', type: 'image', url: OLD_ADDRESS, order_index: 0 },
          { id: 'm-2', type: 'image', url: `${POST}/1.png`, order_index: 1 },
        ])}
      />
    );
    const img = () => container.querySelector('img[alt="Imagen"]') as HTMLImageElement;
    expect(img().getAttribute('src')).toBe('/api/community/post-media/m-1');

    const dots = container.querySelectorAll('div.absolute button');
    expect(dots).toHaveLength(2);
    fireEvent.click(dots[1]);
    expect(img().getAttribute('src')).toBe('/api/community/post-media/m-2');
    expect(container.innerHTML).not.toContain('storage.invalid');
  });

  it("a document post's link is the same route, target=_blank, rel=noopener noreferrer", () => {
    render(
      <PostCard
        post={post('document', [
          { id: 'm-3', type: 'document', url: OLD_ADDRESS, order_index: 0, metadata: { name: 'Acta sintética.pdf', size: 2048 } },
        ])}
      />
    );
    const link = screen.getByText('Acta sintética.pdf').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/community/post-media/m-3');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
