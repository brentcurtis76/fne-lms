/**
 * Session Manager - Handles "Remember Me" functionality for FNE LMS
 * 
 * This module provides proper session persistence control that works with
 * Supabase's built-in session management while respecting user preferences.
 */

import { supabase } from './supabase';

export class SessionManager {
  private static readonly SESSION_ID_KEY = 'fne-session-id';
  private static readonly REMEMBER_ME_KEY = 'rememberMe';
  private static readonly BROWSER_SESSION_KEY = 'fne-browser-session';

  /**
   * Initialize session management on app startup
   * This should be called when the app loads to check if session should persist
   */
  static async initialize(): Promise<void> {
    try {
      const rememberMe = localStorage.getItem(this.REMEMBER_ME_KEY) === 'true';
      const currentSessionId = sessionStorage.getItem(this.BROWSER_SESSION_KEY);
      const storedSessionId = localStorage.getItem(this.SESSION_ID_KEY);

      // Check if dev impersonation is active - if so, skip session management
      const hasImpersonation = localStorage.getItem('fne-dev-impersonation');
      if (hasImpersonation) {
        console.log('[SessionManager] Dev impersonation active, skipping session checks');
        return;
      }

      // Also check if we're in the middle of starting impersonation
      const impersonationStarting = sessionStorage.getItem('fne-impersonation-starting');
      if (impersonationStarting) {
        console.log('[SessionManager] Impersonation starting, skipping session checks');
        return;
      }

      console.log('[SessionManager] Initializing:', {
        rememberMe,
        hasCurrentSessionId: !!currentSessionId,
        hasStoredSessionId: !!storedSessionId,
        sessionMatch: currentSessionId === storedSessionId
      });

      // FIXED: Removed automatic logout logic that was causing unexpected logouts
      // The previous logic was incorrectly logging users out on page refresh
      // when "Remember Me" was false. Supabase already handles session persistence
      // properly, so we don't need to interfere with it.
      
      // We'll only track the user's preference, not control the session lifecycle

      // Generate a new browser session ID if none exists
      if (!currentSessionId) {
        const newSessionId = this.generateSessionId();
        sessionStorage.setItem(this.BROWSER_SESSION_KEY, newSessionId);
        
        // If remember me is enabled, store it for future browser sessions
        if (rememberMe) {
          localStorage.setItem(this.SESSION_ID_KEY, newSessionId);
        }
      }
    } catch (error) {
      console.error('[SessionManager] Initialization error:', error);
      // Don't break the app if session management fails
    }
  }

  /**
   * Configure session persistence after login
   */
  static async configureSessionPersistence(rememberMe: boolean): Promise<void> {
    try {
      const sessionId = this.generateSessionId();
      
      // Store the remember me preference
      localStorage.setItem(this.REMEMBER_ME_KEY, rememberMe.toString());
      
      // Set browser session ID
      sessionStorage.setItem(this.BROWSER_SESSION_KEY, sessionId);
      
      if (rememberMe) {
        // Store session ID in localStorage for cross-browser-session detection
        localStorage.setItem(this.SESSION_ID_KEY, sessionId);
      } else {
        // Remove any stored session ID since user doesn't want to be remembered
        localStorage.removeItem(this.SESSION_ID_KEY);
      }

      console.log('[SessionManager] Session configured:', {
        rememberMe,
        sessionId: sessionId.substring(0, 8) + '...'
      });
    } catch (error) {
      console.error('[SessionManager] Configuration error:', error);
    }
  }

  /**
   * Check if the current session should persist
   */
  static shouldPersistSession(): boolean {
    try {
      return localStorage.getItem(this.REMEMBER_ME_KEY) === 'true';
    } catch (error) {
      console.error('[SessionManager] Error checking persistence:', error);
      return true; // Default to persistent for safety
    }
  }

  /**
   * Clear all session data
   */
  static async clearSession(): Promise<void> {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem(this.REMEMBER_ME_KEY);
      localStorage.removeItem(this.SESSION_ID_KEY);
      sessionStorage.removeItem(this.BROWSER_SESSION_KEY);
      
      console.log('[SessionManager] Session cleared');
    } catch (error) {
      console.error('[SessionManager] Error clearing session:', error);
    }
  }

  /**
   * Generate a unique session ID
   */
  private static generateSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get current session status for debugging
   */
  static getDebugInfo(): object {
    return {
      rememberMe: localStorage.getItem(this.REMEMBER_ME_KEY),
      sessionId: localStorage.getItem(this.SESSION_ID_KEY)?.substring(0, 8) + '...',
      browserSessionId: sessionStorage.getItem(this.BROWSER_SESSION_KEY)?.substring(0, 8) + '...',
      shouldPersist: this.shouldPersistSession()
    };
  }
}