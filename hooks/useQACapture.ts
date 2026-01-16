/**
 * QA Capture Hook
 *
 * Intercepts console logs and network requests during QA testing sessions.
 * Stores captured data in refs to avoid re-renders and provides methods
 * to retrieve and clear the captured data.
 *
 * Usage:
 * const { startCapture, stopCapture, getCapture, clearCapture, isCapturing } = useQACapture();
 *
 * // Start capturing when test step begins
 * startCapture();
 *
 * // Get captured data when step ends
 * const { consoleLogs, networkLogs } = getCapture();
 *
 * // Clear for next step
 * clearCapture();
 */

import { useRef, useCallback, useState, useEffect } from 'react';
import type {
  ConsoleLogEntry,
  NetworkLogEntry,
  UseQACaptureReturn,
  ConsoleLogLevel,
} from '@/types/qa';

const MAX_LOG_ENTRIES = 100;

export function useQACapture(): UseQACaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);

  // Store logs in refs to avoid re-renders
  const consoleLogsRef = useRef<ConsoleLogEntry[]>([]);
  const networkLogsRef = useRef<NetworkLogEntry[]>([]);

  // Store original methods to restore later
  const originalConsoleMethods = useRef<{
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    info: typeof console.info;
    debug: typeof console.debug;
  } | null>(null);
  const originalFetch = useRef<typeof fetch | null>(null);

  // Helper to add log entry with size limit
  const addConsoleLog = useCallback(
    (level: ConsoleLogLevel, args: unknown[]) => {
      const entry: ConsoleLogEntry = {
        level,
        message: args
          .map((arg) => {
            if (typeof arg === 'string') return arg;
            if (arg instanceof Error) {
              return `${arg.name}: ${arg.message}`;
            }
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          })
          .join(' '),
        timestamp: new Date().toISOString(),
        stack:
          level === 'error' && args[0] instanceof Error
            ? args[0].stack
            : undefined,
      };

      consoleLogsRef.current = [
        ...consoleLogsRef.current.slice(-(MAX_LOG_ENTRIES - 1)),
        entry,
      ];
    },
    []
  );

  // Helper to add network log entry
  const addNetworkLog = useCallback((entry: NetworkLogEntry) => {
    networkLogsRef.current = [
      ...networkLogsRef.current.slice(-(MAX_LOG_ENTRIES - 1)),
      entry,
    ];
  }, []);

  // Start capturing console and network
  const startCapture = useCallback(() => {
    if (isCapturing) return;

    // Clear previous captures
    consoleLogsRef.current = [];
    networkLogsRef.current = [];

    // Store original console methods
    originalConsoleMethods.current = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
    };

    // Wrap console methods
    const levels: ConsoleLogLevel[] = ['log', 'warn', 'error', 'info', 'debug'];
    levels.forEach((level) => {
      const original = console[level];
      console[level] = (...args: unknown[]) => {
        addConsoleLog(level, args);
        original.apply(console, args);
      };
    });

    // Store and wrap fetch
    originalFetch.current = window.fetch;
    window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const startTime = Date.now();
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method || 'GET';

      // Try to capture request body
      let requestBody: unknown;
      if (init?.body) {
        if (typeof init.body === 'string') {
          try {
            requestBody = JSON.parse(init.body);
          } catch {
            requestBody = init.body;
          }
        } else if (init.body instanceof FormData) {
          requestBody = '[FormData]';
        } else {
          requestBody = '[Binary Data]';
        }
      }

      try {
        const response = await originalFetch.current!(input, init);
        const duration = Date.now() - startTime;

        // Clone response to read body without consuming it
        const clonedResponse = response.clone();
        let responseBody: unknown;
        try {
          const text = await clonedResponse.text();
          try {
            responseBody = JSON.parse(text);
          } catch {
            responseBody =
              text.length > 1000 ? text.substring(0, 1000) + '...' : text;
          }
        } catch {
          responseBody = '[Unable to read response]';
        }

        addNetworkLog({
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          duration,
          requestBody,
          responseBody,
          timestamp: new Date().toISOString(),
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        addNetworkLog({
          method,
          url,
          status: null,
          statusText: null,
          duration,
          requestBody,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    };

    setIsCapturing(true);
  }, [isCapturing, addConsoleLog, addNetworkLog]);

  // Stop capturing and restore original methods
  const stopCapture = useCallback(() => {
    if (!isCapturing) return;

    // Restore console methods
    if (originalConsoleMethods.current) {
      console.log = originalConsoleMethods.current.log;
      console.warn = originalConsoleMethods.current.warn;
      console.error = originalConsoleMethods.current.error;
      console.info = originalConsoleMethods.current.info;
      console.debug = originalConsoleMethods.current.debug;
      originalConsoleMethods.current = null;
    }

    // Restore fetch
    if (originalFetch.current) {
      window.fetch = originalFetch.current;
      originalFetch.current = null;
    }

    setIsCapturing(false);
  }, [isCapturing]);

  // Get current captured data
  const getCapture = useCallback(() => {
    return {
      consoleLogs: [...consoleLogsRef.current],
      networkLogs: [...networkLogsRef.current],
    };
  }, []);

  // Clear captured data
  const clearCapture = useCallback(() => {
    consoleLogsRef.current = [];
    networkLogsRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isCapturing) {
        // Restore console methods
        if (originalConsoleMethods.current) {
          console.log = originalConsoleMethods.current.log;
          console.warn = originalConsoleMethods.current.warn;
          console.error = originalConsoleMethods.current.error;
          console.info = originalConsoleMethods.current.info;
          console.debug = originalConsoleMethods.current.debug;
        }

        // Restore fetch
        if (originalFetch.current) {
          window.fetch = originalFetch.current;
        }
      }
    };
  }, [isCapturing]);

  return {
    startCapture,
    stopCapture,
    getCapture,
    clearCapture,
    isCapturing,
  };
}

export default useQACapture;
