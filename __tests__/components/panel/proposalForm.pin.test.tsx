// @vitest-environment jsdom
/**
 * Redesign 6C, step 0: today's course proposal form (`components/course-proposals/CourseProposalModal`),
 * to create and to edit, pinned in the look `clasico` BEFORE its logic moves into a hook and it gets
 * a second markup. Each case keeps one digest of the markup of the page body and of every `onSubmit`
 * call (with what it received), every `onClose` call and every error line
 * (`proposalForm.pin.digests.json`; see `__tests__/helpers/pin.ts` and `__tests__/helpers/popups.tsx`).
 * Every proposal is invented.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../helpers/pin';
import { bodyMarkup, deferred, describeArg, settle } from '../../helpers/popups';

const fake = vi.hoisted(() => ({
  log: [] as unknown[],
  answers: [] as Array<'ok' | 'pending' | { reject: unknown }>,
  pending: null as null | { resolve: () => void; reject: (reason: unknown) => void },
}));

vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: 'clasico', setLook: () => {} }) }));

import { CourseProposalModal } from '@/components/course-proposals/CourseProposalModal';
import type { CourseProposal } from '@/types/course-proposals';

const { pinned, digestsFileHolds } = makePin(
  join(dirname(fileURLToPath(import.meta.url)), 'proposalForm.pin.digests.json'),
  'PANEL_PROPOSAL_FORM'
);

const theLog = () => serialise(fake.log);

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  fake.log = [];
  fake.answers = [];
  fake.pending = null;
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) fake.log.push({ 'console.error': first });
  });
});
afterEach(() => {
  consoleError?.mockRestore();
});

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
      onClose={(...args: unknown[]) => {
        fake.log.push({ onClose: args.map(describeArg) });
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
const submitButton = () => document.body.querySelector('button[type="submit"]') as HTMLButtonElement;
async function type(id: string, value: string) {
  fireEvent.change(field(id), { target: { value } });
  await settle();
}
async function send() {
  fireEvent.click(submitButton());
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

describe("today's course proposal form (CourseProposalModal), look clasico", () => {
  pinned('C1. closed: nothing drawn', async () => {
    await draw({ isOpen: false });
    return [bodyMarkup(), theLog()];
  });

  pinned('C2. create mode: title, description line, empty fields, «Enviar Propuesta»', async () => {
    await draw({ editingProposal: null });
    return [bodyMarkup(), theLog()];
  });

  pinned('C3. edit mode: the fields filled from the proposal, «Guardar Cambios»', async () => {
    await draw({ editingProposal: PROPOSAL });
    return [bodyMarkup(), theLog()];
  });

  pinned('C4. the four validation messages in order, each cleared by a keystroke; only spaces count as empty', async () => {
    await draw();
    const stages: string[] = [];
    await send();
    stages.push(bodyMarkup());
    await type('titulo', '   ');
    stages.push(bodyMarkup());
    await send();
    await type('titulo', 'Título Inventado');
    await send();
    stages.push(bodyMarkup());
    await type('descripcion_corta', 'Descripción');
    await send();
    stages.push(bodyMarkup());
    await type('competencias_desarrollar', 'Competencias');
    await send();
    stages.push(bodyMarkup());
    // the tick box clears the message too
    fireEvent.click(field('necesita_ayuda_diseno_instruccional'));
    await settle();
    stages.push(bodyMarkup());
    return [...stages, theLog()];
  });

  pinned('C5. a submit in create mode: what onSubmit receives (not trimmed), the spinner, then closed and reset', async () => {
    await draw();
    await fillAll();
    fake.answers = ['pending'];
    await send();
    const sending = bodyMarkup();
    fake.pending?.resolve();
    await settle();
    return [sending, bodyMarkup(), theLog()];
  });

  pinned('C6. a submit in edit mode: the proposal\'s values as they were edited', async () => {
    await draw({ editingProposal: PROPOSAL });
    await type('titulo', 'Propuesta Editada Inventada');
    await send();
    return [bodyMarkup(), theLog()];
  });

  pinned('C7. refusals in create mode: the message in the red box, or the fallback; a keystroke clears it', async () => {
    await draw();
    await fillAll();
    fake.answers = [{ reject: new Error('Solo administradores y consultores pueden crear propuestas') }, { reject: {} }, { reject: new Error('') }];
    await send();
    const withMessage = bodyMarkup();
    await send();
    const fallback = bodyMarkup();
    await send();
    const empty = bodyMarkup();
    await type('tiempo_requerido_desarrollo', '3 meses');
    return [withMessage, fallback, empty, bodyMarkup(), theLog()];
  });

  pinned('C8. a refusal in edit mode: the fallback of that mode', async () => {
    await draw({ editingProposal: PROPOSAL });
    fake.answers = [{ reject: {} }];
    await send();
    return [bodyMarkup(), theLog()];
  });

  pinned('C9. close blocked while sending: «Cancelar», the X and Escape do nothing', async () => {
    await draw();
    await fillAll();
    fake.answers = ['pending'];
    await send();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    await settle();
    const still = bodyMarkup();
    fake.pending?.reject(new Error('Rechazo inventado'));
    await settle();
    return [still, bodyMarkup(), theLog()];
  });

  pinned('C10. «Cancelar», the X and Escape reset the form and the error, and call onClose', async () => {
    await draw();
    await send();
    await type('titulo', 'Algo Escrito');
    await send();
    const before = bodyMarkup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await settle();
    const afterCancel = bodyMarkup();
    await type('titulo', 'Otra Vez');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await settle();
    await type('titulo', 'Y Otra');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    await settle();
    return [before, afterCancel, bodyMarkup(), theLog()];
  });

  pinned('C11. Enter in a text field sends the form (the first message shows)', async () => {
    await draw();
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    await u.type(field('titulo'), 'Título Inventado{Enter}');
    await settle();
    return [bodyMarkup(), theLog()];
  });

  pinned('C12. the proposal changing: create → edit → create; the form follows', async () => {
    await draw({ editingProposal: null });
    await type('titulo', 'Escrito En Crear');
    view.rerender(element({ editingProposal: PROPOSAL }));
    await settle();
    const editing = bodyMarkup();
    view.rerender(element({ editingProposal: null }));
    await settle();
    return [editing, bodyMarkup(), theLog()];
  });
});

it('the submit button is the form\'s own', async () => {
  await draw();
  expect(submitButton().form).toBe(document.body.querySelector('form'));
});

digestsFileHolds(12);
