/**
 * Activity Tracker Hook
 *
 * Tracks user activity for QA time billing purposes.
 * Only counts ACTIVE time - pauses when user is idle or tab is hidden.
 *
 * Activity events: mouse move, click, keypress, scroll, touch
 * Idle timeout: 3 minutes (180 seconds)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface ActivityState {
  activeSeconds: number;
  idleSeconds: number;
  isPaused: boolean;
  lastActivity: Date;
  sessionStarted: Date;
}

export interface UseActivityTrackerReturn {
  /** Total active seconds (not including idle time) */
  activeSeconds: number;
  /** Total idle seconds (when paused due to inactivity) */
  idleSeconds: number;
  /** Whether the timer is currently paused */
  isPaused: boolean;
  /** Last recorded activity timestamp */
  lastActivity: Date;
  /** Start tracking activity */
  start: () => void;
  /** Stop tracking and return final counts */
  stop: () => { activeSeconds: number; idleSeconds: number };
  /** Reset all counters */
  reset: () => void;
  /** Restore previously accumulated active seconds (for recovery after refresh) */
  restore: (seconds: number) => void;
  /** Get current snapshot */
  getSnapshot: () => ActivityState;
  /** Format active time as HH:MM:SS */
  formatTime: () => string;
}

// Idle timeout in milliseconds (3 minutes)
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;

// How often to update the counters (every second)
const TICK_INTERVAL_MS = 1000;

export function useActivityTracker(): UseActivityTrackerReturn {
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [lastActivity, setLastActivity] = useState<Date>(new Date());
  const [isTracking, setIsTracking] = useState(false);

  // Refs for timer management
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartRef = useRef<Date>(new Date());
  // Use ref to track pause state to avoid recreating interval
  const isPausedRef = useRef(true);

  // Keep ref in sync with state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Handle activity detection
  const handleActivity = useCallback(() => {
    if (!isTracking) return;

    const now = new Date();
    setLastActivity(now);

    // If we were paused (idle), resume
    setIsPaused(false);

    // Reset idle timeout
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }

    idleTimeoutRef.current = setTimeout(() => {
      setIsPaused(true);
    }, IDLE_TIMEOUT_MS);
  }, [isTracking]);

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    if (!isTracking) return;

    if (document.hidden) {
      // Tab is hidden - pause immediately
      setIsPaused(true);
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    } else {
      // Tab is visible - treat as activity
      handleActivity();
    }
  }, [isTracking, handleActivity]);

  // Tick function - runs every second (only depends on isTracking)
  useEffect(() => {
    if (!isTracking) return;

    tickIntervalRef.current = setInterval(() => {
      // Use ref to check pause state to avoid recreating interval
      if (isPausedRef.current) {
        setIdleSeconds((prev) => prev + 1);
      } else {
        setActiveSeconds((prev) => prev + 1);
      }
    }, TICK_INTERVAL_MS);

    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
    };
  }, [isTracking]);

  // Set up event listeners
  useEffect(() => {
    if (!isTracking) return;

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial activity to start the timer
    handleActivity();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, [isTracking, handleActivity, handleVisibilityChange]);

  // Start tracking
  const start = useCallback(() => {
    sessionStartRef.current = new Date();
    setLastActivity(new Date());
    setIsTracking(true);
    setIsPaused(false);
  }, []);

  // Stop tracking and return final counts
  const stop = useCallback(() => {
    setIsTracking(false);
    setIsPaused(true);

    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
    }
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }

    return { activeSeconds, idleSeconds };
  }, [activeSeconds, idleSeconds]);

  // Reset all counters
  const reset = useCallback(() => {
    setActiveSeconds(0);
    setIdleSeconds(0);
    setIsPaused(true);
    setLastActivity(new Date());
    sessionStartRef.current = new Date();
  }, []);

  // Restore previously accumulated seconds (for recovery after page refresh)
  const restore = useCallback((seconds: number) => {
    if (seconds > 0) {
      setActiveSeconds((prev) => prev + seconds);
    }
  }, []);

  // Get current snapshot
  const getSnapshot = useCallback((): ActivityState => {
    return {
      activeSeconds,
      idleSeconds,
      isPaused,
      lastActivity,
      sessionStarted: sessionStartRef.current,
    };
  }, [activeSeconds, idleSeconds, isPaused, lastActivity]);

  // Format time as HH:MM:SS
  const formatTime = useCallback(() => {
    const hours = Math.floor(activeSeconds / 3600);
    const minutes = Math.floor((activeSeconds % 3600) / 60);
    const secs = activeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, [activeSeconds]);

  return {
    activeSeconds,
    idleSeconds,
    isPaused,
    lastActivity,
    start,
    stop,
    reset,
    restore,
    getSnapshot,
    formatTime,
  };
}

/**
 * Format seconds into human-readable string
 */
export function formatSecondsToTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format seconds into HH:MM:SS format
 */
export function formatSecondsToHHMMSS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default useActivityTracker;
