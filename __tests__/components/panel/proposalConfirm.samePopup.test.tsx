// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(b): the confirmation «Eliminar Propuesta» gives a person the same thing in both
 * looks. Each case of the step-0 pin runs with `clasico` and with `nuevo`; what a person gets
 * (`personView`) and every `onConfirm` / `onClose`, in order, must be equal. Left out on purpose: the
 * new eyebrow «Confirmar» (which also hides the default confirm word «Confirmar» from the text set; the
 * buttons still compare it) and the X (today «Close» in hidden text, the kit's «Cerrar»).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { closeX, inBothLooks, personView, settle } from '../../helpers/popups';

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

const got = () => personView({ ignoreTexts: ['Confirmar', 'Close'] });
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

  it('D8. while loading: both buttons unavailable, «Eliminando...»', () => same(async () => {
    await draw(<Holder {...SECTION} isLoading />);
    return [got()];
  }));
});
