// @vitest-environment jsdom
/**
 * Redesign 6C, step 4(b): the community settings pop-up gives a person the same thing in both looks.
 * Each case of the step-0 pin runs once with the look `clasico` and once with `nuevo`, and what a
 * person gets (`personView`: texts with their count, fields, buttons and the X with their state,
 * links, pictures) and everything the pop-up did (service calls with their arguments, toasts,
 * `onUpdate`, `onClose`, error lines) must be equal. What may differ is the helper's one list,
 * `LOOK_EXCEPTIONS` (the eyebrow, the remove mark's new name, «Subir imagen» as a button, the save
 * button busy instead of disabled while saving, no X while saving). Escape and the veil close the new
 * window on purpose: tested in `popupsNuevo.test.tsx`. The X while saving is a decided difference
 * (W10-X asserts it as it is, in each look).
 * Every community and image is invented.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeX, fileOfSize, inBothLooks, LOOK_EXCEPTIONS, personView, settle, smallPng, stateOf } from '../../helpers/popups';

const fake = vi.hoisted(() => ({
  look: 'clasico' as 'clasico' | 'nuevo',
  log: [] as unknown[],
  upload: [] as Array<{ url?: string; path?: string; error?: string } | 'pending' | 'reject'>,
  update: [] as Array<{ error: unknown } | 'pending' | 'reject'>,
  pending: null as null | { resolve: (value: unknown) => void },
}));

vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: fake.look, setLook: () => {} }) }));
vi.mock('react-hot-toast', () => {
  const toast = {
    success: (message: unknown) => fake.log.push({ 'toast.success': message }),
    error: (message: unknown) => fake.log.push({ 'toast.error': message }),
  };
  return { toast, default: toast };
});
vi.mock('@/lib/services/communityWorkspace', () => ({
  communityWorkspaceService: {
    uploadCommunityImage: (...args: unknown[]) => {
      fake.log.push({ uploadCommunityImage: args.map((arg) => (arg instanceof File ? { file: arg.name, type: arg.type, size: arg.size } : arg)) });
      const answer = fake.upload.shift() ?? { url: 'https://example.invalid/subida.png', path: 'ws-inventado/subida.png' };
      if (answer === 'pending') return new Promise((resolve) => (fake.pending = { resolve }));
      if (answer === 'reject') return Promise.reject(new Error('Fallo de red inventado'));
      return Promise.resolve(answer);
    },
    updateWorkspaceSettings: (...args: unknown[]) => {
      fake.log.push({ updateWorkspaceSettings: args });
      const answer = fake.update.shift() ?? { error: null };
      if (answer === 'pending') return new Promise((resolve) => (fake.pending = { resolve }));
      if (answer === 'reject') return Promise.reject(new Error('Fallo de red inventado'));
      return Promise.resolve(answer);
    },
  },
}));

import WorkspaceSettingsModal from '@/components/community/WorkspaceSettingsModal';

const IMAGE = 'https://example.invalid/comunidad-inventada.png';

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation((first: unknown, ...more: unknown[]) => {
    if (typeof first === 'string' && !first.startsWith('Warning:')) {
      fake.log.push({ 'console.error': [first, ...more.map((m) => (m instanceof Error ? `Error: ${m.message}` : m))] });
    }
  });
});
afterEach(() => {
  consoleError?.mockRestore();
});

type Props = Partial<React.ComponentProps<typeof WorkspaceSettingsModal>>;
let view: ReturnType<typeof render>;
function propsWith(over: Props = {}): React.ComponentProps<typeof WorkspaceSettingsModal> {
  return {
    isOpen: true,
    onClose: () => {
      fake.log.push('onClose');
    },
    workspaceId: 'ws-inventado',
    currentName: 'Comunidad Inventada',
    currentImageUrl: undefined,
    onUpdate: (...args: unknown[]) => {
      fake.log.push({ onUpdate: args });
    },
    ...over,
  };
}
async function draw(over: Props = {}) {
  view = render(<WorkspaceSettingsModal {...propsWith(over)} />);
  await settle();
}

const nameField = () => screen.getByPlaceholderText('Ingresa un nombre personalizado') as HTMLInputElement;
const fileInput = () => document.getElementById('community-image-upload') as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: /Guardar cambios|Guardando/ }) as HTMLButtonElement;
const removeMark = () => document.querySelector('img[alt="Vista previa"] + button') as HTMLButtonElement | null;

// What a person gets; the exceptions (eyebrow, the remove mark's name, «Subir imagen», the save button
// while saving) are the helper's one list, `LOOK_EXCEPTIONS`.
const got = () => personView({ popup: 'settings' });

async function choose(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await settle();
}
async function typeName(value: string) {
  fireEvent.change(nameField(), { target: { value } });
  await settle();
}
async function click(element: Element | null) {
  if (!element) throw new Error('nothing to click');
  fireEvent.click(element);
  await settle();
}

/** The same scenario in each look, nothing compared. */
function both<T>(scenario: () => Promise<T>) {
  return inBothLooks(
    (look) => (fake.look = look),
    () => {
      fake.log = [];
      fake.upload = [];
      fake.update = [];
      fake.pending = null;
    },
    scenario,
    () => fake.log
  );
}

async function same(scenario: () => Promise<unknown[]>) {
  const results = await both(scenario);
  expect(results.nuevo).toEqual(results.clasico);
  return results;
}

describe('the community settings pop-up in both looks: the same for a person', () => {
  it('W1. closed', () => same(async () => {
    await draw({ isOpen: false });
    return [got()];
  }));

  it('W2/W3. open with a name, with and without an image', () => same(async () => {
    await draw();
    const without = got();
    view.unmount();
    await draw({ currentImageUrl: IMAGE });
    return [without, got()];
  }));

  it('W4/W5. the name edited, a PNG chosen', () => same(async () => {
    await draw();
    await typeName('Comunidad Renombrada Inventada');
    const edited = got();
    await choose(smallPng());
    return [edited, got()];
  }));

  it('W6/W7. too big, wrong type, exactly 5 MB', () => same(async () => {
    await draw();
    await choose(fileOfSize('grande-inventada.png', 'image/png', 5 * 1024 * 1024 + 1));
    const big = got();
    await choose(fileOfSize('animada-inventada.gif', 'image/gif', 2000));
    const wrong = got();
    await choose(fileOfSize('justa-inventada.jpg', 'image/jpg', 5 * 1024 * 1024));
    return [big, wrong, got()];
  }));

  it('W8/W13. the image removed, then saved', () => same(async () => {
    await draw({ currentImageUrl: IMAGE });
    await click(removeMark());
    const removed = got();
    await choose(smallPng());
    await click(removeMark());
    const chosenRemoved = got();
    await click(saveButton());
    return [removed, chosenRemoved, { fileInputValue: fileInput().value }, got()];
  }));

  it('W9. «Guardar cambios» disabled when the name is blank and there is no image', () => same(async () => {
    await draw({ currentName: '' });
    const states: unknown[] = [got()];
    await typeName('   ');
    states.push(got());
    await typeName('A');
    states.push(got());
    await typeName('');
    await choose(smallPng());
    states.push(got());
    view.unmount();
    await draw({ currentName: '', currentImageUrl: IMAGE });
    states.push(got());
    return states;
  }));

  // While saving, «Cancelar» is disabled in both looks and «Guardar cambios» reads «Guardando...»,
  // disabled today and busy in the new look (the one allowed difference of state). The X is compared in
  // W10-X.
  async function saving(view: () => unknown) {
    await draw();
    fake.update = ['pending'];
    await click(saveButton());
    const during = view();
    fireEvent.click(saveButton());
    await settle();
    fake.pending?.resolve({ error: null });
    await settle();
    return [during, got()];
  }

  it('W10. saving: «Guardando...», both buttons unavailable; a second click does nothing', () => same(() => saving(got)));

  // A DECIDED DIFFERENCE (send-back 2, `LOOK_EXCEPTIONS.noXWhileWorking`): while saving, today's X is
  // drawn and disabled; the kit's window with `dismissable={false}` draws no X at all.
  it('W10-X. saving: today the X is drawn and disabled; the new look draws no X', async () => {
    const results = await both(() => saving(() => stateOf(closeX())));
    expect(results.clasico.got[0]).toBe('disabled');
    expect(results.nuevo.got[0]).toBe('absent');
    expect(LOOK_EXCEPTIONS.noXWhileWorking.today.settings).toBe(results.clasico.got[0]);
    expect(LOOK_EXCEPTIONS.noXWhileWorking.nuevo).toBe(results.nuevo.got[0]);
    // Once saved, both looks give a person the same again (as W10).
    expect(results.clasico.got[1]).toEqual(results.nuevo.got[1]);
  });

  it('W11/W12. saved without and with a chosen image', () => same(async () => {
    await draw({ currentImageUrl: IMAGE });
    await typeName('  Comunidad Con Espacios  ');
    await click(saveButton());
    view.unmount();
    await draw({ currentImageUrl: IMAGE });
    await choose(smallPng());
    await click(saveButton());
    return [got()];
  }));

  it('W14. failed saves: the message or the fallback, the window stays', () => same(async () => {
    await draw();
    await choose(smallPng());
    fake.upload = [{ error: 'Error al subir la imagen' }, 'reject', { url: 'https://example.invalid/subida.png', path: 'p' }, { url: 'https://example.invalid/subida.png', path: 'p' }];
    fake.update = [{ error: { message: 'Fallo inventado de la base' } }, { error: {} }];
    await click(saveButton());
    await click(saveButton());
    await click(saveButton());
    await click(saveButton());
    return [got()];
  }));

  it('W15. currentName and currentImageUrl changing while open', () => same(async () => {
    await draw();
    await typeName('Editado A Mano');
    view.rerender(<WorkspaceSettingsModal {...propsWith({ currentName: 'Otro Nombre Inventado', currentImageUrl: IMAGE })} />);
    await settle();
    const changed = got();
    view.rerender(<WorkspaceSettingsModal {...propsWith({ currentName: 'Otro Nombre Inventado', currentImageUrl: undefined })} />);
    await settle();
    return [changed, got()];
  }));

  it('W16. the X and «Cancelar» call onClose', () => same(async () => {
    await draw();
    await click(closeX() ?? document.body.querySelector('button'));
    await click(screen.getByRole('button', { name: 'Cancelar' }));
    return [got()];
  }));

  it('W17. closed and reopened: the state stays', () => same(async () => {
    await draw();
    await typeName('Nombre Sin Guardar');
    await choose(smallPng());
    view.rerender(<WorkspaceSettingsModal {...propsWith({ isOpen: false })} />);
    await settle();
    const closed = got();
    view.rerender(<WorkspaceSettingsModal {...propsWith({ isOpen: true })} />);
    await settle();
    return [closed, got()];
  }));
});
