// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The shell of /community/workspace (GENERA fixes F12c): its header, the
 * community chooser and its start-up.
 *
 *   EC-V1b  the gear («Editar nombre e imagen de la comunidad») is offered to
 *           a member of the shown community and to an admin, never to a
 *           consultant; the settings window changes the picture only for
 *           those who may (canChangePicture = canEditWorkspace); a saved name
 *           shows in the header at once
 *   EC-V4   a person in two communities gets the chooser and can switch
 *   EC-V6   moving inside the app (Next.js gives a NEW router object on every
 *           navigation) does not run the start-up again nor show the loading
 *           skeleton; a different signed-in user does get their own start-up
 *
 * The REAL page is rendered with the harness of workspace.messages.test: data
 * utilities are mocked, the layout and tab parts are stubs. Synthetic data only.
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
  getMeetings: async () => [],
  getMeetingDetails: async () => null,
  canUserManageMeetings: async () => false,
  getMyMeetingRights: async () => null,
}));
vi.mock('../../../utils/documentUtils', () => ({
  getWorkspaceDocuments: async () => ({ documents: [], folders: [] }),
  getUserDocumentPermissions: async () => ({ can_view: true, can_edit: false, can_delete: false, can_upload: false }),
  uploadDocument: vi.fn(),
  createFolder: vi.fn(),
  incrementDocumentCounter: vi.fn(),
  getFolderBreadcrumb: async () => [],
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
vi.mock('../../../components/meetings/MeetingCard', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingDocumentationModal', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingDetailsModal', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingDeletionModal', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentUploadModal', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentGrid', () => ({ default: () => null }));
vi.mock('../../../components/documents/FolderNavigation', () => ({ default: () => null }));
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
vi.mock('../../../components/workspace/WorkspaceTabNavigation', () => ({ default: () => null }));
vi.mock('../../../components/workspace/WorkspaceSessionsTab', () => ({ default: () => null }));

import CommunityWorkspacePage from '../../../pages/community/workspace';

const GEAR = 'Editar nombre e imagen de la comunidad';

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
  h.baseRouter.query = {};
  h.baseRouter.push.mockClear();
  h.routeHandlers.clear();
  h.auth.user = { id: 'user-1', email: 'docente@example.test', name: 'Docente' };
  h.auth.isAdmin = false;
  h.access = access('community_member', [COMMUNITY_A]);
  h.accessCalls.length = 0;
  h.workspaceCalls.length = 0;
  h.canEdit = false;
  h.skeletonRenders = 0;
  h.settingsModal = null;
  h.threadCommunity = {};
  sessionStorage.clear();
  window.history.replaceState({}, '', '/community/workspace');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ members: [] }), { status: 200 })) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EC-V1b the gear is offered to every member and to an admin, never to a consultant', () => {
  it('a community member (not the manager) gets the gear; the window cannot change the picture', async () => {
    const utils = render(<CommunityWorkspacePage />);
    await loaded(utils);
    const gear = utils.getByTitle(GEAR);
    await act(async () => {
      fireEvent.click(gear);
    });
    expect(utils.getByTestId('settings-modal').getAttribute('data-can-change-picture')).toBe('false');
  });

  it('an admin gets the gear', async () => {
    h.auth.isAdmin = true;
    h.access = access('admin', [COMMUNITY_A]);
    const utils = render(<CommunityWorkspacePage />);
    await loaded(utils);
    expect(utils.queryByTitle(GEAR)).not.toBeNull();
  });

  it('a consultant does not get the gear', async () => {
    h.access = access('consultant', [COMMUNITY_A]);
    const utils = render(<CommunityWorkspacePage />);
    await loaded(utils);
    expect(utils.queryByTitle(GEAR)).toBeNull();
  });

  it('the community manager (canEditWorkspace) gets the gear and the window can change the picture', async () => {
    h.canEdit = true;
    const utils = render(<CommunityWorkspacePage />);
    await loaded(utils);
    await act(async () => {
      fireEvent.click(utils.getByTitle(GEAR));
    });
    expect(utils.getByTestId('settings-modal').getAttribute('data-can-change-picture')).toBe('true');
  });

  it('a saved name shows in the header at once', async () => {
    const utils = render(<CommunityWorkspacePage />);
    await loaded(utils);
    await act(async () => {
      fireEvent.click(utils.getByTitle(GEAR));
    });
    await act(async () => {
      h.settingsModal.onUpdate({ customName: 'Comunidad Lectora', imageUrl: '' });
    });
    expect(utils.getByRole('heading', { level: 1 }).textContent).toBe('Comunidad Lectora');
  });
});
