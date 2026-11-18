// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(b): the course proposal form gives a person the same thing in both looks. Each
 * case of the step-0 pin runs with `clasico` and with `nuevo`; what a person gets (`personView`) and
 * every `onSubmit` (with what it received) and `onClose` must be equal: texts with their count, fields,
 * buttons and the X with their state. The form is sent by clicking its send button in both looks. What
 * may differ is the helper's one list, `LOOK_EXCEPTIONS`. Two decided differences are asserted as they
 * are, in each look: the X while sending (C5-X) and the validation message as one notice at the top
 * of the form, tied to no field (C4-M). Enter in a field is tested apart, in each look, in
 * `CourseProposalFormNuevo.test.tsx`: jsdom's user-event finds the default button only inside the form,
 * and the new one sits in the window's footer, joined by the `form` attribute.
 * Every proposal is invented.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { closeX, deferred, helpOf, inBothLooks, LOOK_EXCEPTIONS, personView, settle, stateOf } from '../../helpers/popups';

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

/** The same scenario in each look, nothing compared. */
function both<T>(scenario: () => Promise<T>) {
  return inBothLooks(
    (look) => (fake.look = look),
    () => {
      fake.log = [];
      fake.answers = [];
      fake.pending = null;
    },
    scenario,
    () => fake.log
  );
}

async function same(scenario: () => Promise<unknown[]>) {
  const results = await both(scenario);
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
  // C5-X.
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

  it('C5. a submit: what onSubmit receives, «Guardando...», then closed and reset', () => same(() => sending(got)));

  // A DECIDED DIFFERENCE (send-back 2, `LOOK_EXCEPTIONS.noXWhileWorking`): while sending, today's X
  // (the older dialog's) is drawn and enabled, and a click on it does nothing (the hook refuses to
  // close: C9); the kit's window with `dismissable={false}` draws no X at all.
  it('C5-X. sending: today the X is drawn and enabled (it does nothing); the new look draws no X', async () => {
    const results = await both(() => sending(() => stateOf(closeX())));
    expect(results.clasico.got[0]).toBe('enabled');
    expect(results.nuevo.got[0]).toBe('absent');
    expect(LOOK_EXCEPTIONS.noXWhileWorking.today.form).toBe(results.clasico.got[0]);
    expect(LOOK_EXCEPTIONS.noXWhileWorking.nuevo).toBe(results.nuevo.got[0]);
    // Once sent, both looks give a person the same again (as C5).
    expect(results.clasico.got[1]).toEqual(results.nuevo.got[1]);
  });

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
    // The X while sending: the decided difference of C5-X (`LOOK_EXCEPTIONS.noXWhileWorking`).
    const still = got();
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

  // A DECIDED DIFFERENCE (send-back 2, `LOOK_EXCEPTIONS.messageAtTop`): each of the hook's messages is
  // ONE notice at the top of the form, tied to no single field. Today: one red box, first in the form,
  // with no role; the new look: one notice, first in the form, `role="alert"`. In neither look does a
  // field point at it (`aria-describedby`) or say it is invalid (`aria-invalid`).
  it('C4-M. the hook\'s messages: one notice at the top of the form, tied to no field (today a box, the new look an alert)', async () => {
    const MESSAGES: Array<[id: string, message: string, value: string]> = [
      ['titulo', 'El título es requerido', 'Título Inventado'],
      ['descripcion_corta', 'La descripción es requerida', 'Descripción inventada'],
      ['competencias_desarrollar', 'Las competencias a desarrollar son requeridas', 'Competencias inventadas'],
      ['tiempo_requerido_desarrollo', 'El tiempo requerido es requerido', '1 mes'],
    ];
    const FIELDS = MESSAGES.map(([id]) => id);
    const results = await both(async () => {
      await draw();
      const seen: unknown[] = [];
      for (const [id, message, value] of MESSAGES) {
        await send();
        const form = document.body.querySelector('form')!;
        const first = form.firstElementChild as HTMLElement;
        const carriers = Array.from(form.querySelectorAll<HTMLElement>('*')).filter(
          (e) => (e.textContent ?? '').trim() === message && !Array.from(e.children).some((c) => (c.textContent ?? '').trim() === message)
        );
        seen.push({
          message,
          shown: carriers.length,
          place: first.contains(carriers[0] ?? null) ? 'first in the form' : 'elsewhere',
          role: first.getAttribute('role') ?? 'none',
          tiedToAField: FIELDS.some((f) => helpOf(field(f), message).associated !== false || field(f).getAttribute('aria-invalid') === 'true'),
        });
        await type(id, value);
      }
      return seen;
    });
    for (const [look, named] of [
      ['clasico', LOOK_EXCEPTIONS.messageAtTop.today],
      ['nuevo', LOOK_EXCEPTIONS.messageAtTop.nuevo],
    ] as const) {
      expect(results[look].got).toEqual(MESSAGES.map(([, message]) => ({ message, shown: 1, ...named })));
    }
    expect(results.clasico.got.map((s) => (s as { role: string }).role)).toEqual(['none', 'none', 'none', 'none']);
    expect(results.nuevo.got.map((s) => (s as { role: string }).role)).toEqual(['alert', 'alert', 'alert', 'alert']);
  });

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
