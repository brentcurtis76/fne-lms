/**
 * The signed-in account as the real look provider sees it, for the session page's latch tests (redesign
 * 6S, release SB, second send-back). The real `LookProvider` is rendered; it reads two things that are
 * faked here, in the shape and with the timing of the real ones:
 *   - `useSessionContext()` (Supabase's session): it changes the moment another account signs in;
 *   - `useAuth()` (AuthContext): a fresh value object on every render of its provider. The tests set
 *     its user and profile by hand, also to states in which they belong to a different account than
 *     the session's, so that the page's answer to every such state is pinned.
 * The page is passed as `children` of the harness, as `_app` passes it to the providers, so a render of
 * the providers does not by itself render the page. Every account here is invented.
 */
import React from 'react';
import { act } from '@testing-library/react';

export interface FakeProfile {
  id: string;
  can_run_qa_tests: boolean;
  learning_preferences: Record<string, unknown>;
}

interface State {
  session: { access_token: string; user: { id: string } } | null;
  user: { id: string } | null;
  profile: FakeProfile | null;
  loading: boolean;
  avatarUrl: string;
}

/** An invented account: a tester on the new look, a tester on today's look, or not a tester. */
export function account(id: string, look: 'nuevo' | 'clasico' | 'not-a-tester'): FakeProfile {
  return {
    id,
    can_run_qa_tests: look !== 'not-a-tester',
    learning_preferences: look === 'nuevo' ? { ui_look: 'nuevo' } : {},
  };
}

const SessionCtx = React.createContext<{ session: State['session']; isLoading: boolean }>({ session: null, isLoading: true });
const AuthCtx = React.createContext<Record<string, unknown>>({ user: null, profile: null, loading: true });

let setState: React.Dispatch<React.SetStateAction<State>> = () => {};
const SIGNED_OUT_LOADING: State = { session: null, user: null, profile: null, loading: true, avatarUrl: '' };
let start: State = SIGNED_OUT_LOADING;

export function AuthHarness({ children }: { children: React.ReactNode }) {
  const [state, set] = React.useState<State>(start);
  setState = set;
  const sessionValue = React.useMemo(() => ({ session: state.session, isLoading: false }), [state.session]);
  // A new object on every render, as AuthContext's provider builds its value.
  const authValue = {
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    isAdmin: false,
    isGlobalAdmin: false,
    userRoles: [],
    avatarUrl: state.avatarUrl,
  };
  return (
    <SessionCtx.Provider value={sessionValue}>
      <AuthCtx.Provider value={authValue}>{children}</AuthCtx.Provider>
    </SessionCtx.Provider>
  );
}

export const useSessionContext = () => React.useContext(SessionCtx);
export const useAuth = () => React.useContext(AuthCtx);

const sessionOf = (id: string) => ({ access_token: `synthetic-token-${id}`, user: { id } });

/** The harness's steps, each in its own act (one commit each). */
export const auth = {
  /** Before the render: nobody known yet (the default), or this account signed in with its profile loaded. */
  startWith(profile: FakeProfile | null) {
    start = profile
      ? { session: sessionOf(profile.id), user: { id: profile.id }, profile, loading: false, avatarUrl: '' }
      : SIGNED_OUT_LOADING;
  },
  /** An account signs in; its profile is still loading. */
  async signIn(id: string) {
    await act(async () => setState((s) => ({ ...s, session: sessionOf(id), loading: true })));
  },
  /** Another account signs in on the same tab: the session changes, the previous user and profile stay. */
  async switchTo(id: string) {
    await act(async () => setState((s) => ({ ...s, session: sessionOf(id) })));
  },
  /** The session account's profile arrives: user and profile change together, loading ends. */
  async profileArrives(profile: FakeProfile) {
    await act(async () => setState((s) => ({ ...s, user: { id: profile.id }, profile, loading: false })));
  },
  /** The profile could not be loaded: only loading ends; whatever was there stays. */
  async profileFails() {
    await act(async () => setState((s) => ({ ...s, loading: false })));
  },
  /**
   * Updates of the account's state that change neither the account nor its look: a refreshed token (a
   * new session object for the same account), then a new auth value with the same user and profile.
   */
  async sameAccountUpdates() {
    await act(async () => setState((s) => ({ ...s, session: s.session && sessionOf(s.session.user.id) })));
    await act(async () => setState((s) => ({ ...s, avatarUrl: `${s.avatarUrl}x` })));
  },
};

/** Per stand-in: its renders, and the `sessionId` prop of each of its mounts. */
export const counts = { renders: {} as Record<string, number>, mounts: {} as Record<string, string[]> };
export function resetCounts() {
  counts.renders = {};
  counts.mounts = {};
}

/** A stand-in for a piece of the body that counts its renders and writes down each mount's session. */
export function counted(name: string) {
  return function Counted(props: { sessionId?: string }) {
    counts.renders[name] = (counts.renders[name] ?? 0) + 1;
    React.useEffect(() => {
      (counts.mounts[name] ??= []).push(props.sessionId ?? '');
      // Only at the mount: the request the real panel sends when it mounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-counted={name} />;
  };
}
