// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(b): the confirmation «Eliminar Propuesta» gives a person the same thing in both
 * looks. Each case of the step-0 pin runs with `clasico` and with `nuevo`; what a person gets
 * (`personView`: texts with their count, buttons and the X with their state) and every `onConfirm` /
 * `onClose`, in order, must be equal. What may differ is the helper's one list, `LOOK_EXCEPTIONS`: the
 * new eyebrow «Confirmar» (taken out by where it stands, so the default confirm word «Confirmar» is
 * still counted), and while loading «Eliminando...» busy instead of disabled and no X: decided
 * differences, asserted as they are in each look by D8-X.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { closeX, inBothLooks, LOOK_EXCEPTIONS, personView, settle, stateOf } from '../../helpers/popups';

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
/** The same scenario in each look, nothing compared. */
function both<T>(scenario: () => Promise<T>) {
  return inBothLooks((look) => (fake.look = look), () => (fake.log = []), scenario, () => fake.log);
}

async function same(scenario: () => Promise<unknown[]>) {
  const results = await both(scenario);
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

  // While loading, «Cancelar» is disabled in both looks; «Eliminando...» and the X are the decided
  // differences of D8-X (`LOOK_EXCEPTIONS.working` and `noXWhileWorking`). (The section closes this
  // window on «Eliminar» before `isLoading` is set, so the panel never shows this state.)
  it('D8. while loading: «Cancelar» disabled, «Eliminando...»', () => same(async () => {
    await draw(<Holder {...SECTION} isLoading />);
    return [got()];
  }));

  // DECIDED DIFFERENCES (send-back 2): while loading, today's «Eliminando...» is disabled and the new
  // one is busy (the kit's Button with `loading`); today's X (the older dialog's) is drawn and enabled,
  // and the kit's window with `dismissable={false}` draws none.
  it('D8-X. while loading: «Eliminando...» disabled today, busy in the new look; the X enabled today, none in the new look', async () => {
    const results = await both(async () => {
      await draw(<Holder {...SECTION} isLoading />);
      const deleting = Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Eliminando...');
      return { deleting: stateOf(deleting), x: stateOf(closeX()) };
    });
    expect(results.clasico.got).toEqual({ deleting: 'disabled', x: 'enabled' });
    expect(['busy', 'disabled, busy']).toContain(results.nuevo.got.deleting);
    expect(results.nuevo.got.x).toBe('absent');
    expect(LOOK_EXCEPTIONS.working.names.confirm).toBe('Eliminando...');
    expect(LOOK_EXCEPTIONS.noXWhileWorking.today.confirm).toBe(results.clasico.got.x);
    expect(LOOK_EXCEPTIONS.noXWhileWorking.nuevo).toBe(results.nuevo.got.x);
    expect(results.nuevo.log).toEqual(results.clasico.log);
  });
});
