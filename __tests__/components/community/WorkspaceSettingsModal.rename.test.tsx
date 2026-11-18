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
  uploadCommunityImage: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({ toast: h.toast, default: h.toast }));
vi.mock('../../../lib/services/communityWorkspace', () => ({
  communityWorkspaceService: {
    renameWorkspace: (...args: unknown[]) => h.renameWorkspace(...args),
    updateWorkspaceSettings: (...args: unknown[]) => h.updateWorkspaceSettings(...args),
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

beforeEach(() => {
  h.renameWorkspace = vi.fn(async () => ({ error: null }));
  h.updateWorkspaceSettings = vi.fn(async () => ({ data: { id: WS }, error: null }));
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
    expect(onUpdate).toHaveBeenCalledWith({ customName: DEFAULT_NAME, imageUrl: 'https://example.test/nueva.png' });
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
