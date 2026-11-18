// @vitest-environment jsdom
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * GENERA fixes F12c, send-back 3.
 * EC-V1: a workspace name of 100 characters without spaces no longer pushes
 * the gear out of the header (a unit test cannot measure pixels: it pins the
 * classes that let the name break inside its box and keep the gear; the
 * layout itself is seen in a browser).
 * EC-V4: choosing another community in the chooser removes a stale `thread`
 * from the address, so a reload or Back does not jump to the old community.
 *
 * The REAL page is rendered with the harness of workspace.shell.test: data
 * utilities are mocked, the layout and tab parts are stubs that expose what
 * the page hands them. Synthetic data only.
 */

const h = vi.hoisted(() => {
  const baseRouter = {
    query: {} as Record<string, string>,
    pathname: '/community/workspace',
    asPath: '/community/workspace',
    push: vi.fn(async () => true),
    replace: vi.fn(async () => true),
    events: {
      on: vi.fn((event: string, handler: (url: string) => void) => {
        if (event === 'routeChangeComplete') h.routeHandlers.add(handler);
      }),
      off: vi.fn((event: string, handler: (url: string) => void) => {
        if (event === 'routeChangeComplete') h.routeHandlers.delete(handler);
      }),
    },
  };
  const h = {
    baseRouter,
    /** When true, every useRouter() call answers a NEW object, as Next.js does after a navigation. */
    freshRouter: false,
    routeHandlers: new Set<(url: string) => void>(),
    auth: {
      user: { id: 'user-1', email: 'docente@example.test', name: 'Docente' } as null | { id: string; email: string; name: string },
      profile: { id: 'user-1' },
      loading: false,
      logout: vi.fn(),
      isAdmin: false,
      avatarUrl: null as string | null,
    },
    access: null as any,
    accessCalls: [] as string[],
    workspaceCalls: [] as string[],
    canEdit: false,
    skeletonRenders: 0,
    settingsModal: null as any,
    threadCommunity: {} as Record<string, string>,
    docRequests: [] as Array<{ workspaceId: string; folderId: string | null }>,
    breadcrumb: null as any,
    currentFolder: undefined as any,
    detailsMeetingId: null as string | null,
    createModal: null as any,
    onSectionChange: null as null | ((section: string) => void),
    /** Fields that override the synthetic workspace of every community. */
    workspaceOverride: {} as Record<string, unknown>,
  };
  return h;
});

const COMMUNITY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMMUNITY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const THREAD_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const label = (communityId: string) => (communityId === COMMUNITY_A ? 'A' : 'B');
const communityInfo = (communityId: string) => ({
  id: communityId,
  name: `Comunidad ${label(communityId)}`,
  display_name: `Comunidad ${label(communityId)}`,
  school_name: `Escuela ${label(communityId)}`,
  generation_name: `Generación ${label(communityId)}`,
});
const access = (accessType: string, communities: string[]) => ({
  canAccess: true,
  accessType,
  availableCommunities: communities.map(communityInfo),
  defaultCommunityId: communities[0],
});
const workspaceFor = (communityId: string) => ({
  id: `ws-${label(communityId)}`,
  community_id: communityId,
  name: `Espacio de Comunidad ${label(communityId)}`,
  custom_name: null,
  image_url: null,
  settings: {},
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  community: { id: communityId, name: `Comunidad ${label(communityId)}` },
  ...h.workspaceOverride,
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

vi.mock('next/router', () => ({
  useRouter: () => (h.freshRouter ? { ...h.baseRouter, query: { ...h.baseRouter.query } } : h.baseRouter),
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('react-hot-toast', () => {
  const toast = { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() };
  return { toast, default: toast, Toaster: () => null };
});
vi.mock('../../../utils/navigationManager', () => ({
  navigationManager: { navigate: async (run: () => Promise<void>) => run() },
}));
vi.mock('../../../lib/supabase', () => ({ supabase: emptyClient() }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => emptyClient() }));
vi.mock('../../../utils/workspaceUtils', () => ({
  getUserWorkspaceAccess: async (userId: string) => {
    h.accessCalls.push(userId);
    // A start-up that keeps restarting is cut off here, so it fails instead of spinning.
    if (h.accessCalls.length > 10) return new Promise(() => undefined);
    return h.access;
  },
  getOrCreateWorkspace: async (communityId: string) => {
    h.workspaceCalls.push(communityId);
    return workspaceFor(communityId);
  },
  logWorkspaceActivity: async () => undefined,
}));
vi.mock('../../../lib/services/communityWorkspace', () => ({
  communityWorkspaceService: { canEditWorkspace: async () => ({ canEdit: h.canEdit }) },
}));
vi.mock('../../../lib/community/fetchCommunityMembers', () => ({ fetchCommunityMembers: async () => [] }));
vi.mock('../../../utils/meetingUtils', () => ({
  getMeetings: async (workspaceId: string) => (workspaceId === 'ws-A' ? [meetingOf('m-A', 'ws-A')] : []),
  getMeetingDetails: async () => null,
  canUserManageMeetings: async () => false,
  getMyMeetingRights: async () => new Map(),
}));
vi.mock('../../../utils/documentUtils', () => ({
  getWorkspaceDocuments: async (workspaceId: string, folderId: string | null) => {
    h.docRequests.push({ workspaceId, folderId });
    return { documents: [], folders: workspaceId === 'ws-A' && !folderId ? [folderA] : [] };
  },
  getUserDocumentPermissions: async () => ({ can_view: true, can_edit: false, can_delete: false, can_upload: false }),
  uploadDocument: vi.fn(),
  createFolder: vi.fn(),
  incrementDocumentCounter: vi.fn(),
  getFolderBreadcrumb: async (folderId: string) => (folderId === 'fold-A' ? [{ id: 'fold-A', name: 'Actas de A' }] : []),
  extractUniqueTags: () => [],
  canManageWorkspaceDocuments: async () => false,
  renameDocument: vi.fn(),
  moveDocument: vi.fn(),
  hideDocument: vi.fn(),
  getWorkspaceFolders: async () => [],
}));
vi.mock('../../../utils/messagingUtils-simple', () => ({
  getWorkspaceThreads: async () => [],
  getWorkspaceMessages: async () => [],
  getUserMessagingPermissions: async () => ({
    can_view_messages: true, can_send_messages: true, can_create_threads: true, can_edit_own_messages: false,
    can_delete_own_messages: false, can_moderate_messages: false, can_pin_threads: false, can_archive_threads: false,
    can_upload_attachments: false, can_mention_all: false, can_view_analytics: false, can_manage_reactions: false,
  }),
  createThread: vi.fn(),
  sendMessage: vi.fn(),
  subscribeToWorkspaceMessages: () => ({ unsubscribe: vi.fn() }),
  getThreadCommunityId: async (threadId: string) => h.threadCommunity[threadId] ?? null,
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
vi.mock('../../../components/common/ConfirmModal', () => ({ ConfirmModal: () => null }));
vi.mock('../../../components/common/LoadingSkeleton', () => ({
  default: () => {
    h.skeletonRenders += 1;
    return <div data-testid="loading-skeleton" />;
  },
}));
vi.mock('../../../components/tutorials/HelpButton', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingFilters', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingCard', () => ({
  default: (props: any) => (
    <span>
      <button type="button" data-testid={`view-${props.meeting.id}`} onClick={() => props.onView(props.meeting.id)}>ver</button>
      <button type="button" data-testid={`edit-${props.meeting.id}`} onClick={() => props.onEdit(props.meeting.id)}>editar</button>
    </span>
  ),
}));
vi.mock('../../../components/meetings/MeetingDocumentationModal', () => ({
  default: (props: any) => {
    h.createModal = props;
    return <div data-testid="meeting-edit" data-meeting={props.meetingId ?? ''} data-workspace={props.workspaceId} />;
  },
}));
vi.mock('../../../components/meetings/MeetingDetailsModal', () => ({
  default: (props: any) => {
    h.detailsMeetingId = props.meetingId;
    return <div data-testid="meeting-details" data-meeting={props.meetingId} />;
  },
}));
vi.mock('../../../components/meetings/MeetingDeletionModal', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentUploadModal', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentGrid', () => ({
  default: (props: any) => (
    <div data-testid="doc-grid">
      {props.folders.map((f: any) => (
        <button key={f.id} type="button" data-testid={`open-${f.id}`} onClick={() => props.onFolderClick(f)}>{f.folder_name}</button>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/documents/FolderNavigation', () => ({
  default: (props: any) => {
    h.breadcrumb = props.breadcrumb;
    h.currentFolder = props.currentFolder;
    return <div data-testid="breadcrumb">{props.breadcrumb.map((b: any) => b.name).join(' / ') || 'raíz'}</div>;
  },
}));
vi.mock('../../../components/documents/DocumentPreview', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentFilters', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageFilters', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageThread', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageCard', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageComposer', () => ({ default: () => null }));
vi.mock('../../../components/messaging/AttachmentPreview', () => ({ default: () => null }));
vi.mock('../../../components/messaging/ThreadCreationModal', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityFeed', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivitySummary', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityNotifications', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityFeedPlaceholder', () => ({ default: () => null }));
vi.mock('../../../components/community/WorkspaceSettingsModal', () => ({
  default: (props: any) => {
    h.settingsModal = props;
    return props.isOpen ? <div data-testid="settings-modal" data-can-change-picture={String(props.canChangePicture)} /> : null;
  },
}));
vi.mock('../../../components/feed/FeedContainer', () => ({ default: () => null }));
vi.mock('../../../components/workspace/WorkspaceTabNavigation', () => ({
  default: (props: any) => {
    h.onSectionChange = props.onSectionChange;
    return null;
  },
}));
vi.mock('../../../components/workspace/WorkspaceSessionsTab', () => ({ default: () => null }));


const folderA = { id: 'fold-A', workspace_id: 'ws-A', folder_name: 'Actas de A', parent_folder_id: null, breadcrumb: [] };
function meetingOf(id: string, workspaceId: string) {
  return { id, workspace_id: workspaceId, title: `Reunión ${id}`, meeting_date: '2026-11-17T12:00:00Z', status: 'completada' };
}

import CommunityWorkspacePage from '../../../pages/community/workspace';

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function loaded(utils: RenderResult, communityId = COMMUNITY_A) {
  await utils.findByText(`Espacio de Comunidad ${label(communityId)}`);
  await flush();
}

beforeEach(() => {
  h.freshRouter = false;
  h.baseRouter.query = { section: 'documents' };
  h.baseRouter.push.mockClear();
  h.baseRouter.replace.mockClear();
  h.workspaceOverride = {};
  h.routeHandlers.clear();
  h.auth.user = { id: 'user-1', email: 'docente@example.test', name: 'Docente' };
  h.auth.isAdmin = false;
  h.access = access('community_member', [COMMUNITY_A, COMMUNITY_B]);
  h.accessCalls.length = 0;
  h.workspaceCalls.length = 0;
  h.canEdit = false;
  h.skeletonRenders = 0;
  h.settingsModal = null;
  h.threadCommunity = {};
  h.docRequests = [];
  h.breadcrumb = null;
  h.currentFolder = undefined;
  h.detailsMeetingId = null;
  h.createModal = null;
  h.onSectionChange = null;
  sessionStorage.clear();
  window.history.replaceState({}, '', '/community/workspace?section=documents');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ members: [], data: { sessions: [] } }), { status: 200 })) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const LONG_NAME = 'N'.repeat(100);
const GEAR_TITLE = 'Editar nombre e imagen de la comunidad';

function expectNameKeepsTheGear(utils: RenderResult) {
  const name = utils.getByRole('heading', { level: 1, name: LONG_NAME });
  // The name breaks inside its box instead of widening it ...
  expect(name.className.split(/\s+/)).toContain('break-words');
  // ... because its box and the row around it may shrink below the name's width.
  const nameBox = name.parentElement as HTMLElement;
  expect(nameBox.className.split(/\s+/)).toContain('min-w-0');
  const leftRow = nameBox.parentElement as HTMLElement;
  expect(leftRow.className.split(/\s+/)).toContain('min-w-0');
  // The picture (or its placeholder) keeps its size next to a long name.
  expect((leftRow.firstElementChild as HTMLElement).className.split(/\s+/)).toContain('flex-shrink-0');
  // The gear never shrinks and sits in the same header row as that left row.
  const gear = utils.getByTitle(GEAR_TITLE);
  expect(gear.className.split(/\s+/)).toContain('flex-shrink-0');
  expect(gear.parentElement).toBe(leftRow.parentElement);
}

describe('send-back 3, EC-V1: a long name does not push the gear off the header', () => {
  it('without a picture: a 100-character name without spaces breaks inside its box and the gear stays', async () => {
    h.workspaceOverride = { custom_name: LONG_NAME };
    const utils = render(<CommunityWorkspacePage />);
    await utils.findByRole('heading', { level: 1, name: LONG_NAME });
    await flush();
    expectNameKeepsTheGear(utils);
  });

  it('with a picture: the same', async () => {
    h.workspaceOverride = { custom_name: LONG_NAME, image_url: 'https://example.test/picture.png' };
    const utils = render(<CommunityWorkspacePage />);
    await utils.findByRole('heading', { level: 1, name: LONG_NAME });
    await flush();
    expect(utils.getByAltText(LONG_NAME).tagName).toBe('IMG');
    expectNameKeepsTheGear(utils);
  });

  it('the chooser: the chosen name is cut inside its button, and a long name in the list breaks inside its row', async () => {
    h.access = {
      ...access('community_member', [COMMUNITY_A, COMMUNITY_B]),
      availableCommunities: [
        { ...communityInfo(COMMUNITY_A), display_name: LONG_NAME },
        { ...communityInfo(COMMUNITY_B), display_name: `${LONG_NAME}B` },
      ],
    };
    const utils = render(<CommunityWorkspacePage />);
    await loaded(utils);
    const chosen = utils.getByText(LONG_NAME);
    expect(chosen.className.split(/\s+/)).toContain('truncate');
    await act(async () => {
      fireEvent.click(chosen.closest('button') as HTMLButtonElement);
    });
    const listed = utils.getByText(`${LONG_NAME}B`);
    expect(listed.className.split(/\s+/)).toContain('break-words');
    expect((listed.parentElement as HTMLElement).className.split(/\s+/)).toContain('min-w-0');
  });
});
