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
 * without waiting for a reload of the profile. Such a choice belongs to the account that made it
 * and to the facts it was made on: when the session's account, the account's stored look or the
 * loading state changes, it is forgotten and the profile speaks again. It only ever counts for an
 * account that is offered the choice.
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
 * layout effect (send-back 2), so it is there before the browser paints that commit. No effect writes a state the attribute is read from, so an account and a route that
 * change in the same render cannot leave the previous account's look behind.
 */
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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

/** A choice made through `setLook`, with the facts it was made on. */
interface SavedChoice {
  look: Look;
  account: string | null;
  accountLook: Look;
  loading: boolean;
}

/** What the attribute should be: a look, or "leave" (the page is left as it is). */
type Target = Look | 'leave';

export function LookProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSessionContext();
  const { user, profile, loading } = useAuth();
  const { pathname } = useRouter();
  const [saved, setSaved] = useState<SavedChoice | null>(null);

  const sessionUserId = session?.user?.id ?? null;
  const isThisAccount = Boolean(sessionUserId && user?.id === sessionUserId && profile?.id === sessionUserId);
  const accountLook: Look = isThisAccount ? lookOfAccount(profile) : 'clasico';
  const applies = lookAppliesTo(pathname);

  // A saved choice made on other facts is forgotten here, during the render (not in an effect), so
  // it can never be read again: not after the account changes, not when it comes back.
  const savedIsCurrent =
    saved !== null &&
    saved.account === sessionUserId &&
    saved.accountLook === accountLook &&
    saved.loading === loading;
  if (saved !== null && !savedIsCurrent) setSaved(null);

  // The account's look for this render: a choice just saved for it, else its profile's.
  const choice: Look =
    savedIsCurrent && isThisAccount && mayChooseLook(profile) ? (saved as SavedChoice).look : accountLook;
  // The look of this page: the account's, except on the pages the look never touches.
  const look: Look = applies ? choice : 'clasico';
  const target: Target = !applies ? 'clasico' : loading ? 'leave' : choice;

  useIsomorphicLayoutEffect(() => {
    if (target !== 'leave') applyLook(target);
  }, [target]);

  const setLook = useCallback(
    (next: Look) => setSaved({ look: next, account: sessionUserId, accountLook, loading }),
    [sessionUserId, accountLook, loading]
  );

  const value = useMemo(() => ({ look, setLook }), [look, setLook]);
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

/** The look of the signed-in account, and a way to show another at once after saving it. */
export function useLook(): LookContextValue {
  return useContext(LookContext);
}
