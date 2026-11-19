// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * EC-V1b + N92 + N127 (GENERA fixes F12c): «Configuración de la Comunidad».
 * Any member renames the community (owner decision 17 Nov 2026); the picture
 * stays with admins and the community's manager. A save sends the name only
 * when it was changed and the picture only when one was chosen or removed, so
 * saving a picture alone never copies «Espacio de …» into the name (N92).
 * Synthetic data only.
 */

const h = vi.hoisted(() => ({
  renameWorkspace: vi.fn(),
  updateWorkspaceSettings: vi.fn(),
  getWorkspaceSettings: vi.fn(),
  uploadCommunityImage: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({ toast: h.toast, default: h.toast }));
vi.mock('../../../lib/services/communityWorkspace', () => ({
  communityWorkspaceService: {
    renameWorkspace: (...args: unknown[]) => h.renameWorkspace(...args),
    updateWorkspaceSettings: (...args: unknown[]) => h.updateWorkspaceSettings(...args),
    getWorkspaceSettings: (...args: unknown[]) => h.getWorkspaceSettings(...args),
    uploadCommunityImage: (...args: unknown[]) => h.uploadCommunityImage(...args),
  },
}));

import WorkspaceSettingsModal from '../../../components/community/WorkspaceSettingsModal';

const WS = 'ws-a';
const DEFAULT_NAME = 'Espacio de Comunidad A';
const PICTURE = 'https://example.test/a.png';

function open(extra: Record<string, unknown> = {}) {
  const onUpdate = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <WorkspaceSettingsModal
      isOpen
      onClose={onClose}
      workspaceId={WS}
      currentName={DEFAULT_NAME}
      currentImageUrl={PICTURE}
      onUpdate={onUpdate}
      {...extra}
    />
  );
  const nameField = utils.getByPlaceholderText('Ingresa un nombre personalizado') as HTMLInputElement;
  const save = utils.getByText('Guardar cambios').closest('button') as HTMLButtonElement;
  return { ...utils, onUpdate, onClose, nameField, save };
}

class InstantFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  readAsDataURL() {
    this.result = 'data:image/png;base64,AAAA';
    this.onloadend?.();
  }
}

async function choosePicture(container: HTMLElement) {
  const input = container.querySelector('#community-image-upload') as HTMLInputElement;
  const file = new File(['png'], 'nueva.png', { type: 'image/png' });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  return file;
}

let stored: { custom_name: string | null; image_url: string | null };

beforeEach(() => {
  h.updateWorkspaceSettings = vi.fn(async () => ({ data: { id: WS }, error: null }));
  // What the database holds after the writes (a workspace never renamed, until a test says otherwise).
  stored = { custom_name: null, image_url: PICTURE };
  h.getWorkspaceSettings = vi.fn(async () => ({ data: { ...stored }, error: null }));
  h.renameWorkspace = vi.fn(async (_ws: string, name: string) => {
    stored.custom_name = name;
    return { error: null };
  });
  h.updateWorkspaceSettings = vi.fn(async (_ws: string, updates: { imageUrl?: string }) => {
    stored.image_url = updates.imageUrl || null;
    return { data: { id: WS }, error: null };
  });
  h.uploadCommunityImage = vi.fn(async () => ({ url: 'https://example.test/nueva.png', path: 'community-images/nueva.png', error: null }));
  h.toast.success.mockClear();
  h.toast.error.mockClear();
  vi.stubGlobal('FileReader', InstantFileReader);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('N92 a save with only a new picture sends no name', () => {
  it('uploads and saves the picture; the name is not sent anywhere', async () => {
    const { container, save, onUpdate } = open();
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(h.updateWorkspaceSettings).toHaveBeenCalledTimes(1));
    const [, updates] = h.updateWorkspaceSettings.mock.calls[0] as [string, Record<string, unknown>];
    expect(updates).not.toHaveProperty('customName');
    expect(updates).toMatchObject({ imageUrl: 'https://example.test/nueva.png', imageStoragePath: 'community-images/nueva.png' });
    expect(h.renameWorkspace).not.toHaveBeenCalled();
    // The stored custom_name is empty: no name is reported (send-back 1, item 3), never «Espacio de …».
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ customName: undefined, imageUrl: 'https://example.test/nueva.png' });
  });

  it('removing the picture saves only the picture', async () => {
    const { container, save } = open();
    const remove = container.querySelector('img[alt="Vista previa"] + button') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(remove);
    });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(h.updateWorkspaceSettings).toHaveBeenCalledTimes(1));
    const [, updates] = h.updateWorkspaceSettings.mock.calls[0] as [string, Record<string, unknown>];
    expect(updates).not.toHaveProperty('customName');
    expect(updates.imageUrl).toBe('');
    expect(h.renameWorkspace).not.toHaveBeenCalled();
  });
});

describe('EC-V1 send-back 1: after a save the window reports what is stored', () => {
  it('a picture-only save in a workspace never renamed reports NO name and the stored picture', async () => {
    const { container, save, onUpdate } = open();
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(h.getWorkspaceSettings).toHaveBeenCalledWith(WS);
    const [reported] = onUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(reported.customName).toBeUndefined();
    expect(reported.imageUrl).toBe('https://example.test/nueva.png');
  });

  it('a picture-only save in a renamed workspace reports the stored custom name', async () => {
    stored.custom_name = 'Comunidad Lectora';
    const { container, save, onUpdate } = open({ currentName: 'Comunidad Lectora' });
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Comunidad Lectora', imageUrl: 'https://example.test/nueva.png' });
  });

  it('the stored values win over what the window holds (the database stored a different form)', async () => {
    h.renameWorkspace = vi.fn(async () => {
      stored.custom_name = 'Nombre guardado';
      return { error: null };
    });
    const { nameField, save, onUpdate } = open();
    fireEvent.change(nameField, { target: { value: 'Nombre escrito' } });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Nombre guardado', imageUrl: PICTURE });
  });

  it('a removed picture is reported as none (undefined)', async () => {
    const { container, save, onUpdate } = open();
    const remove = container.querySelector('img[alt="Vista previa"] + button') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(remove);
    });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith({ customName: undefined, imageUrl: undefined });
  });

  it('read-back fails twice after a picture-only save: the saved picture, and the name the window was opened with', async () => {
    h.getWorkspaceSettings = vi.fn(async () => ({ data: null, error: new Error('offline') }));
    const { container, save, onUpdate, onClose } = open();
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    // Send-back 2, item 2: the name not saved is reported as the window was opened with it.
    expect(onUpdate).toHaveBeenCalledWith({ customName: DEFAULT_NAME, imageUrl: 'https://example.test/nueva.png' });
    expect(onClose).toHaveBeenCalled();
  });

  it('read-back fails after a name-only save: the saved name, and the picture the window was opened with', async () => {
    h.getWorkspaceSettings = vi.fn(async () => ({ data: null, error: new Error('offline') }));
    const { nameField, save, onUpdate } = open();
    fireEvent.change(nameField, { target: { value: 'Comunidad Lectora' } });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Comunidad Lectora', imageUrl: PICTURE });
  });

  it('send-back 2: a picture-only save whose read-back fails keeps the existing custom name on the screen', async () => {
    h.getWorkspaceSettings = vi.fn(async () => ({ data: null, error: new Error('offline') }));
    const { container, save, onUpdate } = open({ currentName: 'Comunidad Lectora' });
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Comunidad Lectora', imageUrl: 'https://example.test/nueva.png' });
    expect(h.getWorkspaceSettings).toHaveBeenCalledTimes(2);
  });

  it('send-back 2: a name-only save of «  Nueva  » whose read-back fails reports «Nueva» (trimmed)', async () => {
    h.getWorkspaceSettings = vi.fn(async () => ({ data: null, error: new Error('offline') }));
    const { nameField, save, onUpdate } = open({ currentName: 'Comunidad Lectora' });
    fireEvent.change(nameField, { target: { value: '  Nueva  ' } });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(h.renameWorkspace).toHaveBeenCalledWith(WS, 'Nueva');
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Nueva', imageUrl: PICTURE });
    expect(h.getWorkspaceSettings).toHaveBeenCalledTimes(2);
  });

  it('send-back 2: a read-back that fails once is tried again, and the stored values are reported', async () => {
    stored.custom_name = 'Comunidad Lectora';
    let calls = 0;
    h.getWorkspaceSettings = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? { data: null, error: new Error('offline') } : { data: { ...stored }, error: null };
    });
    const { container, save, onUpdate } = open({ currentName: 'Comunidad Lectora' });
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(h.getWorkspaceSettings).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Comunidad Lectora', imageUrl: 'https://example.test/nueva.png' });
  });

  it('picture saved, rename refused: the window stays open with the message and reports the stored values', async () => {
    h.renameWorkspace = vi.fn(async () => ({ error: 'El nombre debe tener entre 1 y 100 caracteres, con al menos una letra o un número, sin caracteres invisibles.' }));
    const { container, nameField, save, onUpdate, onClose } = open();
    fireEvent.change(nameField, { target: { value: 'Otro' } });
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(h.toast.error).toHaveBeenCalledWith('El nombre debe tener entre 1 y 100 caracteres, con al menos una letra o un número, sin caracteres invisibles.');
    expect(onUpdate).toHaveBeenCalledWith({ customName: undefined, imageUrl: 'https://example.test/nueva.png' });
    expect(onClose).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

describe('EC-V1b a changed name goes through the rename', () => {
  it('a changed name calls renameWorkspace with the trimmed name and does not touch the picture', async () => {
    const { nameField, save, onUpdate, onClose } = open();
    fireEvent.change(nameField, { target: { value: '  Comunidad Lectora  ' } });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(h.renameWorkspace).toHaveBeenCalledWith(WS, 'Comunidad Lectora'));
    expect(h.updateWorkspaceSettings).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Comunidad Lectora', imageUrl: PICTURE });
    expect(h.toast.success).toHaveBeenCalledWith('Configuración actualizada exitosamente');
    expect(onClose).toHaveBeenCalled();
  });

  it('a name and a picture together: both are saved', async () => {
    const { container, nameField, save, onUpdate } = open();
    fireEvent.change(nameField, { target: { value: 'Comunidad Lectora' } });
    await choosePicture(container);
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(h.renameWorkspace).toHaveBeenCalledWith(WS, 'Comunidad Lectora'));
    expect(h.updateWorkspaceSettings).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ customName: 'Comunidad Lectora', imageUrl: 'https://example.test/nueva.png' });
  });

  it('a refused rename shows the plain message, keeps the window open and reports nothing', async () => {
    h.renameWorkspace = vi.fn(async () => ({ error: 'Solo los miembros de la comunidad pueden cambiar su nombre.' }));
    const { nameField, save, onUpdate, onClose } = open();
    fireEvent.change(nameField, { target: { value: 'Otro' } });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Solo los miembros de la comunidad pueden cambiar su nombre.'));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('«Guardar» is disabled when nothing changed and when the name is empty', async () => {
    const { nameField, save } = open();
    expect(save.disabled).toBe(true);
    fireEvent.change(nameField, { target: { value: 'Otro' } });
    expect(save.disabled).toBe(false);
    fireEvent.change(nameField, { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(nameField, { target: { value: ` ${DEFAULT_NAME} ` } });
    expect(save.disabled).toBe(true);
  });
});

describe('EC-V1b canChangePicture', () => {
  it('false: the picture section is not rendered and the name can be saved', async () => {
    const { container, queryByText, nameField, save, getByText } = open({ canChangePicture: false });
    expect(queryByText('Imagen de la Comunidad')).toBeNull();
    expect(container.querySelector('#community-image-upload')).toBeNull();
    expect(queryByText('La imagen la cambian los administradores y el gestor de la comunidad.')).toBeNull();
    expect(getByText('Cualquier miembro puede cambiar el nombre del grupo')).toBeTruthy();
    fireEvent.change(nameField, { target: { value: 'Comunidad Lectora' } });
    await act(async () => {
      fireEvent.click(save);
    });
    await waitFor(() => expect(h.renameWorkspace).toHaveBeenCalledWith(WS, 'Comunidad Lectora'));
    expect(h.updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it('by default (the panel): the picture section is rendered with its note', () => {
    const { getByText, container } = open();
    expect(getByText('Imagen de la Comunidad')).toBeTruthy();
    expect(container.querySelector('#community-image-upload')).not.toBeNull();
    expect(getByText('La imagen la cambian los administradores y el gestor de la comunidad.')).toBeTruthy();
  });
});
