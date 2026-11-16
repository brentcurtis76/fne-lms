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
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { useAuth } from './AuthContext';
import { applyLook, lookOfAccount, type Look } from '../lib/look';

interface LookContextValue {
  look: Look;
  setLook: (look: Look) => void;
}

const LookContext = createContext<LookContextValue>({ look: 'clasico', setLook: () => {} });

export function LookProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSessionContext();
  const { user, profile, loading } = useAuth();
  const [look, setLookState] = useState<Look>('clasico');

  const sessionUserId = session?.user?.id ?? null;
  const isThisAccount = Boolean(sessionUserId && user?.id === sessionUserId && profile?.id === sessionUserId);
  const accountLook: Look = isThisAccount ? lookOfAccount(profile) : 'clasico';

  useEffect(() => {
    if (loading) return;
    setLookState(accountLook);
    applyLook(accountLook);
  }, [loading, sessionUserId, accountLook]);

  const setLook = useCallback((next: Look) => {
    setLookState(next);
    applyLook(next);
  }, []);

  const value = useMemo(() => ({ look, setLook }), [look, setLook]);
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

/** The look of the signed-in account, and a way to show another at once after saving it. */
export function useLook(): LookContextValue {
  return useContext(LookContext);
}
