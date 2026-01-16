/**
 * QA Session Provider
 *
 * Detects active QA test sessions and renders the floating widget
 * on all pages when a test is in progress.
 */

import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the widget to avoid SSR issues
const QAFloatingWidget = dynamic(() => import('./QAFloatingWidget'), {
  ssr: false,
});

// Session storage keys
const QA_SESSION_KEY = 'qa_test_run_id';
const QA_SCENARIO_KEY = 'qa_scenario_data';

interface QASessionContextValue {
  isQASessionActive: boolean;
  startQASession: (testRunId: string, scenarioData: any) => void;
  endQASession: () => void;
  refreshSession: () => void;
}

const QASessionContext = createContext<QASessionContextValue>({
  isQASessionActive: false,
  startQASession: () => {},
  endQASession: () => {},
  refreshSession: () => {},
});

export const useQASession = () => useContext(QASessionContext);

interface QASessionProviderProps {
  children: React.ReactNode;
}

export const QASessionProvider: React.FC<QASessionProviderProps> = ({ children }) => {
  const [isQASessionActive, setIsQASessionActive] = useState(false);
  const [showWidget, setShowWidget] = useState(false);

  // Check for active QA session on mount and when storage changes
  const checkSession = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const testRunId = sessionStorage.getItem(QA_SESSION_KEY);
      const scenarioData = sessionStorage.getItem(QA_SCENARIO_KEY);
      const hasSession = !!(testRunId && scenarioData);

      setIsQASessionActive(hasSession);
      setShowWidget(hasSession);
    } catch (error) {
      console.error('Error checking QA session:', error);
      setIsQASessionActive(false);
      setShowWidget(false);
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    checkSession();

    // Listen for storage events (in case another tab modifies the session)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === QA_SESSION_KEY || e.key === QA_SCENARIO_KEY) {
        checkSession();
      }
    };

    // Also check on focus (in case user navigates back)
    const handleFocus = () => {
      checkSession();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleFocus);

    // Periodic check every 2 seconds (for page navigation within same tab)
    const interval = setInterval(checkSession, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [checkSession]);

  // Start a new QA session
  const startQASession = useCallback((testRunId: string, scenarioData: any) => {
    if (typeof window === 'undefined') return;

    try {
      sessionStorage.setItem(QA_SESSION_KEY, testRunId);
      sessionStorage.setItem(QA_SCENARIO_KEY, JSON.stringify(scenarioData));
      setIsQASessionActive(true);
      setShowWidget(true);
    } catch (error) {
      console.error('Error starting QA session:', error);
    }
  }, []);

  // End the current QA session
  const endQASession = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      sessionStorage.removeItem(QA_SESSION_KEY);
      sessionStorage.removeItem(QA_SCENARIO_KEY);
      sessionStorage.removeItem('qa_current_step_index');
      sessionStorage.removeItem('qa_step_results');
      setIsQASessionActive(false);
      setShowWidget(false);
    } catch (error) {
      console.error('Error ending QA session:', error);
    }
  }, []);

  // Refresh session state (useful after navigation)
  const refreshSession = useCallback(() => {
    checkSession();
  }, [checkSession]);

  const handleWidgetClose = useCallback(() => {
    endQASession();
  }, [endQASession]);

  return (
    <QASessionContext.Provider
      value={{
        isQASessionActive,
        startQASession,
        endQASession,
        refreshSession,
      }}
    >
      {children}
      {showWidget && <QAFloatingWidget onClose={handleWidgetClose} />}
    </QASessionContext.Provider>
  );
};

export default QASessionProvider;
