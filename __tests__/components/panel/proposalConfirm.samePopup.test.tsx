// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(b): the confirmation «Eliminar Propuesta» gives a person the same thing in both
 * looks. Each case of the step-0 pin runs with `clasico` and with `nuevo`; what a person gets
 * (`personView`: texts with their count, buttons and the X with their state) and every `onConfirm` /
 * `onClose`, in order, must be equal. What may differ is the helper's one list, `LOOK_EXCEPTIONS`: the
 * new eyebrow «Confirmar» (taken out by where it stands, so the default confirm word «Confirmar» is
 * still counted). While loading the confirm button and the X differ (D8-X, left failing for the lead).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { closeX, inBothLooks, personView, settle, xApart } from '../../helpers/popups';

const fake = vi.hoisted(() => ({ look: 'clasico' as 'clasico' | 'nuevo', log: [] as unknown[] }));

vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: fake.look, setLook: () => {} }) }));

import { ConfirmDialog } from '@/components/course-proposals/ConfirmDialog';

const SECTION = {
  title: 'Eliminar Propuesta',
  description: '¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer.',
  confirmText: 'Eliminar',
  cancelText: 'Cancelar',
  variant: 'danger' as const,
};

function Holder(props: Partial<React.ComponentProps<typeof ConfirmDialog>>) {
  const [open, setOpen] = React.useState(true);
  return (
    <ConfirmDialog
      isOpen={open}
      onClose={() => {
        fake.log.push('onClose');
        setOpen(false);
      }}
      onConfirm={() => {
        fake.log.push('onConfirm');
      }}
      {...props}
    />
  );
}

// What a person gets; the exception (the eyebrow «Confirmar») is the helper's one list, `LOOK_EXCEPTIONS`.
const got = () => personView({ popup: 'confirm' });
let view: ReturnType<typeof render>;
async function draw(element: React.ReactElement) {
  view = render(element);
  await settle();
}
async function same(scenario: () => Promise<unknown[]>) {
  const results = await inBothLooks((look) => (fake.look = look), () => (fake.log = []), scenario, () => fake.log);
  expect(results.nuevo).toEqual(results.clasico);
}

describe('the confirmation «Eliminar Propuesta» in both looks: the same for a person', () => {
  it('D1–D3. closed; the section\'s texts; its own defaults; the variant «warning»', () => same(async () => {
    await draw(<ConfirmDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} {...SECTION} />);
    const closed = got();
    view.unmount();
    await draw(<Holder {...SECTION} isLoading={false} />);
    const section = got();
    view.unmount();
    await draw(<Holder />);
    const defaults = got();
    view.unmount();
    await draw(<Holder variant="warning" />);
    return [closed, section, defaults, got()];
  }));

  it('D4. «Cancelar» closes', () => same(async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await settle();
    return [got()];
  }));

  it('D5. the X closes', () => same(async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.click(closeX()!);
    await settle();
    return [got()];
  }));

  it('D6. Escape closes', () => same(async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    await settle();
    return [got()];
  }));

  it('D7. «Eliminar» calls onConfirm, then onClose: closed at once', () => same(async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await settle();
    return [got()];
  }));

  // While loading, «Cancelar» is disabled in both looks. «Eliminando...» and the X are compared in the
  // twin below: «Eliminar» is not a save or send button, so the one allowed difference of state does not
  // cover it. (The section closes this window on «Eliminar» before `isLoading` is set, so the panel never
  // shows this state.)
  it('D8. while loading: «Cancelar» disabled, «Eliminando...»', () => same(async () => {
    await draw(<Holder {...SECTION} isLoading />);
    const view = xApart(got());
    return [{ ...view, buttons: view.buttons.map((b) => (b.name === 'Eliminando...' ? { ...b, state: '«compared in D8-X»' } : b)) }];
  }));

  // REAL DIFFERENCES, left failing for the lead (send-back 1, point 2(c)): while loading, today's
  // «Eliminando...» is disabled and the new one is busy (not disabled); today's X (the older dialog's)
  // is drawn and enabled, and the kit's window with `dismissable={false}` draws none («absent»).
  it.fails('D8-X. while loading: «Eliminando...» disabled today, busy in the new look; the X enabled today, none in the new look (differs, for the lead)', () =>
    same(async () => {
      await draw(<Holder {...SECTION} isLoading />);
      return [got()];
    }));
});
