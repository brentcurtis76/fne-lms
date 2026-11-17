// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent, within } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'react-hot-toast';

/**
 * The documents tab of /community/workspace (GENERA fixes F12b, EC-D2b):
 * «Editar», «Mover», «Eliminar» and the bulk «Mover» open their windows and
 * call the database helpers; the tab asks once per workspace whether the
 * viewer may manage every document and hands that to the grid.
 *
 * The REAL page is rendered with the harness of workspace.messages.test: its
 * data utilities are mocked and the document grid is a stub that presses the
 * page's actions. The real ConfirmModal is used. Synthetic data only.
 */

const h = vi.hoisted(() => ({
  router: {
    query: { section: 'documents' } as Record<string, string>,
    pathname: '/community/workspace',
    asPath: '/community/workspace?section=documents',
    push: vi.fn(async () => true),
    replace: vi.fn(async () => true),
    events: { on: vi.fn(), off: vi.fn() },
  },
  auth: {
    user: { id: 'user-1', email: 'docente@example.test', name: 'Docente' },
    profile: { id: 'user-1' },
    loading: false,
    logout: vi.fn(),
    isAdmin: false,
    avatarUrl: null as string | null,
  },
  docs: [] as any[],
  folders: [] as any[],
  canManageAll: false,
  canManageCalls: [] as string[],
  docLoads: 0,
  grid: null as any,
  renameDocument: vi.fn(),
  moveDocument: vi.fn(),
  hideDocument: vi.fn(),
}));

const COMMUNITY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCESS = {
  canAccess: true,
  accessType: 'community_member',
  availableCommunities: [{ id: COMMUNITY_A, name: 'Comunidad A', display_name: 'Comunidad A', school_name: 'Escuela A', generation_name: 'Gen A' }],
  defaultCommunityId: COMMUNITY_A,
};
const WORKSPACE = {
  id: 'ws-A', community_id: COMMUNITY_A, name: 'Espacio A', settings: {}, is_active: true,
  created_at: '2026-01-01T00:00:00.000Z', community: { id: COMMUNITY_A, name: 'GC A' },
};
const doc = (id: string, uploaded_by: string, extra: Record<string, unknown> = {}) => ({
  id, workspace_id: 'ws-A', folder_id: null, title: `Acta ${id}`, description: null, tags: [],
  file_name: `${id}.pdf`, file_size: 10, mime_type: 'application/pdf', storage_path: `documents/ws-A/root/${id}.pdf`,
  is_active: true, download_count: 0, view_count: 0, uploaded_by, created_at: '2026-11-17T12:00:00Z',
  updated_at: '2026-11-17T12:00:00Z', uploader_name: 'Usuario', formatted_size: '10 B', relative_time: 'Hace un momento',
  ...extra,
});

function emptyClient() {
  const empty = { data: [], error: null };
  const chain: any = {
    select: () => chain, eq: () => chain, in: () => chain, is: () => chain, order: () => chain, limit: () => chain,
    update: () => chain, insert: () => chain, delete: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: unknown) => void) => resolve(empty),
  };
  return {
    from: () => chain,
    auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token', user: { id: 'user-1' } } } }) },
    storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
  };
}

vi.mock('next/router', () => ({ useRouter: () => h.router }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() });
  return { toast: t, default: t, Toaster: () => null };
});
vi.mock('../../../utils/navigationManager', () => ({
  navigationManager: { navigate: async (run: () => Promise<void>) => run() },
}));
vi.mock('../../../lib/supabase', () => ({ supabase: emptyClient() }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => emptyClient() }));
vi.mock('../../../utils/workspaceUtils', () => ({
  getUserWorkspaceAccess: async () => ACCESS,
  getOrCreateWorkspace: async () => WORKSPACE,
  logWorkspaceActivity: async () => undefined,
}));
vi.mock('../../../lib/services/communityWorkspace', () => ({
  communityWorkspaceService: { canEditWorkspace: async () => ({ canEdit: false }) },
}));
vi.mock('../../../lib/community/fetchCommunityMembers', () => ({ fetchCommunityMembers: async () => [] }));
vi.mock('../../../utils/meetingUtils', () => ({
  getMeetings: async () => [],
  getMeetingDetails: async () => null,
  canUserManageMeetings: async () => false,
}));
vi.mock('../../../utils/documentUtils', () => ({
  getWorkspaceDocuments: async () => {
    h.docLoads += 1;
    return { documents: h.docs, folders: [] };
  },
  getUserDocumentPermissions: async () => ({
    can_view: true, can_download: true, can_edit: false, can_delete: false,
    can_share: true, can_create_folder: true, can_manage_folders: true,
  }),
  uploadDocument: vi.fn(),
  createFolder: vi.fn(),
  incrementDocumentCounter: vi.fn(async () => undefined),
  getFolderBreadcrumb: async () => [],
  extractUniqueTags: () => [],
  canManageWorkspaceDocuments: async (workspaceId: string) => {
    h.canManageCalls.push(workspaceId);
    return h.canManageAll;
  },
  renameDocument: (...args: unknown[]) => h.renameDocument(...args),
  moveDocument: (...args: unknown[]) => h.moveDocument(...args),
  hideDocument: (...args: unknown[]) => h.hideDocument(...args),
  getWorkspaceFolders: async () => h.folders,
}));
vi.mock('../../../utils/messagingUtils-simple', () => ({
  getWorkspaceThreads: async () => [],
  getWorkspaceMessages: async () => [],
  getUserMessagingPermissions: async () => ({
    can_view_messages: false, can_send_messages: false, can_create_threads: false, can_edit_own_messages: false,
    can_delete_own_messages: false, can_moderate_messages: false, can_pin_threads: false, can_archive_threads: false,
    can_upload_attachments: false, can_mention_all: false, can_view_analytics: false, can_manage_reactions: false,
  }),
  createThread: vi.fn(),
  sendMessage: vi.fn(),
  subscribeToWorkspaceMessages: () => ({ unsubscribe: vi.fn() }),
}));
vi.mock('../../../utils/activityUtils', () => ({
  getActivityFeed: async () => [],
  getActivitySubscription: async () => null,
  updateActivitySubscription: vi.fn(),
  getActivityPermissions: async () => null,
}));

vi.mock('../../../components/layout/MainLayout', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../../components/layout/FunctionalPageHeader', () => ({
  ResponsiveFunctionalPageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../../components/common/ErrorBoundary', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../components/common/LoadingSkeleton', () => ({ default: () => null }));
vi.mock('../../../components/tutorials/HelpButton', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingFilters', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingCard', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingDocumentationModal', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentUploadModal', () => ({ default: () => null }));
// The grid stub: one button per action and document, and a «select all».
vi.mock('../../../components/documents/DocumentGrid', () => ({
  default: (props: any) => {
    h.grid = props;
    return (
      <div data-testid="grid" data-can-manage-all={props.canManageAll ? 'yes' : 'no'}>
        {props.documents.map((d: any) => (
          <span key={d.id}>
            {['edit', 'move', 'delete'].map(action => (
              <button key={action} type="button" data-testid={`${action}-${d.id}`} onClick={() => props.onDocumentAction(action, d)}>
                {action}
              </button>
            ))}
          </span>
        ))}
        <button type="button" data-testid="select-all" onClick={() => props.onSelectionChange(props.documents.map((d: any) => d.id))}>
          all
        </button>
      </div>
    );
  },
}));
vi.mock('../../../components/documents/FolderNavigation', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentPreview', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentFilters', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageFilters', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageThread', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageCard', () => ({ default: () => null }));
vi.mock('../../../components/messaging/AttachmentPreview', () => ({ default: () => null }));
vi.mock('../../../components/messaging/ThreadCreationModal', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageComposer', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityFeed', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivitySummary', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityNotifications', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityFeedPlaceholder', () => ({ default: () => null }));
vi.mock('../../../components/community/WorkspaceSettingsModal', () => ({ default: () => null }));
vi.mock('../../../components/feed/FeedContainer', () => ({ default: () => null }));
vi.mock('../../../components/workspace/WorkspaceTabNavigation', () => ({ default: () => null }));
vi.mock('../../../components/workspace/WorkspaceSessionsTab', () => ({ default: () => null }));

import CommunityWorkspacePage from '../../../pages/community/workspace';

const NOT_ALLOWED = 'Solo quien subió el documento o el líder de la comunidad puede hacerlo.';

async function ready(): Promise<RenderResult> {
  const utils = render(<CommunityWorkspacePage />);
  await utils.findByTestId('edit-d1');
  return utils;
}

beforeEach(() => {
  h.docs = [doc('d1', 'user-1'), doc('d2', 'user-2')];
  h.folders = [
    { id: 'f-root', workspace_id: 'ws-A', folder_name: 'Actas', parent_folder_id: null },
    { id: 'f-sub', workspace_id: 'ws-A', folder_name: 'Actas 2026', parent_folder_id: 'f-root' },
  ];
  h.canManageAll = false;
  h.canManageCalls = [];
  h.docLoads = 0;
  h.grid = null;
  h.renameDocument = vi.fn(async () => undefined);
  h.moveDocument = vi.fn(async () => undefined);
  h.hideDocument = vi.fn(async () => undefined);
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ members: [] }), { status: 200 })) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EC-D2b the documents tab renames, moves and removes', () => {
  it('asks once per workspace whether the viewer may manage everything and hands it to the grid', async () => {
    h.canManageAll = true;
    const utils = await ready();
    await waitFor(() => expect(utils.getByTestId('grid').getAttribute('data-can-manage-all')).toBe('yes'));
    expect(h.canManageCalls).toEqual(['ws-A']);
  });

  it('«Editar» opens «Cambiar nombre del documento» with the current name; «Guardar» renames and reloads', async () => {
    const utils = await ready();
    fireEvent.click(utils.getByTestId('edit-d1'));
    const dialog = utils.getByTestId('document-rename-dialog');
    expect(within(dialog).getByText('Cambiar nombre del documento')).toBeTruthy();
    const input = within(dialog).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('Acta d1');
    expect(input.maxLength).toBe(200);
    fireEvent.change(input, { target: { value: 'Acta corregida' } });
    const loadsBefore = h.docLoads;
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Guardar'));
    });
    expect(h.renameDocument).toHaveBeenCalledWith('d1', 'Acta corregida');
    expect(toast.success).toHaveBeenCalledWith('Nombre actualizado');
    await waitFor(() => expect(h.docLoads).toBeGreaterThan(loadsBefore));
    expect(utils.queryByTestId('document-rename-dialog')).toBeNull();
  });

  it('a refused rename shows the refusal and keeps the window open; «Cancelar» closes it', async () => {
    h.renameDocument = vi.fn(async () => { throw new Error(NOT_ALLOWED); });
    const utils = await ready();
    fireEvent.click(utils.getByTestId('edit-d1'));
    const dialog = utils.getByTestId('document-rename-dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Guardar'));
    });
    expect(toast.error).toHaveBeenCalledWith(NOT_ALLOWED);
    expect(utils.queryByTestId('document-rename-dialog')).not.toBeNull();
    fireEvent.click(within(dialog).getByText('Cancelar'));
    expect(utils.queryByTestId('document-rename-dialog')).toBeNull();
  });

  it('«Mover» opens «Mover documento» with «Sin carpeta» and every folder; «Mover» moves and reloads', async () => {
    const utils = await ready();
    fireEvent.click(utils.getByTestId('move-d1'));
    const dialog = utils.getByTestId('document-move-dialog');
    expect(within(dialog).getByText('Mover documento')).toBeTruthy();
    await waitFor(() => expect(within(dialog).getAllByRole('option').map(o => o.textContent)).toEqual(['Sin carpeta', 'Actas', 'Actas 2026']));
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'f-sub' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));
    });
    expect(h.moveDocument).toHaveBeenCalledWith('d1', 'f-sub');
    expect(toast.success).toHaveBeenCalledWith('Documento movido');
    expect(utils.queryByTestId('document-move-dialog')).toBeNull();
  });

  it('«Sin carpeta» moves the document out of any folder (null)', async () => {
    h.docs = [doc('d1', 'user-1', { folder_id: 'f-root' })];
    const utils = await ready();
    fireEvent.click(utils.getByTestId('move-d1'));
    const dialog = utils.getByTestId('document-move-dialog');
    await waitFor(() => expect((within(dialog).getByRole('combobox') as HTMLSelectElement).value).toBe('f-root'));
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));
    });
    expect(h.moveDocument).toHaveBeenCalledWith('d1', null);
  });

  it('«Eliminar» opens the in-page confirmation (no browser confirm); «Eliminar» hides and reloads', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const utils = await ready();
    fireEvent.click(utils.getByTestId('delete-d1'));
    const box = utils.getByTestId('document-delete-confirm');
    expect(within(box).getByText('Eliminar documento')).toBeTruthy();
    expect(within(box).getByText('El documento «Acta d1» dejará de verse en este espacio. ¿Continuar?')).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(box).getByRole('button', { name: 'Eliminar' }));
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(h.hideDocument).toHaveBeenCalledWith('d1');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Documento eliminado'));
    expect(utils.queryByTestId('document-delete-confirm')).toBeNull();
  });

  it('«Cancelar» in the confirmation hides nothing', async () => {
    const utils = await ready();
    fireEvent.click(utils.getByTestId('delete-d1'));
    fireEvent.click(within(utils.getByTestId('document-delete-confirm')).getByText('Cancelar'));
    expect(h.hideDocument).not.toHaveBeenCalled();
    expect(utils.queryByTestId('document-delete-confirm')).toBeNull();
  });

  it('the bulk «Mover» moves each selected document; all moved', async () => {
    const utils = await ready();
    fireEvent.click(utils.getByTestId('select-all'));
    fireEvent.click(await utils.findByText('Mover'));
    const dialog = utils.getByTestId('document-move-dialog');
    await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(3));
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'f-root' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));
    });
    expect(h.moveDocument.mock.calls).toEqual([['d1', 'f-root'], ['d2', 'f-root']]);
    expect(toast.success).toHaveBeenCalledWith('2 documento(s) movido(s)');
  });

  it('the bulk «Mover» says how many could not be moved', async () => {
    h.moveDocument = vi.fn(async (id: string) => {
      if (id === 'd2') throw new Error(NOT_ALLOWED);
    });
    const utils = await ready();
    fireEvent.click(utils.getByTestId('select-all'));
    fireEvent.click(await utils.findByText('Mover'));
    const dialog = utils.getByTestId('document-move-dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Mover' }));
    });
    expect(toast.error).toHaveBeenCalledWith(
      '1 documento(s) movido(s). 1 no se pudieron mover: solo quien los subió o el líder de la comunidad puede moverlos.',
    );
  });

  it('the bulk «Mover» with one selected document uses the bulk message', async () => {
    h.docs = [doc('d1', 'user-1')];
    const utils = await ready();
    fireEvent.click(utils.getByTestId('select-all'));
    fireEvent.click(await utils.findByText('Mover'));
    await act(async () => {
      fireEvent.click(within(utils.getByTestId('document-move-dialog')).getByRole('button', { name: 'Mover' }));
    });
    expect(h.moveDocument).toHaveBeenCalledWith('d1', null);
    expect(toast.success).toHaveBeenCalledWith('1 documento(s) movido(s)');
  });

  it('no «… próximamente» message is left for edit, move or delete', async () => {
    const utils = await ready();
    fireEvent.click(utils.getByTestId('edit-d1'));
    fireEvent.click(utils.getByTestId('move-d1'));
    fireEvent.click(utils.getByTestId('delete-d1'));
    const texts = vi.mocked(toast).mock.calls.map(c => String(c[0]));
    expect(texts.filter(t => t.includes('próximamente'))).toEqual([]);
  });
});
