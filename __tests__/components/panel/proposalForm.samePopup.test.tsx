// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(b): the course proposal form gives a person the same thing in both looks. Each
 * case of the step-0 pin runs with `clasico` and with `nuevo`; what a person gets (`personView`) and
 * every `onSubmit` (with what it received) and `onClose` must be equal: texts with their count, fields,
 * buttons and the X with their state. The form is sent by clicking its send button in both looks. What
 * may differ is the helper's one list, `LOOK_EXCEPTIONS`. The X while sending differs (C5-X, left
 * failing for the lead). Enter in a field is tested apart, in each look, in
 * `CourseProposalFormNuevo.test.tsx`: jsdom's user-event finds the default button only inside the form,
 * and the new one sits in the window's footer, joined by the `form` attribute.
 * Every proposal is invented.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { closeX, deferred, inBothLooks, personView, settle, xApart } from '../../helpers/popups';

const fake = vi.hoisted(() => ({
  look: 'clasico' as 'clasico' | 'nuevo',
  log: [] as unknown[],
  answers: [] as Array<'ok' | 'pending' | { reject: unknown }>,
  pending: null as null | { resolve: () => void; reject: (reason: unknown) => void },
}));

vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: fake.look, setLook: () => {} }) }));

import { CourseProposalModal } from '@/components/course-proposals/CourseProposalModal';
import type { CourseProposal } from '@/types/course-proposals';

const PROPOSAL: CourseProposal = {
  id: 'prop-inventada',
  titulo: 'Propuesta Inventada',
  descripcion_corta: 'Descripción inventada',
  competencias_desarrollar: 'Competencias inventadas',
  tiempo_requerido_desarrollo: '3 semanas',
  necesita_ayuda_diseno_instruccional: true,
  created_by: 'user-inventado',
  created_at: '2026-10-01T15:00:00Z',
  updated_at: '2026-10-01T15:00:00Z',
  status: 'pending',
};

// What a person gets; the exceptions (eyebrow, the tick box's help inside today's label, the send button
// while sending) are the helper's one list, `LOOK_EXCEPTIONS`.
const got = () => personView({ popup: 'form' });

function onSubmit(data: unknown) {
  fake.log.push({ onSubmit: JSON.parse(JSON.stringify(data)) });
  const answer = fake.answers.shift() ?? 'ok';
  if (answer === 'pending') {
    const d = deferred<void>();
    fake.pending = { resolve: () => d.resolve(), reject: d.reject };
    return d.promise;
  }
  if (answer === 'ok') return Promise.resolve();
  return Promise.reject(answer.reject);
}

let view: ReturnType<typeof render>;
function element(over: { isOpen?: boolean; editingProposal?: CourseProposal | null } = {}) {
  return (
    <CourseProposalModal
      isOpen={over.isOpen ?? true}
      onClose={() => {
        fake.log.push('onClose');
      }}
      onSubmit={onSubmit}
      editingProposal={over.editingProposal}
    />
  );
}
async function draw(over: { isOpen?: boolean; editingProposal?: CourseProposal | null } = {}) {
  view = render(element(over));
  await settle();
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const sendButton = () => document.body.querySelector('button[type="submit"]') as HTMLButtonElement;
async function type(id: string, value: string) {
  fireEvent.change(field(id), { target: { value } });
  await settle();
}
async function send() {
  fireEvent.click(sendButton());
  await settle();
}
async function fillAll() {
  await type('titulo', '  Título Inventado  ');
  await type('descripcion_corta', 'Descripción inventada ');
  await type('competencias_desarrollar', ' Competencias inventadas');
  await type('tiempo_requerido_desarrollo', '2 meses');
  fireEvent.click(field('necesita_ayuda_diseno_instruccional'));
  await settle();
}

async function same(scenario: () => Promise<unknown[]>) {
  const results = await inBothLooks(
    (look) => (fake.look = look),
    () => {
      fake.log = [];
      fake.answers = [];
      fake.pending = null;
    },
    scenario,
    () => fake.log
  );
  expect(results.nuevo).toEqual(results.clasico);
}

describe('the course proposal form in both looks: the same for a person', () => {
  it('C1–C3. closed; create mode; edit mode with the proposal\'s values', () => same(async () => {
    await draw({ isOpen: false });
    const closed = got();
    view.unmount();
    await draw({ editingProposal: null });
    const create = got();
    view.unmount();
    await draw({ editingProposal: PROPOSAL });
    return [closed, create, got()];
  }));

  it('C4. the four messages in order, each cleared by a keystroke', () => same(async () => {
    await draw();
    const stages: unknown[] = [];
    await send();
    stages.push(got());
    await type('titulo', '   ');
    stages.push(got());
    await send();
    await type('titulo', 'Título Inventado');
    await send();
    stages.push(got());
    await type('descripcion_corta', 'Descripción');
    await send();
    stages.push(got());
    await type('competencias_desarrollar', 'Competencias');
    await send();
    stages.push(got());
    fireEvent.click(field('necesita_ayuda_diseno_instruccional'));
    await settle();
    stages.push(got());
    return stages;
  }));

  // While sending, the fields, the tick box and «Cancelar» are disabled in both looks; the send button
  // reads «Guardando...», disabled today and busy in the new look (the one allowed difference of state).
  // The X is compared in the twin below.
  async function sending(view: () => unknown) {
    await draw();
    await fillAll();
    fake.answers = ['pending'];
    await send();
    const during = view();
    fake.pending?.resolve();
    await settle();
    return [during, got()];
  }

  it('C5. a submit: what onSubmit receives, «Guardando...», then closed and reset', () => same(() => sending(() => xApart(got()))));

  // A REAL DIFFERENCE, left failing for the lead (send-back 1, point 2(c)): while sending, today's X
  // (the older dialog's) is drawn and enabled (a click on it does nothing, the hook refuses to close);
  // the kit's window with `dismissable={false}` draws no X at all («absent»).
  it.fails('C5-X. sending: the X is enabled today; the new look has no X (differs, for the lead)', () => same(() => sending(got)));

  it('C6/C8. edit mode: a submit, a refusal with the edit fallback', () => same(async () => {
    await draw({ editingProposal: PROPOSAL });
    await type('titulo', 'Propuesta Editada Inventada');
    fake.answers = [{ reject: {} }, 'ok'];
    await send();
    const refused = got();
    await send();
    return [refused, got()];
  }));

  it('C7. refusals in create mode: the message, the fallback; a keystroke clears it', () => same(async () => {
    await draw();
    await fillAll();
    fake.answers = [{ reject: new Error('Solo administradores y consultores pueden crear propuestas') }, { reject: {} }, { reject: new Error('') }];
    await send();
    const withMessage = got();
    await send();
    const fallback = got();
    await send();
    const empty = got();
    await type('tiempo_requerido_desarrollo', '3 meses');
    return [withMessage, fallback, empty, got()];
  }));

  it('C9. close blocked while sending: «Cancelar», the X and Escape do nothing', () => same(async () => {
    await draw();
    await fillAll();
    fake.answers = ['pending'];
    await send();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    const x = closeX();
    if (x) fireEvent.click(x);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    await settle();
    // The X while sending: compared in C5-X.
    const still = xApart(got());
    fake.pending?.reject(new Error('Rechazo inventado'));
    await settle();
    return [still, got()];
  }));

  it('C10. «Cancelar», the X and Escape reset the form and the error, and call onClose', () => same(async () => {
    await draw();
    await send();
    await type('titulo', 'Algo Escrito');
    await send();
    const before = got();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await settle();
    const afterCancel = got();
    await type('titulo', 'Otra Vez');
    fireEvent.click(closeX()!);
    await settle();
    const afterX = got();
    await type('titulo', 'Y Otra');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    await settle();
    return [before, afterCancel, afterX, got()];
  }));

  it('C12. the proposal changing: create → edit → create', () => same(async () => {
    await draw({ editingProposal: null });
    await type('titulo', 'Escrito En Crear');
    view.rerender(element({ editingProposal: PROPOSAL }));
    await settle();
    const editing = got();
    view.rerender(element({ editingProposal: null }));
    await settle();
    return [editing, got()];
  }));
});
