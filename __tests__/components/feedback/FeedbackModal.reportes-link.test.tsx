// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F15e (GES-2.18, E2-link): the feedback window leads to «Mis reportes».
 * The link is in the window's footer, shown in the form step (also while a
 * report is being sent); following it closes the window. Synthetic data.
 */

const { db } = vi.hoisted(() => ({
  db: { inserts: [] as any[], hold: null as null | Promise<void> },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...rest }: any) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('@supabase/auth-helpers-react', () => {
  const client: any = {
    auth: { getUser: async () => ({ data: { user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } } }) },
    from() {
      const chain: any = {};
      chain.insert = (payload: any) => (db.inserts.push(payload), chain);
      chain.select = () => chain;
      chain.single = async () => {
        if (db.hold) await db.hold;
        return { data: { id: '12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, error: null };
      };
      return chain;
    },
  };
  return { useSupabaseClient: () => client };
});
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FeedbackModal from '../../../components/feedback/FeedbackModal';

beforeEach(() => {
  db.inserts = [];
  db.hold = null;
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ notificationsCreated: 1 }) })) as any;
});

const link = () => screen.getByRole('link', { name: 'Ver mis reportes' });

describe('«Ver mis reportes» in the feedback window', () => {
  it('the open window holds the link to /profile/reportes', () => {
    render(<FeedbackModal isOpen onClose={vi.fn()} />);
    expect(link()).toHaveAttribute('href', '/profile/reportes');
    expect(link().textContent).toBe('Ver mis reportes');
  });

  it('following it closes the window', () => {
    const onClose = vi.fn();
    render(<FeedbackModal isOpen onClose={onClose} />);
    fireEvent.click(link());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is there after typing and choosing a type, and while the report is being sent', async () => {
    let release!: () => void;
    db.hold = new Promise<void>((resolve) => (release = resolve));
    render(<FeedbackModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('El botón no funciona cuando...'), { target: { value: 'Algo sintético falla' } });
    fireEvent.click(screen.getByRole('button', { name: /Idea/ }));
    expect(link()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar →' }));
    expect(await screen.findByRole('button', { name: 'Enviando...' })).toBeInTheDocument();
    expect(link()).toHaveAttribute('href', '/profile/reportes');
    release();
    expect(await screen.findByText('Tu reporte fue enviado.')).toBeInTheDocument();
  });

  it('sending a report works as before', async () => {
    render(<FeedbackModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('El botón no funciona cuando...'), { target: { value: '  Algo sintético falla  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Problema/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar →' }));
    expect(await screen.findByText('Tu reporte fue enviado.')).toBeInTheDocument();
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({ description: 'Algo sintético falla', type: 'bug', created_by: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/feedback/notify-admins', expect.objectContaining({ method: 'POST' })));
  });

  it('a closed window shows nothing', () => {
    render(<FeedbackModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('link', { name: 'Ver mis reportes' })).not.toBeInTheDocument();
  });
});
