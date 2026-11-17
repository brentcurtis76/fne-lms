/**
 * The account's look ("clasico" or "nuevo"), kept on the page as `data-look` on `<html>`.
 *
 * The profile is the truth (`profiles.learning_preferences.ui_look`, read through AuthContext,
 * which already loads the whole profile row). This provider turns it into the attribute:
 *   - while the session or the profile is still loading: the page is left as it is;
 *   - signed in, and the profile loaded is that session's: the look of the account
 *     (`lookOfAccount`: its stored choice, only while the account is offered the choice);
 *   - signed out, no profile, or a profile that is still the previous account's (AuthContext
 *     keeps the old one until the new one has loaded): today's look.
 * `setLook` is for the one screen that saves a choice («Apariencia»): it shows the look at once,
 * without waiting for a reload of the profile, also while the account is still loading (the screen
 * is drawn by the server and can save before the browser has loaded the account). Such a choice
 * belongs to the session's account at the moment `setLook` is called (with no session account it
 * is not kept), and it remembers the stored look of the first profile of that account it meets (the
 * one loaded when it was called, or the first one to arrive after). It is forgotten, and the profile
 * speaks again, when the session's account is another one or none, or when a later profile of the
 * same account holds a different stored look than that first one (a newer truth). The profile
 * arriving is not, by itself, a reason to forget it. It never counts for an account whose loaded
 * profile is not offered the choice (send-back 3).
 *
 * Pages that are not the platform (the sign-in family, the public site, documents for a client,
 * the error pages: `PAGES_WITHOUT_THE_LOOK` in lib/look) always get today's look, whatever the
 * account chose: the attribute is removed there and `look` answers "clasico". The router's
 * pathname is asked on every route change, so going from a platform page to the public home page
 * and back drops and restores the attribute without a reload. Who is offered the look and what is
 * saved do not change.
 *
 * BY CONSTRUCTION (redesign 5a, send-back 1): the attribute is a pure function of this render's
 * facts (loading, the session's account, that account's profile, the pathname, a choice just saved
 * through `setLook` for this account), worked out during the render and put on the page by ONE
 * layout effect (send-back 2; the only effect that touches the attribute), so it is there before the
 * browser paints that commit. No effect writes a state the attribute is read from (the other layout
 * effect writes only the ref `setLook` reads its facts from), so an account and a route that change
 * in the same render cannot leave the previous account's look behind.
 */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useAuth } from './AuthContext';
import { applyLook, lookAppliesTo, lookOfAccount, mayChooseLook, type Look } from '../lib/look';

// A layout effect puts the attribute on the page in the same commit as everything that changed
// with it, before the browser paints. On the server (where useLayoutEffect warns) a plain effect
// stands in; it never runs there anyway.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface LookContextValue {
  look: Look;
  setLook: (look: Look) => void;
}

const LookContext = createContext<LookContextValue>({ look: 'clasico', setLook: () => {} });

/**
 * A choice made through `setLook`: the look, the session's account it belongs to, and the stored look
 * of that account's profile it was made on (`null` while no profile of that account had loaded yet;
 * the first one to arrive fills it in).
 */
interface SavedChoice {
  look: Look;
  account: string;
  accountLook: Look | null;
}

/** What the attribute should be: a look, or "leave" (the page is left as it is). */
type Target = Look | 'leave';

/**
 * The saved choice as it stands for this render's facts: kept, completed with the first profile of
 * its account, or forgotten (`null`). Pure.
 */
function savedForThisRender(
  saved: SavedChoice | null,
  sessionUserId: string | null,
  isThisAccount: boolean,
  accountLook: Look
): SavedChoice | null {
  if (saved === null) return null;
  if (saved.account !== sessionUserId) return null;
  if (!isThisAccount) return saved;
  if (saved.accountLook === null) return { ...saved, accountLook };
  return saved.accountLook === accountLook ? saved : null;
}

export function LookProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSessionContext();
  const { user, profile, loading } = useAuth();
  const { pathname } = useRouter();
  const [saved, setSaved] = useState<SavedChoice | null>(null);

  const sessionUserId = session?.user?.id ?? null;
  const isThisAccount = Boolean(sessionUserId && user?.id === sessionUserId && profile?.id === sessionUserId);
  const accountLook: Look = isThisAccount ? lookOfAccount(profile) : 'clasico';
  const applies = lookAppliesTo(pathname);

  // The saved choice is worked out here, during the render (not in an effect): forgotten for good
  // when it is no longer the session account's or a newer profile contradicts it, so it can never be
  // read again (not after the account changes, not when it comes back); completed with the stored
  // look of the first profile of its account that arrives.
  const current = savedForThisRender(saved, sessionUserId, isThisAccount, accountLook);
  if (current !== saved) setSaved(current);

  // A saved choice counts while its account's profile is loaded and offered the choice, and, before
  // that profile has arrived, while the account is still loading.
  const savedCounts = current !== null && (isThisAccount ? mayChooseLook(profile) : loading);
  // The account's look for this render: a choice just saved for it, else its profile's.
  const choice: Look = savedCounts ? (current as SavedChoice).look : accountLook;
  // The look of this page: the account's, except on the pages the look never touches.
  const look: Look = applies ? choice : 'clasico';
  const target: Target = !applies ? 'clasico' : savedCounts ? choice : loading ? 'leave' : choice;

  useIsomorphicLayoutEffect(() => {
    if (target !== 'leave') applyLook(target);
  }, [target]);

  // `setLook` keeps ONE identity for the provider's whole life (as in 5b), so the context's value
  // changes only when `look` does and a memoised reader is not rendered again when only the account
  // or the loading state moves. The facts a choice is made on are kept in a ref, written after every
  // commit (before any event can run) and read when `setLook` is called: a caller holding the
  // function of an older render still saves on the facts of now. This effect writes only the ref.
  const factsRef = useRef({ account: sessionUserId, accountLook: isThisAccount ? accountLook : null });
  useIsomorphicLayoutEffect(() => {
    factsRef.current = { account: sessionUserId, accountLook: isThisAccount ? accountLook : null };
  });

  const setLook = useCallback((next: Look) => {
    const { account, accountLook: madeOn } = factsRef.current;
    if (account === null) return;
    setSaved({ look: next, account, accountLook: madeOn });
  }, []);

  const value = useMemo(() => ({ look, setLook }), [look, setLook]);
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

/** The look of the signed-in account, and a way to show another at once after saving it. */
export function useLook(): LookContextValue {
  return useContext(LookContext);
}
