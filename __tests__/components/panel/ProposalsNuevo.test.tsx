// @vitest-environment jsdom
/**
 * Send-back «by sight», point 3: a proposal just sent is brought into view. With the real
 * `useCourseProposals()` and a fake server: a card ADDED at the front of the row sends the row's
 * track to its start (`scrollTo` with `left: 0`); the first load, an edit and a deletion do not move
 * it, nor does a re-render. The form and the confirmation are stand-ins that keep their props, so the
 * test calls their handlers as today's components would. Every proposal and person invented.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ modal: null as any, confirm: null as any }));
vi.mock('@/components/course-proposals/CourseProposalModal', () => ({
  CourseProposalModal: (props: any) => {
    captured.modal = props;
    return null;
  },
}));
vi.mock('@/components/course-proposals/ConfirmDialog', () => ({
  ConfirmDialog: (props: any) => {
    captured.confirm = props;
    return null;
  },
}));
vi.mock('@/utils/toastUtils', () => ({ toastSuccess: () => {}, toastError: () => {} }));
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

import { ProposalsNuevo } from '@/components/panel/ProposalsNuevo';

const OWNER = 'user-inventado';
const made = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  titulo: `Propuesta Inventada ${id}`,
  descripcion_corta: 'Una descripción inventada',
  competencias_desarrollar: 'Competencias inventadas',
  tiempo_requerido_desarrollo: '2 semanas',
  necesita_ayuda_diseno_instruccional: false,
  created_by: OWNER,
  created_at: '2026-10-01T15:00:00Z',
  updated_at: '2026-10-01T15:00:00Z',
  status: 'pending',
  creator: { first_name: 'Persona', last_name: 'Inventada', email: 'persona@example.invalid' },
  ...over,
});

let server: ReturnType<typeof made>[] = [];
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const fetchStub = vi.fn((url: string, init?: { method?: string; body?: string }) => {
  const method = init?.method ?? 'GET';
  if (method === 'GET') return ok({ data: server });
  if (method === 'POST') return ok({ data: made('prop-nueva', JSON.parse(init!.body!)) });
  if (method === 'PUT') {
    const id = url.split('/').pop()!;
    return ok({ data: { ...server.find((p) => p.id === id), ...JSON.parse(init!.body!) } });
  }
  return ok({});
});

const scrolled: Array<{ testId: string | null; options: ScrollToOptions }> = [];
beforeAll(() => {
  (HTMLElement.prototype as any).scrollTo = function (this: HTMLElement, options: ScrollToOptions) {
    scrolled.push({ testId: this.getAttribute('data-testid'), options });
  };
});
afterEach(() => cleanup());
afterAll(() => {
  delete (HTMLElement.prototype as any).scrollTo;
  vi.unstubAllGlobals();
});
beforeEach(() => {
  server = [made('prop-1'), made('prop-2'), made('prop-3', { created_by: 'user-otro' })];
  scrolled.length = 0;
  captured.modal = null;
  captured.confirm = null;
  fetchStub.mockClear();
  vi.stubGlobal('fetch', fetchStub);
});

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const FORM = {
  titulo: 'Propuesta Recién Enviada',
  descripcion_corta: 'Otra descripción inventada',
  competencias_desarrollar: 'Otras competencias',
  tiempo_requerido_desarrollo: '3 semanas',
  necesita_ayuda_diseno_instruccional: false,
};

const cardIds = () => [...document.querySelectorAll('[data-testid^="panel-proposal-"]')].map((el) => el.getAttribute('data-testid'));
const rowMoves = () => scrolled.filter((s) => s.testId === 'panel-section-proposals-row');

describe('a proposal just sent is brought into view', () => {
  it('the first load does not move the row', async () => {
    render(<ProposalsNuevo userId={OWNER} />);
    await settle();
    expect(cardIds()).toEqual(['panel-proposal-prop-1', 'panel-proposal-prop-2', 'panel-proposal-prop-3']);
    expect(rowMoves()).toEqual([]);
  });

  it('a card added at the front: the track goes to 0', async () => {
    render(<ProposalsNuevo userId={OWNER} />);
    await settle();
    await act(async () => {
      await captured.modal.onSubmit(FORM);
    });
    await settle();
    expect(cardIds()[0]).toBe('panel-proposal-prop-nueva');
    expect(rowMoves()).toEqual([{ testId: 'panel-section-proposals-row', options: { left: 0, behavior: 'smooth' } }]);
    // A later re-render does not move it again.
    await settle();
    expect(rowMoves()).toHaveLength(1);
  });

  it('a card edited: no movement', async () => {
    render(<ProposalsNuevo userId={OWNER} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Editar propuesta' })[0]);
    });
    expect(captured.modal.editingProposal.id).toBe('prop-1');
    await act(async () => {
      await captured.modal.onSubmit({ ...FORM, titulo: 'Propuesta Editada' });
    });
    await settle();
    expect(screen.getByText('Propuesta Editada')).toBeTruthy();
    expect(cardIds()).toHaveLength(3);
    expect(rowMoves()).toEqual([]);
  });

  it('a card deleted: no movement', async () => {
    render(<ProposalsNuevo userId={OWNER} />);
    await settle();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar propuesta' })[0]);
    });
    await act(async () => {
      await captured.confirm.onConfirm();
    });
    await settle();
    expect(cardIds()).toEqual(['panel-proposal-prop-2', 'panel-proposal-prop-3']);
    expect(rowMoves()).toEqual([]);
  });
});

/*
 * Send-back «by sight», point 5: a card's first row (the state at the left, the pencil and the bin at
 * the right when offered) has the same height with or without the two buttons: at least the icon
 * button's 36 px, so the titles of one row start on one line. jsdom lays nothing out: the classes are
 * read (the kit's icon-only button is h-9, 36 px, in both looks).
 */
describe('proposal cards line up with or without their two buttons', () => {
  it('the first row is 36 px tall at least, with and without the buttons', async () => {
    render(<ProposalsNuevo userId={OWNER} />);
    await settle();
    const own = screen.getByTestId('panel-proposal-prop-1').firstElementChild as HTMLElement;
    const other = screen.getByTestId('panel-proposal-prop-3').firstElementChild as HTMLElement;
    expect(own.querySelectorAll('button')).toHaveLength(2);
    expect(other.querySelectorAll('button')).toHaveLength(0);
    for (const head of [own, other]) {
      expect(head.className.split(/\s+/)).toContain('min-h-[36px]');
      expect(head.nextElementSibling!.tagName).toBe('H3');
    }
    for (const button of own.querySelectorAll('button')) {
      expect(button.className.split(/\s+/)).toContain('h-9');
    }
  });
});
