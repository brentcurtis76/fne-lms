/**
 * useOnboarding Hook
 *
 * Manages user onboarding tour state with localStorage caching and API persistence.
 * Tracks which tours have been completed or skipped.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

// Namespaced storage key for localStorage
const STORAGE_KEY = 'fne_lms_onboarding_state';

interface OnboardingState {
  tours_completed: Record<string, string>;
  tours_skipped: Record<string, string>;
}

interface UseOnboardingReturn {
  loading: boolean;
  hasCompletedTour: (tourId: string) => boolean;
  hasSkippedTour: (tourId: string) => boolean;
  markTourComplete: (tourId: string) => Promise<void>;
  skipTour: (tourId: string) => Promise<void>;
  resetTour: (tourId: string) => Promise<void>;
  shouldShowTour: (tourId: string) => boolean;
}

// Helper to safely access localStorage (SSR-safe)
function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

// Helper to safely get from localStorage
function getStoredState(): OnboardingState | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const cached = storage.getItem(STORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('[useOnboarding] Error reading localStorage:', error);
  }
  return null;
}

// Helper to safely set localStorage
function setStoredState(state: OnboardingState): void {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[useOnboarding] Error writing localStorage:', error);
  }
}

export function useOnboarding(): UseOnboardingReturn {
  const supabase = useSupabaseClient();
  const [state, setState] = useState<OnboardingState>({
    tours_completed: {},
    tours_skipped: {}
  });
  const [loading, setLoading] = useState(true);

  // Track if a state update is in progress to prevent race conditions
  const updateInProgressRef = useRef<boolean>(false);

  // Load state from localStorage on mount (SSR-safe)
  useEffect(() => {
    const cachedState = getStoredState();
    if (cachedState) {
      setState(cachedState);
    }
  }, []);

  // Fetch state from API and merge with cached
  useEffect(() => {
    const fetchState = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setLoading(false);
          return;
        }

        const response = await fetch('/api/user/onboarding-state', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const newState: OnboardingState = {
            tours_completed: data.tours_completed || {},
            tours_skipped: data.tours_skipped || {}
          };

          setState(newState);
          setStoredState(newState);
        }
      } catch (error) {
        console.error('[useOnboarding] Error fetching state:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchState();
  }, [supabase]);

  // Update state both locally and via API with rollback on failure
  const updateState = useCallback(async (action: 'complete' | 'skip' | 'reset', tourId: string) => {
    // Prevent concurrent updates
    if (updateInProgressRef.current) {
      console.warn('[useOnboarding] Update already in progress, skipping');
      return;
    }

    try {
      updateInProgressRef.current = true;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const now = new Date().toISOString();

      // Capture previous state for rollback using functional update
      let previousState: OnboardingState | null = null;

      // Optimistic update using functional state update to prevent race conditions
      setState(currentState => {
        previousState = currentState;

        const newToursCompleted = { ...currentState.tours_completed };
        const newToursSkipped = { ...currentState.tours_skipped };

        if (action === 'complete') {
          newToursCompleted[tourId] = now;
          delete newToursSkipped[tourId];
        } else if (action === 'skip') {
          newToursSkipped[tourId] = now;
        } else if (action === 'reset') {
          delete newToursCompleted[tourId];
          delete newToursSkipped[tourId];
        }

        const newState: OnboardingState = {
          tours_completed: newToursCompleted,
          tours_skipped: newToursSkipped
        };

        // Update localStorage with new state
        setStoredState(newState);

        return newState;
      });

      // Persist to API
      const response = await fetch('/api/user/onboarding-state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action, tourId })
      });

      if (!response.ok) {
        console.error('[useOnboarding] Failed to persist state, rolling back');
        // Rollback on failure
        if (previousState) {
          setState(previousState);
          setStoredState(previousState);
        }
      }
    } catch (error) {
      console.error('[useOnboarding] Error updating state:', error);
    } finally {
      updateInProgressRef.current = false;
    }
  }, [supabase]);

  const hasCompletedTour = useCallback((tourId: string): boolean => {
    return tourId in state.tours_completed;
  }, [state.tours_completed]);

  const hasSkippedTour = useCallback((tourId: string): boolean => {
    return tourId in state.tours_skipped;
  }, [state.tours_skipped]);

  const markTourComplete = useCallback(async (tourId: string): Promise<void> => {
    await updateState('complete', tourId);
  }, [updateState]);

  const skipTour = useCallback(async (tourId: string): Promise<void> => {
    await updateState('skip', tourId);
  }, [updateState]);

  const resetTour = useCallback(async (tourId: string): Promise<void> => {
    await updateState('reset', tourId);
  }, [updateState]);

  const shouldShowTour = useCallback((tourId: string): boolean => {
    // Show tour if it hasn't been completed or skipped
    return !hasCompletedTour(tourId) && !hasSkippedTour(tourId);
  }, [hasCompletedTour, hasSkippedTour]);

  return {
    loading,
    hasCompletedTour,
    hasSkippedTour,
    markTourComplete,
    skipTour,
    resetTour,
    shouldShowTour
  };
}
