import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, folderQuery, getUserWorkspaceAccess } = vi.hoisted(() => {
  const folderQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
  folderQuery.select.mockReturnValue(folderQuery);
  folderQuery.eq.mockReturnValue(folderQuery);
  return { rpc: vi.fn(), from: vi.fn(() => folderQuery), folderQuery, getUserWorkspaceAccess: vi.fn() };
});

vi.mock('../../lib/supabase-wrapper', () => ({ supabase: { rpc, from } }));
vi.mock('../../utils/workspaceUtils', () => ({ getUserWorkspaceAccess }));

import * as documentUtils from '../../utils/documentUtils';

const NOT_ALLOWED = 'Solo quien subió el documento o el líder de la comunidad puede hacerlo.';
const INVALID_TITLE = 'El nombre debe tener entre 1 y 200 caracteres.';
const INVALID_FOLDER = 'La carpeta ya no existe en este espacio.';
const OTHER = 'No se pudo completar la acción. Inténtalo de nuevo.';

const api = documentUtils as any;

describe('document action helpers (EC-D2b)', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renameDocument calls rename_community_document with the id and the title', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await api.renameDocument('doc-1', 'Acta nueva');
    expect(rpc).toHaveBeenCalledWith('rename_community_document', { p_document_id: 'doc-1', p_title: 'Acta nueva' });
  });

  it('moveDocument calls move_community_document with the folder, or null for «Sin carpeta»', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await api.moveDocument('doc-1', 'folder-9');
    expect(rpc).toHaveBeenLastCalledWith('move_community_document', { p_document_id: 'doc-1', p_folder_id: 'folder-9' });
    await api.moveDocument('doc-1', null);
    expect(rpc).toHaveBeenLastCalledWith('move_community_document', { p_document_id: 'doc-1', p_folder_id: null });
  });

  it('hideDocument calls hide_community_document with the id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await api.hideDocument('doc-1');
    expect(rpc).toHaveBeenCalledWith('hide_community_document', { p_document_id: 'doc-1' });
  });

  it('canManageWorkspaceDocuments asks can_manage_workspace_documents and answers false on an error', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(api.canManageWorkspaceDocuments('ws-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('can_manage_workspace_documents', { p_workspace_id: 'ws-1' });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(api.canManageWorkspaceDocuments('ws-1')).resolves.toBe(false);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(api.canManageWorkspaceDocuments('ws-1')).resolves.toBe(false);
  });

  it.each([
    ['not_allowed', '42501', NOT_ALLOWED],
    ['invalid_title', '22023', INVALID_TITLE],
    ['invalid_folder', '22023', INVALID_FOLDER],
    ['something else', 'XX000', OTHER],
  ])('a refusal %s (%s) becomes its message', async (message, code, text) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } });
    await expect(api.renameDocument('doc-1', 'x')).rejects.toThrow(text);
    await expect(api.moveDocument('doc-1', null)).rejects.toThrow(text);
    await expect(api.hideDocument('doc-1')).rejects.toThrow(text);
  });

  it('a network failure becomes the generic message', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'));
    await expect(api.hideDocument('doc-1')).rejects.toThrow(OTHER);
  });
});

describe('getWorkspaceFolders (EC-D2b, the «Mover documento» window)', () => {
  it('reads every folder of the workspace, whatever its level', async () => {
    folderQuery.order.mockResolvedValue({ data: [{ id: 'f1', folder_name: 'Actas' }], error: null });
    await expect(api.getWorkspaceFolders('ws-1')).resolves.toEqual([{ id: 'f1', folder_name: 'Actas' }]);
    expect(from).toHaveBeenCalledWith('document_folders');
    expect(folderQuery.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    expect(folderQuery.eq).toHaveBeenCalledTimes(1);
  });
});

describe('getUserDocumentPermissions (EC-D2b)', () => {
  it('a community member no longer gets can_edit or can_delete', async () => {
    getUserWorkspaceAccess.mockResolvedValue({ accessType: 'community_member' });
    const p = await documentUtils.getUserDocumentPermissions('u1', 'ws-1');
    expect(p.can_edit).toBe(false);
    expect(p.can_delete).toBe(false);
    expect(p.can_view).toBe(true);
    expect(p.can_download).toBe(true);
    expect(p.can_create_folder).toBe(true);
  });

  it('admin and consultant are unchanged', async () => {
    getUserWorkspaceAccess.mockResolvedValue({ accessType: 'admin' });
    expect(await documentUtils.getUserDocumentPermissions('u1', 'ws-1')).toEqual({
      can_view: true, can_download: true, can_edit: true, can_delete: true,
      can_share: true, can_create_folder: true, can_manage_folders: true,
    });
    getUserWorkspaceAccess.mockResolvedValue({ accessType: 'consultant' });
    expect(await documentUtils.getUserDocumentPermissions('u1', 'ws-1')).toEqual({
      can_view: true, can_download: true, can_edit: false, can_delete: false,
      can_share: true, can_create_folder: true, can_manage_folders: false,
    });
  });
});
