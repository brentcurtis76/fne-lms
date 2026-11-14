/**
 * The account's look ("clasico" or "nuevo"), kept on the page as `data-look` on `<html>`.
 *
 * The profile is the truth (`profiles.learning_preferences.ui_look`, read through AuthContext,
 * which already loads the whole profile row). This provider turns it into the attribute:
 *   - while the session or the profile is still loading it leaves the page as it is (the early
 *     script of pages/_document.tsx may already have applied the look this browser showed last);
 *   - signed in with a profile: the profile's look;
 *   - signed out, or no profile: today's look. The sign-in screens have no account to ask.
 * `setLook` is for the one screen that saves a choice («Apariencia»): it shows the look at once,
 * without waiting for a reload of the profile.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { applyLook, lookFromPreferences, type Look } from '../lib/look';

interface LookContextValue {
  look: Look;
  setLook: (look: Look) => void;
}

const LookContext = createContext<LookContextValue>({ look: 'clasico', setLook: () => {} });

export function LookProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const [look, setLookState] = useState<Look>('clasico');

  const userId = user?.id ?? null;
  const profileLook = lookFromPreferences(profile?.learning_preferences);

  useEffect(() => {
    if (loading) return;
    const next: Look = userId ? profileLook : 'clasico';
    setLookState(next);
    applyLook(next);
  }, [loading, userId, profileLook]);

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
