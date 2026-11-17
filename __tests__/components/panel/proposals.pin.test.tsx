// @vitest-environment jsdom
/**
 * Redesign 6B, step 0: today's «Propuestas de Cursos» (`CourseProposalSection`, with the real
 * `CourseProposalCard`) pinned BEFORE its state and handlers move into `useCourseProposals()` and
 * the card's words into a module both looks import. The form (`CourseProposalModal`) and the
 * confirmation (`course-proposals/ConfirmDialog`) are not edited by 6B: they are replaced by markers
 * that print the props the section gives them, and the cases call those props as the pop-ups would.
 * Each case keeps one digest of the markup and of every request (method, address, body), every
 * `alert` and every error line (`proposals.pin.digests.json`; see `__tests__/helpers/pin.ts`).
 * Every person and proposal is invented.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../helpers/pin';

vi.hoisted(() => {
  process.env.TZ = 'UTC';
});

const fake = vi.hoisted(() => ({
  log: [] as unknown[],
  props: {} as Record<string, any>,
  answers: [] as Array<{ status?: number; body?: unknown } | 'reject' | 'pending'>,
}));

function describeProps(props: Record<string, unknown>): string {
  const rest = { ...props };
  delete rest.children;
  return JSON.stringify(rest, (_key, value) =>
    value === undefined ? '«undefined»' : typeof value === 'function' ? '«function»' : value
  );
}

vi.mock('@/components/course-proposals/CourseProposalModal', () => ({
  CourseProposalModal: (props: any) => {
    fake.props.CourseProposalModal = props;
    return <div data-marker="CourseProposalModal" data-props={describeProps(props)} />;
  },
}));
vi.mock('@/components/course-proposals/ConfirmDialog', () => ({
  ConfirmDialog: (props: any) => {
    fake.props.ConfirmDialog = props;
    return <div data-marker="ConfirmDialog" data-props={describeProps(props)} />;
  },
}));

import { CourseProposalSection } from '@/components/course-proposals/CourseProposalSection';

const { pinned, digestsFileHolds } = makePin(
  join(dirname(fileURLToPath(import.meta.url)), 'proposals.pin.digests.json'),
  'PANEL_PROPOSALS'
);

function fakeFetch(url: string, init?: Record<string, unknown>) {
  fake.log.push(init === undefined ? { fetch: url } : { fetch: url, init: describeProps(init) });
  const answer = fake.answers.shift() ?? { status: 200, body: { data: [] } };
  if (answer === 'reject') return Promise.reject(new TypeError('Synthetic network failure'));
  if (answer === 'pending') return new Promise(() => {});
  const status = answer.status ?? 200;
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(answer.body) });
}

const VIEWER = 'user-consultor';
const proposal = (n: number, over: Record<string, unknown> = {}) => ({
  id: `prop-${n}`,
  titulo: `Propuesta Inventada ${n}`,
  descripcion_corta: `Descripción inventada ${n}`,
  competencias_desarrollar: `Competencias inventadas ${n}`,
  tiempo_requerido_desarrollo: `${n} semanas`,
  necesita_ayuda_diseno_instruccional: false,
  created_by: 'user-otro',
  created_at: `2026-10-0${n}T15:00:00Z`,
  updated_at: `2026-10-0${n}T15:00:00Z`,
  status: 'pending',
  creator: { first_name: 'Persona', last_name: `Inventada ${n}`, email: `persona${n}@example.invalid` },
  ...over,
});

const FILLED = [
  proposal(1, { created_by: VIEWER, necesita_ayuda_diseno_instruccional: true }),
  proposal(2, { status: 'reviewed', creator: { first_name: '', last_name: '', email: 'solo-correo@example.invalid' } }),
  proposal(3, { status: 'approved', creator: undefined }),
  proposal(4, { status: 'rejected', created_by: VIEWER, creator: { first_name: 'Solo', last_name: '', email: 'x@example.invalid' } }),
  proposal(5, { status: 'archivada' }),
];

const FORM = {
  titulo: 'Propuesta Nueva Inventada',
  descripcion_corta: 'Una descripción',
  competencias_desarrollar: 'Unas competencias',
  tiempo_requerido_desarrollo: '1 mes',
  necesita_ayuda_diseno_instruccional: true,
};

let view: ReturnType<typeof render>;
const markup = () => serialise(view.asFragment());
const theLog = () => serialise(fake.log);

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}
async function call(fn: () => unknown) {
  await act(async () => {
    try {
      await fn();
    } catch (error) {
      fake.log.push({ thrown: (error as Error).message });
    }
  });
  await settle();
}
async function click(element: Element | null) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  fake.log = [];
  fake.props = {};
  fake.answers = [];
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  vi.stubGlobal('alert', vi.fn((message: unknown) => fake.log.push({ alert: message })));
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) fake.log.push({ 'console.error': first });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  consoleError?.mockRestore();
});

async function draw(userId: string | undefined = VIEWER) {
  view = render(<CourseProposalSection userId={userId} />);
  await settle();
}

describe("today's «Propuestas de Cursos» (CourseProposalSection)", () => {
  pinned('P1. loading', async () => {
    fake.answers = ['pending'];
    await draw();
    return [markup(), theLog()];
  });

  pinned('P2. the error banner and «Reintentar» (asks again, then the list)', async () => {
    fake.answers = [{ status: 403, body: { error: 'Solo administradores y consultores pueden ver propuestas' } }, { body: { data: [proposal(1)] } }];
    await draw();
    const banner = markup();
    await click(screen.getByRole('button', { name: 'Reintentar' }));
    return [banner, markup(), theLog()];
  });

  pinned('P3. errors without a message: a refusal without text, a network failure', async () => {
    fake.answers = [{ status: 500, body: {} }, 'reject'];
    await draw();
    const refusal = markup();
    await click(screen.getByRole('button', { name: 'Reintentar' }));
    return [refusal, markup(), theLog()];
  });

  pinned('P4. empty: «Sin propuestas aún»; «Crear Propuesta» opens the form in create mode', async () => {
    fake.answers = [{ body: { data: [] } }];
    await draw();
    const empty = markup();
    await click(screen.getByRole('button', { name: /Crear Propuesta/ }));
    return [empty, markup(), theLog()];
  });

  pinned('P5. an answer without data: the empty state', async () => {
    fake.answers = [{ body: {} }];
    await draw();
    return [markup(), theLog()];
  });

  pinned('P6. filled: own and others\' cards, the four states and an unknown one, the creator fallbacks', async () => {
    fake.answers = [{ body: { data: FILLED } }];
    await draw();
    return [markup(), theLog()];
  });

  pinned('P7. without a viewer: no card is the viewer\'s own', async () => {
    fake.answers = [{ body: { data: FILLED } }];
    await draw(undefined);
    return [markup()];
  });

  pinned('P8. «Nueva Propuesta», submit in create mode (POST), the list after it, close', async () => {
    fake.answers = [{ body: { data: FILLED.slice(0, 2) } }];
    await draw();
    await click(screen.getByRole('button', { name: /Nueva Propuesta/ }));
    const opened = markup();
    fake.answers = [{ status: 201, body: { data: proposal(9, { titulo: FORM.titulo, created_by: VIEWER }) } }];
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    const after = markup();
    await call(() => fake.props.CourseProposalModal.onClose());
    return [opened, after, markup(), theLog()];
  });

  pinned('P9. create refused (thrown to the form, with and without a message); an answer without data', async () => {
    fake.answers = [{ body: { data: FILLED.slice(0, 1) } }];
    await draw();
    await click(screen.getByRole('button', { name: /Nueva Propuesta/ }));
    fake.answers = [{ status: 400, body: { error: 'Título requerido' } }, { status: 500, body: {} }, { status: 201, body: {} }];
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    return [markup(), theLog()];
  });

  pinned('P10. the pencil: edit mode with the card\'s values, submit (PUT), refusals, close', async () => {
    fake.answers = [{ body: { data: FILLED.slice(0, 2) } }];
    await draw();
    await click(screen.getAllByTitle('Editar propuesta')[0]);
    const opened = markup();
    fake.answers = [
      { body: { data: { ...FILLED[0], titulo: 'Propuesta Editada Inventada' } } },
      { status: 403, body: { error: 'No autorizado' } },
      { status: 500, body: {} },
      { body: {} },
    ];
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    const after = markup();
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    await call(() => fake.props.CourseProposalModal.onSubmit(FORM));
    await call(() => fake.props.CourseProposalModal.onClose());
    return [opened, after, markup(), theLog()];
  });

  pinned('P11. the bin, the confirmation, DELETE, the card gone', async () => {
    fake.answers = [{ body: { data: FILLED } }];
    await draw();
    await click(screen.getAllByTitle('Eliminar propuesta')[1]);
    const asking = markup();
    fake.answers = [{ body: { success: true } }];
    await call(() => fake.props.ConfirmDialog.onConfirm());
    return [asking, markup(), theLog()];
  });

  pinned('P12. a failed deletion: the browser\'s alert with the message (and without), the question stays', async () => {
    fake.answers = [{ body: { data: FILLED } }];
    await draw();
    await click(screen.getAllByTitle('Eliminar propuesta')[0]);
    fake.answers = [{ status: 403, body: { error: 'No puedes eliminar esta propuesta' } }, { status: 500, body: {} }, 'reject'];
    await call(() => fake.props.ConfirmDialog.onConfirm());
    await call(() => fake.props.ConfirmDialog.onConfirm());
    await call(() => fake.props.ConfirmDialog.onConfirm());
    return [markup(), theLog()];
  });

  pinned('P13. cancel: the question closes and a later confirm asks nothing', async () => {
    fake.answers = [{ body: { data: FILLED } }];
    await draw();
    await click(screen.getAllByTitle('Eliminar propuesta')[0]);
    await call(() => fake.props.ConfirmDialog.onClose());
    await call(() => fake.props.ConfirmDialog.onConfirm());
    return [markup(), theLog()];
  });

  pinned('P14. a deletion still waiting: the confirmation is loading', async () => {
    fake.answers = [{ body: { data: FILLED } }];
    await draw();
    await click(screen.getAllByTitle('Eliminar propuesta')[0]);
    fake.answers = ['pending'];
    await act(async () => {
      void fake.props.ConfirmDialog.onConfirm();
    });
    await settle();
    return [markup(), theLog()];
  });
});

it('the list is asked once on mount', async () => {
  await draw();
  expect(fake.log.filter((e: any) => e.fetch)).toEqual([{ fetch: '/api/course-proposals' }]);
});

digestsFileHolds(14);
