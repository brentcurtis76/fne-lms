// @vitest-environment jsdom
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * @mention candidates are scoped to the workspace community.
 *
 * The messaging tab of /community/workspace keeps its @mention candidates
 * (`communityMembers`) and the filtered `mentionSuggestions` in component
 * state. Switching growth community makes the parent pass `workspace = null`
 * and then the new workspace: both lists must be emptied at once, the request
 * of the community being left must be cancelled, and a response that settles
 * late must be ignored — so Community B, even a valid empty one, never offers
 * Community A's people. `GET /api/community/members` stays the only candidate
 * source and every failure leaves the lists empty.
 *
 * The tab must also get a NEW identity per community (`key` on the parent's
 * `MessagingTabContent` call): nothing selected in Community A — thread,
 * composer, messages, reply/edit targets — may survive into Community B, so a
 * message can never be sent with B's workspace id and A's thread id. Each
 * workspace owns exactly one thread here (THREAD_A in ws-A, THREAD_B in ws-B),
 * `getWorkspaceThreads` answers only for the workspace it is asked about, and
 * the composer stub exposes the workspace/thread pair it would send with.
 *
 * The REAL page is rendered; its data utilities are mocked, `fetch` is a
 * route-aware stub keyed by `community_id`, and the composer is replaced by a
 * stub that renders the suggestions it receives and exposes a button that asks
 * for mentions exactly like typing `@` does (`onRequestMentions('')`).
 */

// ---------------------------------------------------------------------------
// Shared state the mock factories reach lazily (hoisted above the mocks)
// ---------------------------------------------------------------------------

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
    auth: { getSession: async () => ({ data: { session: null } }) },
    storage: { from: () => ({ remove: async () => ({ data: null, error: null }) }) },
  };
}

vi.mock('next/router', () => ({ useRouter: () => h.router }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('react-hot-toast', () => {
  const toast = { error: vi.fn(), success: vi.fn() };
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
  getWorkspaceMessages: async () => [],
  getUserMessagingPermissions: async () => PERMISSIONS,
  createThread: vi.fn(),
  sendMessage: vi.fn(),
  subscribeToWorkspaceMessages: () => ({ unsubscribe: () => undefined }),
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
vi.mock('../../../components/messaging/MessageCard', () => ({ default: () => null }));
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

// The composer stub: renders exactly the suggestions it is given, asks for
// mentions the way the real picker does after `@` is typed, and exposes the
// workspace/thread pair the page handed it — the pair a send would carry.
vi.mock('../../../components/messaging/MessageComposer', () => ({
  default: ({
    workspaceId,
    threadId,
    mentionSuggestions = [],
    onRequestMentions,
  }: {
    workspaceId: string;
    threadId: string;
    mentionSuggestions?: Array<{ id: string; display_name: string }>;
    onRequestMentions?: (query: string) => void;
  }) => (
    <div data-testid="mention-composer" data-workspace-id={workspaceId} data-thread-id={threadId}>
      <button type="button" data-testid="mention-request" onClick={() => onRequestMentions?.('')}>
        @
      </button>
      <ul data-testid="mention-suggestions">
        {mentionSuggestions.map((suggestion) => (
          <li key={suggestion.id}>{suggestion.display_name}</li>
        ))}
      </ul>
    </div>
  ),
}));

import CommunityWorkspacePage from '../../../pages/community/workspace';

// ---------------------------------------------------------------------------
// Route-aware fetch stub keyed by community_id
// ---------------------------------------------------------------------------

type MembersResponder = (init?: RequestInit) => Promise<Response>;
type RecordedRequest = { url: string; communityId: string | null; signal: AbortSignal | null; settled: boolean };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const membersOk = (members: unknown[]): MembersResponder => async () => jsonResponse({ members });
const membersStatus = (status: number): MembersResponder => async () => jsonResponse({ error: 'nope' }, status);

const responders = new Map<string, MembersResponder>();
const requests: RecordedRequest[] = [];

function installFetch() {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const communityId = url.startsWith('/api/community/members')
      ? new URL(url, 'http://localhost').searchParams.get('community_id')
      : null;
    const record: RecordedRequest = { url, communityId, signal: init?.signal ?? null, settled: false };
    requests.push(record);
    try {
      if (!communityId) return jsonResponse({ error: 'unexpected request' }, 404);
      const responder = responders.get(communityId) ?? membersOk([]);
      return await responder(init);
    } finally {
      record.settled = true;
    }
  }) as unknown as typeof fetch;
}

/** A members body the test settles by hand. Every caller gets its own Response
 *  (a body can be read once), and an aborted request can mirror a real fetch
 *  by rejecting with AbortError. */
function deferredMembers(options: { rejectOnAbort?: boolean } = {}) {
  let resolveBody!: (members: unknown[]) => void;
  const body = new Promise<unknown[]>((resolve) => {
    resolveBody = resolve;
  });
  const responder: MembersResponder = (init) =>
    new Promise<Response>((resolve, reject) => {
      if (options.rejectOnAbort) {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }
      body.then((members) => resolve(jsonResponse({ members })));
    });
  return { responder, resolveWith: resolveBody };
}

/** Every request for one community (the page's member panel issues the same
 *  GET as the mention loader). */
const requestsFor = (communityId: string) => requests.filter((request) => request.communityId === communityId);

/** The mention loader's requests: the only ones that carry an AbortSignal
 *  (the member panel passes none). Used for the cancellation assertions. */
const mentionRequests = (communityId: string) =>
  requestsFor(communityId).filter((request) => request.signal !== null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Wait until every request issued for a community has settled and the
 *  loader has processed the outcome. */
async function settled(communityId: string) {
  await waitFor(() => {
    const list = requestsFor(communityId);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.every((request) => request.settled)).toBe(true);
  });
  await flush();
}

function suggestionNames(utils: RenderResult) {
  return Array.from(utils.getByTestId('mention-suggestions').querySelectorAll('li')).map((li) => li.textContent);
}

/** What typing `@` does: ask the tab for suggestions with an empty query. */
async function askForMentions(utils: RenderResult) {
  await act(async () => {
    fireEvent.click(utils.getByTestId('mention-request'));
  });
}

/** The workspace/thread pair the mounted composer would send with. */
function composerScope(utils: RenderResult) {
  const composer = utils.getByTestId('mention-composer');
  return {
    workspaceId: composer.getAttribute('data-workspace-id'),
    threadId: composer.getAttribute('data-thread-id'),
  };
}

/** Wait until the tab of `communityId` is up (it asked for its own threads),
 *  then prove it started fresh: no composer mounted and nothing of the other
 *  community's thread on screen. Without a new component identity per
 *  community the previous selection survives the switch and this fails. */
async function tabLoaded(utils: RenderResult, communityId: string) {
  await waitFor(() => expect(h.threadLoads).toContain(workspaceIdFor(communityId)));
  await flush();
  expect(utils.queryByTestId('mention-composer')).toBeNull();
  const otherThread = communityId === COMMUNITY_A ? THREAD_B : THREAD_A;
  expect(utils.queryByText(otherThread.thread_title)).toBeNull();
}

/** Open the community's own thread from the thread list. The composer must
 *  not exist before (a fresh tab has nothing selected) and, once mounted,
 *  must carry exactly this community's workspace and thread. */
async function openThread(utils: RenderResult, communityId: string) {
  expect(utils.queryByTestId('mention-composer')).toBeNull();
  const thread = threadFor(communityId);
  const title = await utils.findByText(thread.thread_title);
  await act(async () => {
    fireEvent.click(title);
  });
  await utils.findByTestId('mention-composer');
  expect(composerScope(utils)).toEqual({ workspaceId: thread.workspace_id, threadId: thread.id });
}

/** Pick another community in the page's selector, exactly like the user does. */
async function switchCommunity(utils: RenderResult, fromName: string, toName: string) {
  const [current] = utils.getAllByText(fromName);
  await act(async () => {
    fireEvent.click(current.closest('button') as HTMLElement);
  });
  const target = utils.getByText(toName);
  await act(async () => {
    fireEvent.click(target.closest('button') as HTMLElement);
  });
}

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

const mentionErrors = () =>
  vi.mocked(console.error).mock.calls.filter(([first]) => String(first).startsWith('[Mentions]'));

function expectMembersEndpointOnly() {
  expect(h.fromCalls.filter((table) => DIRECT_MEMBER_TABLES.includes(table))).toEqual([]);
  expect(requests.map((request) => request.url.split('?')[0])).toEqual(
    requests.map(() => '/api/community/members'),
  );
}

beforeEach(() => {
  h.fromCalls.length = 0;
  h.workspaceGates.clear();
  h.threadLoads.length = 0;
  requests.length = 0;
  responders.clear();
  installFetch();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('/community/workspace — @mention candidates are scoped to the workspace community', () => {
  it('empties both lists the moment the community switches, so an empty Community B never offers Community A', async () => {
    responders.set(COMMUNITY_A, membersOk([MEMBER_ANA, MEMBER_BRUNO]));
    const b = deferredMembers();
    responders.set(COMMUNITY_B, b.responder);

    const utils = render(<CommunityWorkspacePage />);
    await openThread(utils, COMMUNITY_A);
    await settled(COMMUNITY_A);
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual(['Ana Uno', 'Bruno Dos']);

    const requestsBeforeSwitch = requests.length;
    await switchCommunity(utils, 'Comunidad A', 'Comunidad B');
    // Community B is in with a fresh tab: nothing of A is selected, and the
    // composer only exists once THREAD_B is opened — with ws-B and THREAD_B.
    await tabLoaded(utils, COMMUNITY_B);
    await openThread(utils, COMMUNITY_B);
    // B has not answered yet: nothing from A survives.
    expect(suggestionNames(utils)).toEqual([]);
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);

    // A valid, empty Community B explicitly leaves both lists empty.
    b.resolveWith([]);
    await settled(COMMUNITY_B);
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);
    expect(composerScope(utils)).toEqual({ workspaceId: 'ws-B', threadId: THREAD_B.id });

    expect(requests.slice(requestsBeforeSwitch).filter((request) => request.communityId === COMMUNITY_A)).toEqual([]);
    expectMembersEndpointOnly();
  });

  it("ignores Community A's response when it settles after the switch to Community B", async () => {
    const a = deferredMembers();
    responders.set(COMMUNITY_A, a.responder);
    responders.set(COMMUNITY_B, membersOk([]));

    const utils = render(<CommunityWorkspacePage />);
    await openThread(utils, COMMUNITY_A);
    await waitFor(() => expect(requestsFor(COMMUNITY_A).length).toBeGreaterThanOrEqual(1));
    // A is still loading: nothing is offered.
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);

    await switchCommunity(utils, 'Comunidad A', 'Comunidad B');
    await tabLoaded(utils, COMMUNITY_B);
    await openThread(utils, COMMUNITY_B);
    await settled(COMMUNITY_B);
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);

    // The late A response must neither populate B nor be reported as an error.
    a.resolveWith([MEMBER_ANA, MEMBER_BRUNO]);
    await flush();
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);
    expect(mentionErrors()).toEqual([]);
    expect(composerScope(utils)).toEqual({ workspaceId: 'ws-B', threadId: THREAD_B.id });

    // A's request was cancelled when A was left (the tab that issued it was
    // unmounted), and asking while A was still loading did not issue a
    // duplicate request.
    expect(mentionRequests(COMMUNITY_A)).toHaveLength(1);
    expect(mentionRequests(COMMUNITY_A)[0]?.signal?.aborted).toBe(true);
    expectMembersEndpointOnly();
  });

  it('clears and cancels during the workspace=null transition, before Community B has loaded', async () => {
    const a = deferredMembers();
    const b = deferredMembers();
    responders.set(COMMUNITY_A, a.responder);
    responders.set(COMMUNITY_B, b.responder);
    const workspaceB = gate();
    h.workspaceGates.set(COMMUNITY_B, workspaceB.promise);

    const utils = render(<CommunityWorkspacePage />);
    await openThread(utils, COMMUNITY_A);
    await waitFor(() => expect(requestsFor(COMMUNITY_A).length).toBeGreaterThanOrEqual(1));

    await switchCommunity(utils, 'Comunidad A', 'Comunidad B');
    // The parent passes workspace = null while the new workspace loads: the
    // tab is replaced, so A's open thread and its composer are gone, not hidden.
    await utils.findByText('Selecciona una comunidad para acceder a la mensajería.');
    expect(utils.queryByTestId('mention-composer')).toBeNull();
    expect(utils.queryByText(THREAD_A.thread_title)).toBeNull();
    expect(requestsFor(COMMUNITY_B)).toEqual([]);
    // A's request was cancelled by the null transition itself.
    expect(mentionRequests(COMMUNITY_A)[0]?.signal?.aborted).toBe(true);

    // A answers while no community is selected: it must not be kept for B.
    a.resolveWith([MEMBER_ANA, MEMBER_BRUNO]);
    await flush();

    workspaceB.open();
    // B starts fresh — no thread selected — and only THREAD_B can be opened.
    await tabLoaded(utils, COMMUNITY_B);
    await openThread(utils, COMMUNITY_B);
    // B is in and still loading: nothing from A is offered.
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);
    b.resolveWith([]);
    await settled(COMMUNITY_B);
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);
    expect(mentionErrors()).toEqual([]);
    expect(composerScope(utils)).toEqual({ workspaceId: 'ws-B', threadId: THREAD_B.id });
    expectMembersEndpointOnly();
  });

  it('keeps both lists empty on non-2xx, malformed and failed responses and never asks another source', async () => {
    responders.set(COMMUNITY_A, membersStatus(500));

    const utils = render(<CommunityWorkspacePage />);
    await openThread(utils, COMMUNITY_A);
    await settled(COMMUNITY_A);

    // Each ask reveals the list left by the previous outcome and retries the load.
    responders.set(COMMUNITY_A, async () => jsonResponse({ members: 'not-a-list' }));
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);
    await settled(COMMUNITY_A);

    responders.set(COMMUNITY_A, async () => {
      throw new TypeError('Failed to fetch');
    });
    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);
    await settled(COMMUNITY_A);

    await askForMentions(utils);
    expect(suggestionNames(utils)).toEqual([]);

    expect(mentionErrors().length).toBeGreaterThanOrEqual(3);
    expect(requests.every((request) => request.communityId === COMMUNITY_A)).toBe(true);
    expectMembersEndpointOnly();
  });

  it('aborts the pending request on unmount and stays silent when it settles afterwards', async () => {
    const a = deferredMembers({ rejectOnAbort: true });
    responders.set(COMMUNITY_A, a.responder);

    const utils = render(<CommunityWorkspacePage />);
    await waitFor(() => expect(mentionRequests(COMMUNITY_A)).toHaveLength(1));
    const [request] = mentionRequests(COMMUNITY_A);
    expect(request.signal?.aborted).toBe(false);

    utils.unmount();
    expect(request.signal?.aborted).toBe(true);
    await flush();
    expect(mentionErrors()).toEqual([]);
  });
});
