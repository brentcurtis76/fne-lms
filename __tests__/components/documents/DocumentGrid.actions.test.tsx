// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DocumentGrid from '../../../components/documents/DocumentGrid';
import { DocumentPermission, DocumentWithDetails } from '../../../types/documents';

vi.mock('../../../lib/supabase-wrapper', () => ({ supabase: {} }));
vi.mock('../../../utils/workspaceUtils', () => ({ getUserWorkspaceAccess: vi.fn() }));

afterEach(() => cleanup());

// What getUserDocumentPermissions now gives a community member.
const MEMBER: DocumentPermission = {
  can_view: true, can_download: true, can_edit: false, can_delete: false,
  can_share: true, can_create_folder: true, can_manage_folders: true,
};
// And a consultant.
const CONSULTANT: DocumentPermission = { ...MEMBER, can_manage_folders: false };

function doc(id: string, uploaded_by: string): DocumentWithDetails {
  return {
    id, workspace_id: 'ws-1', folder_id: null, title: `Documento ${id}`, description: null, tags: [],
    file_name: `${id}.pdf`, file_size: 10, mime_type: 'application/pdf', storage_path: `documents/ws-1/root/${id}.pdf`,
    thumbnail_url: null, current_version: 1, is_active: true, download_count: 0, view_count: 0,
    uploaded_by, created_at: '2026-11-17T12:00:00Z', updated_at: '2026-11-17T12:00:00Z',
    uploader_name: 'Usuario', formatted_size: '10 B', relative_time: 'Hace un momento',
  } as unknown as DocumentWithDetails;
}

function openMenu(props: { userId: string; permissions: DocumentPermission; canManageAll?: boolean; uploadedBy: string }) {
  const onDocumentAction = vi.fn();
  const extra: Record<string, unknown> = {};
  if (props.canManageAll !== undefined) extra.canManageAll = props.canManageAll;
  const view = render(
    <DocumentGrid
      documents={[doc('d1', props.uploadedBy)]}
      folders={[]}
      viewMode="grid"
      onDocumentClick={() => {}}
      onFolderClick={() => {}}
      onDocumentAction={onDocumentAction}
      selectedDocuments={[]}
      onSelectionChange={() => {}}
      permissions={props.permissions}
      userId={props.userId}
      {...extra}
    />,
  );
  // The card's «⋮» button is the only button before the menu opens.
  fireEvent.click(view.container.querySelector('button') as HTMLButtonElement);
  return { onDocumentAction };
}

const MANAGE = ['Editar', 'Mover', 'Eliminar'];

describe('DocumentGrid manage actions (EC-D2b)', () => {
  it('the uploader is offered «Editar», «Mover» and «Eliminar» on their own document', () => {
    openMenu({ userId: 'u1', uploadedBy: 'u1', permissions: MEMBER, canManageAll: false });
    for (const label of MANAGE) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('a viewer who may manage everything (canManageAll) is offered them on anyone\'s document', () => {
    openMenu({ userId: 'leader', uploadedBy: 'u1', permissions: MEMBER, canManageAll: true });
    for (const label of MANAGE) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('another member is offered none of them, but still «Ver» and «Descargar»', () => {
    openMenu({ userId: 'u2', uploadedBy: 'u1', permissions: MEMBER, canManageAll: false });
    for (const label of MANAGE) expect(screen.queryByText(label)).toBeNull();
    expect(screen.getByText('Ver')).toBeInTheDocument();
    expect(screen.getByText('Descargar')).toBeInTheDocument();
  });

  it('a consultant is offered none of them', () => {
    openMenu({ userId: 'c1', uploadedBy: 'u1', permissions: CONSULTANT, canManageAll: false });
    for (const label of MANAGE) expect(screen.queryByText(label)).toBeNull();
  });

  it('without canManageAll a broad permission object alone no longer offers them', () => {
    openMenu({ userId: 'u2', uploadedBy: 'u1', permissions: { ...MEMBER, can_edit: true, can_delete: true } });
    for (const label of MANAGE) expect(screen.queryByText(label)).toBeNull();
  });

  it('«Ver» and «Descargar» still send their actions', () => {
    const { onDocumentAction } = openMenu({ userId: 'u2', uploadedBy: 'u1', permissions: MEMBER, canManageAll: false });
    fireEvent.click(screen.getByText('Descargar'));
    expect(onDocumentAction).toHaveBeenCalledWith('download', expect.objectContaining({ id: 'd1' }));
  });

  it('«Mover» sends the move action for a manageable document', () => {
    const { onDocumentAction } = openMenu({ userId: 'u1', uploadedBy: 'u1', permissions: MEMBER, canManageAll: false });
    fireEvent.click(screen.getByText('Mover'));
    expect(onDocumentAction).toHaveBeenCalledWith('move', expect.objectContaining({ id: 'd1' }));
  });
});
