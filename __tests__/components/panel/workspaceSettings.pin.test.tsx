// @vitest-environment jsdom
/**
 * Redesign 6C, step 0: today's community settings pop-up (`components/community/WorkspaceSettingsModal`)
 * pinned in the look `clasico` BEFORE its logic moves into a hook and it gets a second markup. Each
 * case keeps one digest of the markup of the page body and of everything the pop-up did: every call
 * to the workspace service (with its arguments, in order), every toast, `onUpdate` and `onClose` with
 * their arguments, every error line (`workspaceSettings.pin.digests.json`; see `__tests__/helpers/pin.ts`
 * and `__tests__/helpers/popups.tsx`). Every community, image and address is invented.
 */
import React from 'react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePin, serialise } from '../../helpers/pin';
import { bodyMarkup, describeArg, fileOfSize, settle, smallPng } from '../../helpers/popups';

const fake = vi.hoisted(() => ({
  log: [] as unknown[],
  upload: [] as Array<{ url?: string; path?: string; error?: string } | 'pending' | 'reject'>,
  update: [] as Array<{ error: unknown } | 'pending' | 'reject'>,
  pending: null as null | { resolve: (value: unknown) => void },
}));

vi.mock('@/contexts/LookContext', () => ({ useLook: () => ({ look: 'clasico', setLook: () => {} }) }));
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

const { pinned, digestsFileHolds } = makePin(
  join(dirname(fileURLToPath(import.meta.url)), 'workspaceSettings.pin.digests.json'),
  'PANEL_WORKSPACE_SETTINGS'
);

const IMAGE = 'https://example.invalid/comunidad-inventada.png';
const theLog = () => serialise(fake.log);

let consoleError: { mockRestore: () => void } | null = null;
beforeEach(() => {
  fake.log = [];
  fake.upload = [];
  fake.update = [];
  fake.pending = null;
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
    onClose: (...args: unknown[]) => {
      fake.log.push({ onClose: args.map(describeArg) });
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
const buttons = () =>
  Array.from(document.body.querySelectorAll('button')).map((b) => ({ text: b.textContent, disabled: b.disabled }));

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

describe("today's community settings pop-up (WorkspaceSettingsModal), look clasico", () => {
  pinned('W1. closed: nothing drawn', async () => {
    await draw({ isOpen: false });
    return [bodyMarkup(), theLog()];
  });

  pinned('W2. open with a name and no image', async () => {
    await draw();
    return [bodyMarkup(), serialise(buttons()), theLog()];
  });

  pinned('W3. open with an image: the preview and its remove mark', async () => {
    await draw({ currentImageUrl: IMAGE });
    return [bodyMarkup(), theLog()];
  });

  pinned('W4. the name edited', async () => {
    await draw();
    await typeName('Comunidad Renombrada Inventada');
    return [bodyMarkup(), theLog()];
  });

  pinned('W5. a small PNG chosen: the preview shows it', async () => {
    await draw();
    await choose(smallPng());
    return [bodyMarkup(), theLog()];
  });

  pinned('W6. a file over 5 MB: the toast and nothing kept (saving uploads nothing)', async () => {
    await draw();
    await choose(fileOfSize('grande-inventada.png', 'image/png', 5 * 1024 * 1024 + 1));
    const after = bodyMarkup();
    await click(saveButton());
    return [after, bodyMarkup(), theLog()];
  });

  pinned('W7. a wrong type: the toast and nothing kept; exactly 5 MB is accepted', async () => {
    await draw();
    await choose(fileOfSize('animada-inventada.gif', 'image/gif', 2000));
    const wrong = bodyMarkup();
    await choose(fileOfSize('justa-inventada.jpg', 'image/jpg', 5 * 1024 * 1024));
    return [wrong, bodyMarkup(), theLog()];
  });

  pinned('W8. the image removed (the current one, then a chosen one)', async () => {
    await draw({ currentImageUrl: IMAGE });
    await click(removeMark());
    const removed = bodyMarkup();
    await choose(smallPng());
    await click(removeMark());
    const chosenRemoved = bodyMarkup();
    await click(saveButton());
    return [removed, chosenRemoved, serialise({ fileInputValue: fileInput().value }), theLog()];
  });

  pinned('W9. «Guardar cambios» disabled when the name is blank and there is no image', async () => {
    await draw({ currentName: '' });
    const states: unknown[] = [{ blank: saveButton().disabled }];
    await typeName('   ');
    states.push({ spaces: saveButton().disabled });
    await typeName('A');
    states.push({ letter: saveButton().disabled });
    await typeName('');
    await choose(smallPng());
    states.push({ blankWithChosenFile: saveButton().disabled });
    view.unmount();
    await draw({ currentName: '', currentImageUrl: IMAGE });
    states.push({ blankWithCurrentImage: saveButton().disabled });
    return [bodyMarkup(), serialise(states), theLog()];
  });

  pinned('W10. saving: the spinner, «Guardando...», both buttons and the X disabled', async () => {
    await draw();
    fake.update = ['pending'];
    await click(saveButton());
    const saving = bodyMarkup();
    const disabled = serialise(buttons());
    // a second click while saving does nothing
    fireEvent.click(saveButton());
    await settle();
    fake.pending?.resolve({ error: null });
    await settle();
    return [saving, disabled, bodyMarkup(), theLog()];
  });

  pinned('W11. saved without a new image: update only (name trimmed), the toast, onUpdate, onClose', async () => {
    await draw({ currentImageUrl: IMAGE });
    await typeName('  Comunidad Con Espacios  ');
    await click(saveButton());
    return [bodyMarkup(), theLog()];
  });

  pinned('W12. saved with a chosen image: the upload, then the update with its address and path', async () => {
    await draw({ currentImageUrl: IMAGE });
    await choose(smallPng());
    await click(saveButton());
    return [bodyMarkup(), theLog()];
  });

  pinned('W13. saved after the image was removed: an empty address', async () => {
    await draw({ currentImageUrl: IMAGE });
    await click(removeMark());
    await click(saveButton());
    return [theLog()];
  });

  pinned('W14. failed saves: the service\'s message or the fallback, the window stays', async () => {
    await draw();
    await choose(smallPng());
    fake.upload = [{ error: 'Error al subir la imagen' }, 'reject', { url: 'https://example.invalid/subida.png', path: 'p' }, { url: 'https://example.invalid/subida.png', path: 'p' }];
    fake.update = [{ error: { message: 'Fallo inventado de la base' } }, { error: {} }];
    await click(saveButton());
    await click(saveButton());
    await click(saveButton());
    await click(saveButton());
    return [bodyMarkup(), theLog()];
  });

  pinned('W15. currentName and currentImageUrl changing while open: copied, over an edit', async () => {
    await draw();
    await typeName('Editado A Mano');
    view.rerender(<WorkspaceSettingsModal {...propsWith({ currentName: 'Otro Nombre Inventado', currentImageUrl: IMAGE })} />);
    await settle();
    const changed = bodyMarkup();
    view.rerender(<WorkspaceSettingsModal {...propsWith({ currentName: 'Otro Nombre Inventado', currentImageUrl: undefined })} />);
    await settle();
    return [changed, bodyMarkup(), theLog()];
  });

  pinned('W16. Escape and a click on the veil do NOT close it; the X and «Cancelar» call onClose', async () => {
    await draw();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    const veil = view.container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(veil);
    fireEvent.mouseDown(veil);
    fireEvent.click(veil);
    await settle();
    const still = bodyMarkup();
    const all = document.body.querySelectorAll('button');
    await click(all[0]); // the X
    await click(screen.getByRole('button', { name: 'Cancelar' }));
    return [still, theLog()];
  });

  pinned('W17. reopened after closing: the state it had stays (the component is not unmounted)', async () => {
    await draw();
    await typeName('Nombre Sin Guardar');
    await choose(smallPng());
    view.rerender(<WorkspaceSettingsModal {...propsWith({ isOpen: false })} />);
    await settle();
    const closed = bodyMarkup();
    view.rerender(<WorkspaceSettingsModal {...propsWith({ isOpen: true })} />);
    await settle();
    return [closed, bodyMarkup(), theLog()];
  });
});

it('the pop-up is not drawn at all while closed (today it returns nothing)', async () => {
  await draw({ isOpen: false });
  expect(view.container.innerHTML).toBe('');
});

digestsFileHolds(17);
