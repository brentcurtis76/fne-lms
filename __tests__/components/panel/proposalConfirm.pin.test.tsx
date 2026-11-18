// @vitest-environment jsdom
/**
 * Redesign 6C, step 0: today's confirmation «Eliminar Propuesta» (`components/course-proposals/ConfirmDialog`)
 * pinned in the look `clasico` BEFORE it gets a second markup. Each case keeps one digest of the
 * markup of the page body and of every `onConfirm` / `onClose` call, in order
 * (`proposalConfirm.pin.digests.json`; see `__tests__/helpers/pin.ts` and `__tests__/helpers/popups.tsx`).
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../helpers/pin';
import { bodyMarkup, settle } from '../../helpers/popups';

const fake = vi.hoisted(() => ({ log: [] as unknown[] }));

vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: 'clasico', setLook: () => {} }) }));

import { ConfirmDialog } from '@/components/course-proposals/ConfirmDialog';

const { pinned, digestsFileHolds } = makePin(
  join(dirname(fileURLToPath(import.meta.url)), 'proposalConfirm.pin.digests.json'),
  'PANEL_PROPOSAL_CONFIRM'
);

const theLog = () => serialise(fake.log);

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  fake.log = [];
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) fake.log.push({ 'console.error': first });
  });
});
afterEach(() => {
  consoleError?.mockRestore();
});

/** The texts «Propuestas de Cursos» passes (CourseProposalSection and ProposalsNuevo). */
const SECTION = {
  title: 'Eliminar Propuesta',
  description: '¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer.',
  confirmText: 'Eliminar',
  cancelText: 'Cancelar',
  variant: 'danger' as const,
};

/** Holds `isOpen` as the section does: `onClose` closes it. */
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

let view: ReturnType<typeof render>;
async function draw(element: React.ReactElement) {
  view = render(element);
  await settle();
}

describe("today's confirmation «Eliminar Propuesta» (course-proposals/ConfirmDialog), look clasico", () => {
  pinned('D1. closed: nothing drawn', async () => {
    await draw(<ConfirmDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} {...SECTION} />);
    return [bodyMarkup(), theLog()];
  });

  pinned('D2. with the section\'s texts', async () => {
    await draw(<Holder {...SECTION} isLoading={false} />);
    return [bodyMarkup(), theLog()];
  });

  pinned('D3. with its own defaults; the variant «warning»', async () => {
    await draw(<Holder />);
    const defaults = bodyMarkup();
    view.unmount();
    await draw(<Holder variant="warning" />);
    return [defaults, bodyMarkup(), theLog()];
  });

  pinned('D4. «Cancelar» closes', async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await settle();
    return [bodyMarkup(), theLog()];
  });

  pinned('D5. the X closes', async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await settle();
    return [bodyMarkup(), theLog()];
  });

  pinned('D6. Escape closes', async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    await settle();
    return [bodyMarkup(), theLog()];
  });

  pinned('D7. «Eliminar» calls onConfirm and closes at once', async () => {
    await draw(<Holder {...SECTION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await settle();
    return [bodyMarkup(), theLog()];
  });

  pinned('D8. while loading (never seen on the panel): both buttons disabled, «Eliminando...»', async () => {
    await draw(<Holder {...SECTION} isLoading />);
    return [bodyMarkup(), theLog()];
  });
});

it('nothing is drawn while closed', async () => {
  await draw(<ConfirmDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} />);
  expect(document.body.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
});

// What an earlier test file leaves on the shared <body> (6C, send-back 2: a scroll style written by
// another modal made every case of this file fail in the whole suite) never reaches a case.
it('a leftover on <body>, left here as an earlier file would leave it, …', () => {
  document.body.style.overflow = 'unset';
  document.body.setAttribute('data-left-behind', 'yes');
  document.body.appendChild(document.createElement('aside'));
  expect(document.body.getAttributeNames().sort()).toEqual(['data-left-behind', 'style']);
});

it('… is gone before the next case starts', () => {
  expect(document.body.getAttributeNames()).toEqual([]);
  expect(document.body.childNodes.length).toBe(0);
});

digestsFileHolds(8);
