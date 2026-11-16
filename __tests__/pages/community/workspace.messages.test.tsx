// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The messages tab of /community/workspace (GENERA fixes F11).
 *
 *   EC-M7  a PDF (or any) attachment of a message gets its open/download
 *          control: the page hands its download action to every message card
 *   EC-M5  a new message of another member appears once in the open
 *          conversation; one of another conversation does not; the live
 *          connection is closed when the conversation or the page is left
 *
 * The REAL page is rendered with the harness of workspace.mention-scope.test:
 * its data utilities are mocked, the realtime subscription is a recorder, and
 * the message card is a stub. Synthetic data only.
 */

const h = vi.hoisted(() => ({
  /** Every `supabase.from(table)` seen through either client mock. */
  fromCalls: [] as string[],
  // The page's effects depend on the router object — it must stay stable.
  router: {
    query: { section: 'messaging' } as Record<string, string>,
    pathname: '/community/workspace',
    asPath: '/community/workspace?section=messaging',
    push: vi.fn(async () => true),
    replace: vi.fn(async () => true),
    // The page listens for in-place thread links (NOTIF-09); this suite never navigates.
    events: { on: vi.fn(), off: vi.fn() },
  },
  auth: {
    user: { id: 'user-1', email: 'admin@fne.cl', name: 'Admin' },
    profile: { id: 'user-1' },
    loading: false,
    logout: vi.fn(),
    isAdmin: true,
    avatarUrl: null as string | null,
  },
  /** Per-community gate that holds `getOrCreateWorkspace` back until opened. */
  workspaceGates: new Map<string, Promise<void>>(),
  /** Every workspace id whose threads the tab asked for, in order. */
  threadLoads: [] as string[],
  /** Messages getWorkspaceMessages answers, by thread. */
  messages: [] as any[],
  /** Every realtime subscription the page made, with its callbacks. */
  subscriptions: [] as Array<{ workspaceId: string; callbacks: any; unsubscribe: ReturnType<typeof vi.fn> }>,
}));

// ---------------------------------------------------------------------------
// Fixtures (synthetic ids only)
// ---------------------------------------------------------------------------

const COMMUNITY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMMUNITY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER_ANA = {
  id: '33333333-3333-4333-8333-333333333333',
  first_name: 'Ana',
  last_name: 'Uno',
  email: 'ana@x.cl',
  avatar_url: null,
  user_roles: [{ role_type: 'lider_comunidad' }],
};
const MEMBER_BRUNO = {
  id: '44444444-4444-4444-8444-444444444444',
  first_name: 'Bruno',
  last_name: 'Dos',
  email: 'bruno@x.cl',
  avatar_url: null,
  user_roles: [{ role_type: 'docente' }],
};
const DIRECT_MEMBER_TABLES = ['profiles', 'user_roles', 'community_workspaces'];

const label = (communityId: string) => (communityId === COMMUNITY_A ? 'A' : 'B');
const communityInfo = (communityId: string) => ({
  id: communityId,
  name: `Comunidad ${label(communityId)}`,
  display_name: `Comunidad ${label(communityId)}`,
  school_name: `Escuela ${label(communityId)}`,
  generation_name: `Generación ${label(communityId)}`,
});
const ACCESS = {
  canAccess: true,
  accessType: 'admin',
  availableCommunities: [communityInfo(COMMUNITY_A), communityInfo(COMMUNITY_B)],
  defaultCommunityId: COMMUNITY_A,
};
const workspaceIdFor = (communityId: string) => `ws-${label(communityId)}`;
const workspaceFor = (communityId: string) => ({
  id: workspaceIdFor(communityId),
  community_id: communityId,
  name: `Espacio ${label(communityId)}`,
  settings: {},
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  community: { id: communityId, name: `GC ${label(communityId)}` },
});
/** The one thread of a community's workspace: THREAD_A lives in ws-A only,
 *  THREAD_B in ws-B only. */
const threadFor = (communityId: string) => ({
  id: `thread-${label(communityId)}`,
  workspace_id: workspaceIdFor(communityId),
  thread_title: `Hilo ${label(communityId)}`,
  description: '',
  category: 'general',
  created_by: 'user-1',
  is_pinned: false,
  is_locked: false,
  is_archived: false,
  last_message_at: '2026-01-01T00:00:00.000Z',
  message_count: 0,
  participant_count: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  creator_name: 'Admin',
  creator_email: 'admin@fne.cl',
  participants: [],
  category_config: { color: '#3b82f6', label: 'General' },
});
const THREAD_A = threadFor(COMMUNITY_A);
const THREAD_B = threadFor(COMMUNITY_B);
/** `getWorkspaceThreads(workspaceId)` answers with that workspace's thread only. */
const threadsFor = (workspaceId: string) =>
  [THREAD_A, THREAD_B].filter((thread) => thread.workspace_id === workspaceId);
const PERMISSIONS = {
  can_view_messages: true,
  can_send_messages: true,
  can_create_threads: true,
  can_edit_own_messages: false,
  can_delete_own_messages: false,
  can_moderate_messages: false,
  can_pin_threads: false,
  can_archive_threads: false,
  can_upload_attachments: false,
  can_mention_all: false,
  can_view_analytics: false,
  can_manage_reactions: false,
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

/** A Supabase client that records every table read so the suite can prove no
 *  candidate is ever read from profiles / user_roles / community_workspaces. */
function recordingClient() {
  const empty = { data: [], error: null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: unknown) => void) => resolve(empty),
  };
  return {
    from: (table: string) => {
      h.fromCalls.push(table);
      return chain;
    },
    auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token', user: { id: 'user-1' } } } }) },
    storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
  };
}

vi.mock('next/router', () => ({ useRouter: () => h.router }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('react-hot-toast', () => {
  const toast = { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() };
  return { toast, default: toast, Toaster: () => null };
});
vi.mock('../../../utils/navigationManager', () => ({
  navigationManager: { navigate: async (run: () => Promise<void>) => run() },
}));
vi.mock('../../../lib/supabase', () => ({ supabase: recordingClient() }));
vi.mock('@supabase/auth-helpers-react', () => ({ useSupabaseClient: () => recordingClient() }));

vi.mock('../../../utils/workspaceUtils', () => ({
  getUserWorkspaceAccess: async () => ACCESS,
  getOrCreateWorkspace: async (communityId: string) => {
    await h.workspaceGates.get(communityId);
    return workspaceFor(communityId);
  },
  logWorkspaceActivity: async () => undefined,
}));
vi.mock('../../../lib/services/communityWorkspace', () => ({
  communityWorkspaceService: { canEditWorkspace: async () => ({ canEdit: false }) },
}));
vi.mock('../../../lib/community/fetchCommunityMembers', () => ({
  fetchCommunityMembers: async () => [],
}));
vi.mock('../../../utils/meetingUtils', () => ({
  getMeetings: async () => [],
  getMeetingDetails: async () => null,
  canUserManageMeetings: async () => false,
}));
vi.mock('../../../utils/documentUtils', () => ({
  getWorkspaceDocuments: async () => ({ documents: [], folders: [] }),
  getUserDocumentPermissions: async () => ({ can_view: true, can_edit: false, can_delete: false, can_upload: false }),
  uploadDocument: vi.fn(),
  createFolder: vi.fn(),
  incrementDocumentCounter: vi.fn(),
  getFolderBreadcrumb: async () => [],
  extractUniqueTags: () => [],
}));
vi.mock('../../../utils/messagingUtils-simple', () => ({
  getWorkspaceThreads: async (workspaceId: string) => {
    h.threadLoads.push(workspaceId);
    return threadsFor(workspaceId);
  },
  getWorkspaceMessages: async (_workspaceId: string, filters: { thread_id?: string }) =>
    h.messages.filter((message) => message.thread_id === filters.thread_id),
  getUserMessagingPermissions: async () => PERMISSIONS,
  createThread: vi.fn(),
  sendMessage: vi.fn(),
  subscribeToWorkspaceMessages: (workspaceId: string, callbacks: any) => {
    const subscription = { workspaceId, callbacks, unsubscribe: vi.fn() };
    h.subscriptions.push(subscription);
    return { unsubscribe: subscription.unsubscribe };
  },
}));
vi.mock('../../../utils/activityUtils', () => ({
  getActivityFeed: async () => [],
  getActivitySubscription: async () => null,
  updateActivitySubscription: vi.fn(),
  getActivityPermissions: async () => null,
}));

// Layout and sibling components are irrelevant to the mention state.
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
vi.mock('../../../components/common/LoadingSkeleton', () => ({ default: () => null }));
vi.mock('../../../components/tutorials/HelpButton', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingFilters', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingCard', () => ({ default: () => null }));
vi.mock('../../../components/meetings/MeetingDocumentationModal', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentUploadModal', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentGrid', () => ({ default: () => null }));
vi.mock('../../../components/documents/FolderNavigation', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentPreview', () => ({ default: () => null }));
vi.mock('../../../components/documents/DocumentFilters', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageFilters', () => ({ default: () => null }));
vi.mock('../../../components/messaging/MessageThread', () => ({ default: () => null }));
// The message card stub: shows the message and whether the page handed it the
// attachment download action, and lets the test press that action.
vi.mock('../../../components/messaging/MessageCard', () => ({
  default: ({ message, onDownloadAttachment }: { message: any; onDownloadAttachment?: (attachment: any) => void }) => (
    <div data-testid="message-card" data-message-id={message.id} data-can-download={onDownloadAttachment ? 'yes' : 'no'}>
      {message.content}
      {(message.attachments ?? []).map((attachment: any) => (
        <button key={attachment.id} type="button" data-testid={`download-${attachment.id}`} onClick={() => onDownloadAttachment?.(attachment)}>
          {attachment.file_name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/messaging/AttachmentPreview', () => ({ default: () => null }));
vi.mock('../../../components/messaging/ThreadCreationModal', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityFeed', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivitySummary', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityNotifications', () => ({ default: () => null }));
vi.mock('../../../components/activity/ActivityFeedPlaceholder', () => ({ default: () => null }));
vi.mock('../../../components/community/WorkspaceSettingsModal', () => ({ default: () => null }));
vi.mock('../../../components/feed/FeedContainer', () => ({ default: () => null }));
vi.mock('../../../components/workspace/WorkspaceTabNavigation', () => ({ default: () => null }));
vi.mock('../../../components/workspace/WorkspaceSessionsTab', () => ({ default: () => null }));


vi.mock('../../../components/messaging/MessageComposer', () => ({ default: () => <div data-testid="composer" /> }));

import CommunityWorkspacePage from '../../../pages/community/workspace';

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openThread(utils: RenderResult, communityId: string) {
  const thread = threadFor(communityId);
  const title = await utils.findByText(thread.thread_title);
  await act(async () => {
    fireEvent.click(title);
  });
  await utils.findByTestId('composer');
  await flush();
}

const cardIds = (utils: RenderResult) => utils.queryAllByTestId('message-card').map((card) => card.getAttribute('data-message-id'));

const message = (id: string, threadId: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspace_id: 'ws-A',
  thread_id: threadId,
  author_id: 'user-2',
  author_name: 'María-José Núñez',
  content: `Mensaje ${id}`,
  created_at: '2026-11-16T12:00:00.000Z',
  reactions: [],
  attachments: [],
  mentions: [],
  ...extra,
});

/** What the live connection delivers for a new message (the newest subscription). */
async function deliver(incoming: Record<string, unknown>) {
  const live = h.subscriptions[h.subscriptions.length - 1];
  await act(async () => {
    live.callbacks.onMessage?.(incoming);
  });
}

beforeEach(() => {
  h.fromCalls.length = 0;
  h.workspaceGates.clear();
  h.threadLoads.length = 0;
  h.subscriptions.length = 0;
  h.messages = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ members: [] }), { status: 200 })) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EC-M7 attachments of a message can be opened or downloaded', () => {
  it('every message card gets the download action, and a PDF goes through /api/storage/download', async () => {
    const pdf = {
      id: 'att-1',
      message_id: 'm1',
      file_name: 'acta.pdf',
      mime_type: 'application/pdf',
      file_size: 1200,
      storage_path: 'https://example.invalid/storage/v1/object/public/message-attachments/ws-A/m1/acta.pdf',
    };
    h.messages = [message('m1', THREAD_A.id, { attachments: [pdf] })];
    const utils = render(<CommunityWorkspacePage />);
    await openThread(utils, COMMUNITY_A);
    await waitFor(() => expect(cardIds(utils)).toEqual(['m1']));

    expect(utils.getByTestId('message-card').getAttribute('data-can-download')).toBe('yes');

    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 }));
    global.fetch = fetchMock as any;
    (window.URL as any).createObjectURL = vi.fn(() => 'blob:f11');
    (window.URL as any).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await act(async () => {
      fireEvent.click(utils.getByTestId('download-att-1'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/^\/api\/storage\/download\?url=.*&filename=acta\.pdf$/);
  });
});
