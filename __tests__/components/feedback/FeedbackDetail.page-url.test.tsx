// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// The ticket detail loads its activity with the browser client; a fake that
// answers an empty list keeps the test local.
vi.mock('@supabase/auth-helpers-react', () => {
  const chain: any = {};
  for (const m of ['from', 'select', 'eq']) chain[m] = () => chain;
  chain.order = () => Promise.resolve({ data: [], error: null });
  return { useSupabaseClient: () => chain };
});
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FeedbackDetail, { isHttpPageUrl } from '../../../components/feedback/FeedbackDetail';

/**
 * F7c (GES-1.6): a ticket's page address is a link only when it is an http or
 * https address; anything else (javascript:, data:, protocol-relative,
 * relative, empty) is shown as plain text. Synthetic ticket only.
 */
function ticket(pageUrl: string) {
  return {
    id: '12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    type: 'bug',
    status: 'seen',
    description: 'Ticket sintético',
    page_url: pageUrl,
    created_at: '2026-11-17T12:00:00Z',
    browser_info: null,
    profiles: { first_name: 'Persona', last_name: 'Sintética', email: 'persona@test.local', avatar_url: null },
  };
}

function renderTicket(pageUrl: string) {
  return render(
    <FeedbackDetail feedback={ticket(pageUrl)} isOpen onClose={vi.fn()} onStatusUpdate={vi.fn()} onRefresh={vi.fn()} />
  );
}

const NOT_LINKS = [
  'javascript:alert(1)',
  'JAVASCRIPT:alert(1)',
  ' javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  '//evil.example/path',
  '',
  '/dashboard?tab=1',
];
const LINKS = ['https://genera.example/dashboard', 'http://genera.example/cursos'];

describe('isHttpPageUrl', () => {
  it.each(NOT_LINKS)('%j is not a link', value => {
    expect(isHttpPageUrl(value)).toBe(false);
  });
  it.each(LINKS)('%j is a link', value => {
    expect(isHttpPageUrl(value)).toBe(true);
  });
  it.each([null, undefined, 42])('a non-string (%j) is not a link', value => {
    expect(isHttpPageUrl(value as unknown)).toBe(false);
  });
});

describe('FeedbackDetail — page address', () => {
  it.each(NOT_LINKS)('renders %j as plain text, with no element carrying an href', value => {
    const { container } = renderTicket(value);
    expect(container.querySelectorAll('[href]')).toHaveLength(0);
    if (value.trim()) {
      const text = screen.getByText(value.trim());
      expect(text.tagName).toBe('SPAN');
      expect(text).toHaveClass('truncate');
      expect(text).not.toHaveClass('text-blue-600');
      expect(text).not.toHaveClass('hover:underline');
    }
  });

  it.each(LINKS)('renders %j as the link it was', value => {
    const { container } = renderTicket(value);
    const link = screen.getByText(value);
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', value);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('text-blue-600', 'hover:underline', 'truncate');
    expect(container.querySelectorAll('[href]')).toHaveLength(1);
  });

  it('keeps «Copiar Detalles para Claude Code»', () => {
    renderTicket('javascript:alert(1)');
    const copy = screen.getByTitle('Copiar todos los detalles del error para Claude Code');
    expect(copy).toHaveTextContent('Copiar Detalles');
  });
});
