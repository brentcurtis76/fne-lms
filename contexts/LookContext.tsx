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
 * without waiting for a reload of the profile.
 *
 * Pages that are not the platform (the sign-in family, the public site, documents for a client,
 * the error pages: `PAGES_WITHOUT_THE_LOOK` in lib/look) always get today's look, whatever the
 * account chose: the attribute is removed there and `look` answers "clasico". The router's
 * pathname is asked on every route change, so going from a platform page to the public home page
 * and back drops and restores the attribute without a reload. Who is offered the look and what is
 * saved do not change.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useAuth } from './AuthContext';
import { applyLook, lookAppliesTo, lookOfAccount, type Look } from '../lib/look';

interface LookContextValue {
  look: Look;
  setLook: (look: Look) => void;
}

const LookContext = createContext<LookContextValue>({ look: 'clasico', setLook: () => {} });

export function LookProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSessionContext();
  const { user, profile, loading } = useAuth();
  const { pathname } = useRouter();
  const [chosen, setChosen] = useState<Look>('clasico');

  const sessionUserId = session?.user?.id ?? null;
  const isThisAccount = Boolean(sessionUserId && user?.id === sessionUserId && profile?.id === sessionUserId);
  const accountLook: Look = isThisAccount ? lookOfAccount(profile) : 'clasico';
  const applies = lookAppliesTo(pathname);
  // The look of this page: the account's, except on the pages the look never touches.
  const look: Look = applies ? chosen : 'clasico';

  useEffect(() => {
    if (loading) {
      if (!applies) applyLook('clasico');
      return;
    }
    setChosen(accountLook);
    applyLook(applies ? accountLook : 'clasico');
  }, [loading, sessionUserId, accountLook]);

  // A route change: a page outside the look drops the attribute; back on the platform the account's
  // look returns. Only when the answer changes (the first render is the effect above's). While the
  // profile loads on a platform page the page is left as it is, as before.
  const appliedBefore = useRef(applies);
  useEffect(() => {
    if (appliedBefore.current === applies) return;
    appliedBefore.current = applies;
    if (loading && applies) return;
    applyLook(applies ? chosen : 'clasico');
  }, [applies]);

  const setLook = useCallback(
    (next: Look) => {
      setChosen(next);
      applyLook(applies ? next : 'clasico');
    },
    [applies]
  );

  const value = useMemo(() => ({ look, setLook }), [look, setLook]);
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

/** The look of the signed-in account, and a way to show another at once after saving it. */
export function useLook(): LookContextValue {
  return useContext(LookContext);
}
