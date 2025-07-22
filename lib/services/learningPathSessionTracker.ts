/**
 * Learning Path Session Tracker
 * Robust session tracking with multiple fallback strategies
 * Handles heartbeats, activity detection, and graceful session closure
 */

interface SessionConfig {
  heartbeatInterval: number; // milliseconds
  inactivityThreshold: number; // milliseconds
  maxSessionDuration: number; // milliseconds
  apiEndpoint: string;
}

interface SessionData {
  sessionId: string | null;
  pathId: string;
  courseId: string | null;
  activityType: 'path_view' | 'course_start' | 'course_progress' | 'course_complete' | 'path_complete';
  startTime: Date;
  lastActivity: Date;
  totalTimeSpent: number; // minutes
}

export class LearningPathSessionTracker {
  private config: SessionConfig;
  private currentSession: SessionData | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private isVisible: boolean = true;
  private eventListeners: Array<{ element: any; event: string; handler: EventListener }> = [];

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = {
      heartbeatInterval: 30000, // 30 seconds
      inactivityThreshold: 900000, // 15 minutes
      maxSessionDuration: 14400000, // 4 hours max session
      apiEndpoint: '/api/learning-paths/session',
      ...config
    };

    this.setupEventListeners();
    this.setupPageVisibilityHandling();
    this.setupBeforeUnloadHandling();
  }

  /**
   * Start a new learning path session
   */
  async startSession(
    pathId: string,
    courseId: string | null = null,
    activityType: SessionData['activityType'] = 'path_view'
  ): Promise<boolean> {
    try {
      // End any existing session first
      if (this.currentSession) {
        await this.endSession();
      }

      // Create new session via API
      const response = await fetch(`${this.config.apiEndpoint}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pathId,
          courseId,
          activityType
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.status}`);
      }

      const data = await response.json();
      
      this.currentSession = {
        sessionId: data.sessionId,
        pathId,
        courseId,
        activityType,
        startTime: new Date(),
        lastActivity: new Date(),
        totalTimeSpent: 0
      };

      // Start tracking mechanisms
      this.startHeartbeat();
      this.resetInactivityTimer();
      this.isActive = true;

      console.log(`[SessionTracker] Started session: ${data.sessionId}`);
      return true;

    } catch (error) {
      console.error('[SessionTracker] Failed to start session:', error);
      return false;
    }
  }

  /**
   * End the current session
   */
  async endSession(): Promise<boolean> {
    if (!this.currentSession || !this.currentSession.sessionId) {
      return true;
    }

    try {
      // Calculate final time spent
      const timeSpent = this.calculateTimeSpent();
      
      // Stop all timers
      this.stopHeartbeat();
      this.stopInactivityTimer();

      // End session via API
      const response = await fetch(`${this.config.apiEndpoint}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.currentSession.sessionId,
          timeSpentMinutes: timeSpent
        })
      });

      if (!response.ok) {
        console.warn(`[SessionTracker] Failed to end session cleanly: ${response.status}`);
      }

      console.log(`[SessionTracker] Ended session: ${this.currentSession.sessionId}, Time: ${timeSpent}min`);
      this.currentSession = null;
      this.isActive = false;
      
      return true;

    } catch (error) {
      console.error('[SessionTracker] Failed to end session:', error);
      return false;
    }
  }

  /**
   * Update activity type (e.g., when user starts a course)
   */
  async updateActivity(
    activityType: SessionData['activityType'], 
    courseId: string | null = null
  ): Promise<boolean> {
    if (!this.currentSession || !this.currentSession.sessionId) {
      return false;
    }

    try {
      this.currentSession.activityType = activityType;
      if (courseId !== null) {
        this.currentSession.courseId = courseId;
      }
      this.markActivity();

      // Notify API of activity change
      await fetch(`${this.config.apiEndpoint}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.currentSession.sessionId,
          activityType,
          courseId
        })
      });

      return true;
    } catch (error) {
      console.error('[SessionTracker] Failed to update activity:', error);
      return false;
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SessionData | null {
    return this.currentSession;
  }

  /**
   * Clean up and destroy tracker
   */
  destroy(): void {
    this.endSession();
    this.removeEventListeners();
    this.stopHeartbeat();
    this.stopInactivityTimer();
  }

  /**
   * Private Methods
   */
  private setupEventListeners(): void {
    // Activity detection events
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    activityEvents.forEach(event => {
      const handler = this.throttle(() => this.markActivity(), 1000);
      this.addEventListener(document, event, handler);
    });
  }

  private setupPageVisibilityHandling(): void {
    if (typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        this.isVisible = !document.hidden;
        
        if (this.isVisible && this.currentSession) {
          // Page became visible, reset activity
          this.markActivity();
          if (!this.heartbeatTimer) {
            this.startHeartbeat();
          }
        } else if (!this.isVisible) {
          // Page became hidden, but don't end session
          // Just stop heartbeat to save resources
          this.stopHeartbeat();
        }
      };

      this.addEventListener(document, 'visibilitychange', handleVisibilityChange);
    }
  }

  private setupBeforeUnloadHandling(): void {
    if (typeof window !== 'undefined') {
      const handleBeforeUnload = () => {
        // Try to end session, but don't block page unload
        if (this.currentSession) {
          // Use sendBeacon for more reliable delivery
          navigator.sendBeacon(
            `${this.config.apiEndpoint}/end`,
            JSON.stringify({
              sessionId: this.currentSession.sessionId,
              timeSpentMinutes: this.calculateTimeSpent()
            })
          );
        }
      };

      this.addEventListener(window, 'beforeunload', handleBeforeUnload);
      this.addEventListener(window, 'pagehide', handleBeforeUnload);
    }
  }

  private markActivity(): void {
    if (!this.currentSession) return;
    
    this.currentSession.lastActivity = new Date();
    this.resetInactivityTimer();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing heartbeat
    
    this.heartbeatTimer = setInterval(async () => {
      if (!this.currentSession || !this.currentSession.sessionId) {
        this.stopHeartbeat();
        return;
      }

      // Only send heartbeat if user was recently active and page is visible
      const timeSinceLastActivity = Date.now() - this.currentSession.lastActivity.getTime();
      const shouldSendHeartbeat = timeSinceLastActivity < 60000 && this.isVisible; // 1 minute

      if (shouldSendHeartbeat) {
        try {
          await fetch(`${this.config.apiEndpoint}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              sessionId: this.currentSession.sessionId
            })
          });
        } catch (error) {
          console.warn('[SessionTracker] Heartbeat failed:', error);
        }
      }

      // Check for max session duration
      const sessionDuration = Date.now() - this.currentSession.startTime.getTime();
      if (sessionDuration > this.config.maxSessionDuration) {
        console.log('[SessionTracker] Max session duration reached, ending session');
        this.endSession();
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetInactivityTimer(): void {
    this.stopInactivityTimer();
    
    this.inactivityTimer = setTimeout(() => {
      console.log('[SessionTracker] Inactivity timeout reached, ending session');
      this.endSession();
    }, this.config.inactivityThreshold);
  }

  private stopInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private calculateTimeSpent(): number {
    if (!this.currentSession) return 0;
    
    const endTime = new Date();
    const totalMs = endTime.getTime() - this.currentSession.startTime.getTime();
    return Math.round(totalMs / 60000); // Convert to minutes
  }

  private addEventListener(element: any, event: string, handler: EventListener): void {
    element.addEventListener(event, handler, { passive: true });
    this.eventListeners.push({ element, event, handler });
  }

  private removeEventListeners(): void {
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this.eventListeners = [];
  }

  private throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function(this: any, ...args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}

// Singleton instance for global use
let globalTracker: LearningPathSessionTracker | null = null;

export const getGlobalSessionTracker = (): LearningPathSessionTracker => {
  if (!globalTracker) {
    globalTracker = new LearningPathSessionTracker();
  }
  return globalTracker;
};

export const destroyGlobalSessionTracker = (): void => {
  if (globalTracker) {
    globalTracker.destroy();
    globalTracker = null;
  }
};

// React hook for easy integration
import { useEffect, useRef } from 'react';

export const useSessionTracker = (pathId: string, courseId: string | null = null) => {
  const trackerRef = useRef<LearningPathSessionTracker | null>(null);

  useEffect(() => {
    trackerRef.current = getGlobalSessionTracker();

    // Start session when component mounts
    trackerRef.current.startSession(pathId, courseId);

    // Cleanup on unmount
    return () => {
      if (trackerRef.current) {
        trackerRef.current.endSession();
      }
    };
  }, [pathId, courseId]);

  const updateActivity = (activityType: SessionData['activityType'], newCourseId?: string) => {
    if (trackerRef.current) {
      trackerRef.current.updateActivity(activityType, newCourseId ?? courseId);
    }
  };

  const getCurrentSession = () => {
    return trackerRef.current?.getCurrentSession() || null;
  };

  return {
    updateActivity,
    getCurrentSession,
    tracker: trackerRef.current
  };
};