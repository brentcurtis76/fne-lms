/**
 * QA Floating Widget Component
 *
 * A draggable, persistent floating panel that allows testers to see QA test
 * instructions and record pass/fail results while navigating the entire app.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  X,
  GripVertical,
  Camera,
  Loader2,
  ExternalLink,
  AlertTriangle,
  LogOut,
  Clock,
  Pause,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { captureScreenshot, getBrowserInfo, detectEnvironment } from '@/lib/qa';
import { useActivityTracker, formatSecondsToTime } from '@/hooks/useActivityTracker';
import type {
  QAScenario,
  QATestRun,
  QAScenarioStep,
  SaveStepResultRequest,
  ConsoleLogEntry,
  NetworkLogEntry,
} from '@/types/qa';

// Session storage keys
const QA_SESSION_KEY = 'qa_test_run_id';
const QA_SCENARIO_KEY = 'qa_scenario_data';
const QA_CURRENT_STEP_KEY = 'qa_current_step_index';
const QA_STEP_RESULTS_KEY = 'qa_step_results';
const QA_WIDGET_POSITION_KEY = 'qa_widget_position';
const QA_WIDGET_MINIMIZED_KEY = 'qa_widget_minimized';
const QA_CAPTURE_BUFFER_KEY = 'qa_capture_buffer';
const QA_STEP_ACTIVE_SECONDS_KEY = 'qa_step_active_seconds';
const QA_TOTAL_ACTIVE_SECONDS_KEY = 'qa_total_active_seconds';
const QA_LAST_DB_SAVE_KEY = 'qa_last_db_save_timestamp';
const QA_RECOVERED_TIME_KEY = 'qa_recovered_time';

// Auto-save intervals
const SESSION_SAVE_INTERVAL = 15000; // 15 seconds
const DB_SAVE_INTERVAL = 60000; // 60 seconds

// Capture buffer for storing results when logged out
interface CaptureBufferEntry {
  stepResult: SaveStepResultRequest;
  timestamp: string;
}

interface WidgetPosition {
  x: number;
  y: number;
}

interface QAFloatingWidgetProps {
  onClose?: () => void;
}

// Console/Network capture hook (simplified for widget)
const useWidgetCapture = () => {
  const consoleLogsRef = useRef<ConsoleLogEntry[]>([]);
  const networkLogsRef = useRef<NetworkLogEntry[]>([]);
  const originalConsoleMethods = useRef<Record<string, typeof console.log> | null>(null);
  const originalFetch = useRef<typeof fetch | null>(null);
  const isCapturingRef = useRef(false);

  const startCapture = useCallback(() => {
    if (isCapturingRef.current) return;
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

    const levels = ['log', 'warn', 'error', 'info', 'debug'] as const;
    levels.forEach((level) => {
      const original = console[level];
      console[level] = (...args: unknown[]) => {
        const entry: ConsoleLogEntry = {
          level,
          message: args.map((arg) => {
            if (typeof arg === 'string') return arg;
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }).join(' '),
          timestamp: new Date().toISOString(),
        };
        consoleLogsRef.current = [...consoleLogsRef.current.slice(-99), entry];
        original.apply(console, args);
      };
    });

    // Wrap fetch - bind to window to avoid "Illegal invocation" error
    originalFetch.current = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const startTime = Date.now();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';

      try {
        const response = await originalFetch.current!(input, init);
        networkLogsRef.current = [...networkLogsRef.current.slice(-99), {
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        }];
        return response;
      } catch (error) {
        networkLogsRef.current = [...networkLogsRef.current.slice(-99), {
          method,
          url,
          status: null,
          statusText: null,
          duration: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }];
        throw error;
      }
    };

    isCapturingRef.current = true;
  }, []);

  const stopCapture = useCallback(() => {
    if (!isCapturingRef.current) return;
    if (originalConsoleMethods.current) {
      console.log = originalConsoleMethods.current.log;
      console.warn = originalConsoleMethods.current.warn;
      console.error = originalConsoleMethods.current.error;
      console.info = originalConsoleMethods.current.info;
      console.debug = originalConsoleMethods.current.debug;
      originalConsoleMethods.current = null;
    }
    if (originalFetch.current) {
      window.fetch = originalFetch.current;
      originalFetch.current = null;
    }
    isCapturingRef.current = false;
  }, []);

  const getCapture = useCallback(() => ({
    consoleLogs: [...consoleLogsRef.current],
    networkLogs: [...networkLogsRef.current],
  }), []);

  const clearCapture = useCallback(() => {
    consoleLogsRef.current = [];
    networkLogsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  return { startCapture, stopCapture, getCapture, clearCapture };
};

const QAFloatingWidget: React.FC<QAFloatingWidgetProps> = ({ onClose }) => {
  const router = useRouter();

  // Activity tracker for billing
  const activityTracker = useActivityTracker();

  // State
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<WidgetPosition>({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<QAScenario | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepResults, setStepResults] = useState<Map<number, boolean | null>>(new Map());

  const [testerNote, setTesterNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [stepStartTime, setStepStartTime] = useState<Date>(new Date());
  const [isComplete, setIsComplete] = useState(false);
  const [totalActiveSeconds, setTotalActiveSeconds] = useState(0);

  const { startCapture, stopCapture, getCapture, clearCapture } = useWidgetCapture();

  const widgetRef = useRef<HTMLDivElement>(null);

  // Refs for activity tracker methods to avoid dependency issues
  const activityTrackerRef = useRef(activityTracker);
  activityTrackerRef.current = activityTracker;

  // Load session data from sessionStorage with time recovery
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedTestRunId = sessionStorage.getItem(QA_SESSION_KEY);
      const storedScenario = sessionStorage.getItem(QA_SCENARIO_KEY);
      const storedStepIndex = sessionStorage.getItem(QA_CURRENT_STEP_KEY);
      const storedResults = sessionStorage.getItem(QA_STEP_RESULTS_KEY);
      const storedPosition = localStorage.getItem(QA_WIDGET_POSITION_KEY);
      const storedMinimized = localStorage.getItem(QA_WIDGET_MINIMIZED_KEY);

      if (storedTestRunId) {
        setTestRunId(storedTestRunId);
      }
      if (storedScenario) {
        setScenario(JSON.parse(storedScenario));
      }
      if (storedStepIndex) {
        setCurrentStepIndex(parseInt(storedStepIndex, 10));
      }
      if (storedResults) {
        const parsed = JSON.parse(storedResults);
        setStepResults(new Map(Object.entries(parsed).map(([k, v]) => [parseInt(k), v as boolean | null])));
      }
      if (storedPosition) {
        setPosition(JSON.parse(storedPosition));
      }
      if (storedMinimized === 'true') {
        setIsMinimized(true);
      }

      // Start capturing if we have an active session
      if (storedTestRunId && storedScenario) {
        startCapture();
        setStepStartTime(new Date());
        activityTrackerRef.current.start();

        // Load accumulated active seconds
        const storedTotalActive = sessionStorage.getItem(QA_TOTAL_ACTIVE_SECONDS_KEY);
        if (storedTotalActive) {
          setTotalActiveSeconds(parseInt(storedTotalActive, 10));
        }

        // Recovery: Check for step active seconds that weren't saved
        const storedStepActive = sessionStorage.getItem(QA_STEP_ACTIVE_SECONDS_KEY);
        if (storedStepActive) {
          const recoveredSeconds = parseInt(storedStepActive, 10);
          // Only recover if > 30 seconds (avoid noise from rapid refreshes)
          if (recoveredSeconds > 30) {
            // Restore accumulated time to the tracker
            activityTrackerRef.current.restore(recoveredSeconds);
            const recoveredMinutes = Math.round(recoveredSeconds / 60);
            if (recoveredMinutes > 0) {
              toast.success(`Tiempo recuperado: ${recoveredMinutes} minuto${recoveredMinutes !== 1 ? 's' : ''}`, {
                duration: 4000,
                icon: '⏱️',
              });
            }
          }
          // Clear the stored value after recovery attempt to prevent duplicate recoveries
          sessionStorage.removeItem(QA_STEP_ACTIVE_SECONDS_KEY);
        }
      }
    } catch (error) {
      console.error('Error loading QA session data:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCapture]); // Only run once on mount - activityTracker methods accessed via ref

  // Save position to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(QA_WIDGET_POSITION_KEY, JSON.stringify(position));
    }
  }, [position]);

  // Save minimized state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(QA_WIDGET_MINIMIZED_KEY, String(isMinimized));
    }
  }, [isMinimized]);

  // Save current step index to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && testRunId) {
      sessionStorage.setItem(QA_CURRENT_STEP_KEY, String(currentStepIndex));
    }
  }, [currentStepIndex, testRunId]);

  // Save step results to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && testRunId) {
      const obj: Record<number, boolean | null> = {};
      stepResults.forEach((v, k) => { obj[k] = v; });
      sessionStorage.setItem(QA_STEP_RESULTS_KEY, JSON.stringify(obj));
    }
  }, [stepResults, testRunId]);

  // Periodic auto-save: sessionStorage every 15s, database every 60s
  useEffect(() => {
    if (!testRunId || !scenario || isComplete) return;

    // Save to sessionStorage every 15 seconds
    const sessionSaveInterval = setInterval(() => {
      const stepActiveSeconds = activityTrackerRef.current.activeSeconds;
      sessionStorage.setItem(QA_STEP_ACTIVE_SECONDS_KEY, String(stepActiveSeconds));
      sessionStorage.setItem(QA_TOTAL_ACTIVE_SECONDS_KEY, String(totalActiveSeconds));
    }, SESSION_SAVE_INTERVAL);

    // Save to database every 60 seconds
    const dbSaveInterval = setInterval(async () => {
      const lastDbSave = sessionStorage.getItem(QA_LAST_DB_SAVE_KEY);
      const now = Date.now();

      // Only save if at least 60 seconds since last DB save
      if (lastDbSave && now - parseInt(lastDbSave, 10) < DB_SAVE_INTERVAL) {
        return;
      }

      try {
        const stepActiveSeconds = activityTrackerRef.current.activeSeconds;
        const response = await fetch('/api/qa/save-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            test_run_id: testRunId,
            current_step_index: currentStepIndex,
            step_active_seconds: stepActiveSeconds,
            total_active_seconds: totalActiveSeconds + stepActiveSeconds,
          }),
        });

        if (response.ok) {
          sessionStorage.setItem(QA_LAST_DB_SAVE_KEY, String(now));
        }
      } catch (error) {
        // Silently fail - sessionStorage has the backup
        console.warn('Auto-save to DB failed:', error);
      }
    }, DB_SAVE_INTERVAL);

    return () => {
      clearInterval(sessionSaveInterval);
      clearInterval(dbSaveInterval);
    };
  }, [testRunId, scenario, isComplete, currentStepIndex, totalActiveSeconds]);

  // beforeunload handler for emergency save
  useEffect(() => {
    if (!testRunId || !scenario || isComplete) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Save to sessionStorage immediately
      const stepActiveSeconds = activityTrackerRef.current.activeSeconds;
      sessionStorage.setItem(QA_STEP_ACTIVE_SECONDS_KEY, String(stepActiveSeconds));
      sessionStorage.setItem(QA_TOTAL_ACTIVE_SECONDS_KEY, String(totalActiveSeconds));

      // Attempt to save to database using sendBeacon (most reliable for unload)
      try {
        const data = JSON.stringify({
          test_run_id: testRunId,
          current_step_index: currentStepIndex,
          step_active_seconds: stepActiveSeconds,
          total_active_seconds: totalActiveSeconds + stepActiveSeconds,
        });
        navigator.sendBeacon('/api/qa/save-progress', new Blob([data], { type: 'application/json' }));
      } catch (error) {
        console.warn('sendBeacon failed:', error);
      }

      // Show confirmation dialog for intentional navigation
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [testRunId, scenario, isComplete, currentStepIndex, totalActiveSeconds]);

  // Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!widgetRef.current) return;
    const rect = widgetRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = window.innerWidth - e.clientX - (widgetRef.current?.offsetWidth || 350) + dragOffset.x;
      const newY = window.innerHeight - e.clientY - (widgetRef.current?.offsetHeight || 200) + dragOffset.y;

      // Keep widget within bounds
      setPosition({
        x: Math.max(0, Math.min(newX, window.innerWidth - 100)),
        y: Math.max(0, Math.min(newY, window.innerHeight - 100)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Save step result
  const saveStepResult = async (passed: boolean) => {
    if (!testRunId || !scenario) return;

    const currentStep = scenario.steps[currentStepIndex];
    if (!currentStep) return;

    setSaving(true);

    try {
      const { consoleLogs, networkLogs } = getCapture();
      const timeSpent = Math.round((new Date().getTime() - stepStartTime.getTime()) / 1000);

      // Get active seconds for this step from activity tracker
      const stepActiveSeconds = activityTracker.activeSeconds;

      // Capture screenshot if needed
      let screenshotUrl: string | null = null;
      if ((passed && currentStep.captureOnPass) || (!passed && currentStep.captureOnFail)) {
        setIsCapturingScreenshot(true);
        try {
          const result = await captureScreenshot({
            filenamePrefix: `qa-${testRunId}-step${currentStepIndex + 1}`,
          });
          if (result.success) {
            screenshotUrl = result.url;
          }
        } catch (e) {
          console.warn('Screenshot capture failed:', e);
        } finally {
          setIsCapturingScreenshot(false);
        }
      }

      const stepResultData: SaveStepResultRequest & { active_seconds?: number } = {
        test_run_id: testRunId,
        step_index: currentStepIndex + 1,
        step_instruction: currentStep.instruction,
        expected_outcome: currentStep.expectedOutcome,
        passed,
        tester_note: testerNote || undefined,
        console_logs: consoleLogs,
        network_logs: networkLogs,
        screenshot_url: screenshotUrl || undefined,
        time_spent_seconds: timeSpent,
        active_seconds: stepActiveSeconds,
      };

      // Try to save to API
      const response = await fetch('/api/qa/step-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stepResultData),
      });

      if (!response.ok) {
        // If unauthorized, store in buffer for later sync
        if (response.status === 401) {
          const buffer: CaptureBufferEntry[] = JSON.parse(sessionStorage.getItem(QA_CAPTURE_BUFFER_KEY) || '[]');
          buffer.push({ stepResult: stepResultData, timestamp: new Date().toISOString() });
          sessionStorage.setItem(QA_CAPTURE_BUFFER_KEY, JSON.stringify(buffer));
          toast('Resultado guardado localmente (sin sesión)', { icon: '📦' });
        } else {
          const data = await response.json();
          throw new Error(data.error || 'Error al guardar resultado');
        }
      }

      // Update step results tracker
      setStepResults((prev) => new Map(prev).set(currentStepIndex, passed));

      // Accumulate total active seconds and reset for next step
      const newTotalActive = totalActiveSeconds + stepActiveSeconds;
      setTotalActiveSeconds(newTotalActive);
      sessionStorage.setItem(QA_TOTAL_ACTIVE_SECONDS_KEY, String(newTotalActive));
      activityTracker.reset();
      activityTracker.start();

      // Clear for next step
      clearCapture();
      setTesterNote('');
      setStepStartTime(new Date());

      // Check if this was the last step
      if (currentStepIndex >= scenario.steps.length - 1) {
        stopCapture();
        activityTracker.stop();
        setIsComplete(true);
      } else {
        setCurrentStepIndex((prev) => prev + 1);
        toast.success(passed ? 'Paso completado ✓' : 'Paso fallido ✗');

        // Navigate to next step's route if specified
        const nextStep = scenario.steps[currentStepIndex + 1];
        if (nextStep?.route && nextStep.route !== router.asPath) {
          router.push(nextStep.route);
        }
      }
    } catch (error: any) {
      console.error('Error saving step result:', error);
      toast.error(error.message || 'Error al guardar resultado');
    } finally {
      setSaving(false);
    }
  };

  // Complete test run
  const completeTestRun = async () => {
    if (!testRunId) return;

    setSaving(true);

    try {
      const results = Array.from(stepResults.values());
      const failedCount = results.filter((r) => r === false).length;
      const passedCount = results.filter((r) => r === true).length;

      let overallResult: 'pass' | 'fail' | 'partial' = 'pass';
      if (failedCount > 0 && passedCount === 0) {
        overallResult = 'fail';
      } else if (failedCount > 0) {
        overallResult = 'partial';
      }

      const response = await fetch(`/api/qa/runs/${testRunId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overall_result: overallResult,
          notes: testerNote || undefined,
          total_active_seconds: totalActiveSeconds,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al completar ejecución');
      }

      toast.success('Ejecución completada');
      exitQAMode();
      router.push('/qa');
    } catch (error: any) {
      console.error('Error completing test run:', error);
      toast.error(error.message || 'Error al completar ejecución');
    } finally {
      setSaving(false);
    }
  };

  // Exit QA mode
  const exitQAMode = () => {
    stopCapture();
    activityTracker.stop();

    // Clear session storage
    sessionStorage.removeItem(QA_SESSION_KEY);
    sessionStorage.removeItem(QA_SCENARIO_KEY);
    sessionStorage.removeItem(QA_CURRENT_STEP_KEY);
    sessionStorage.removeItem(QA_STEP_RESULTS_KEY);
    sessionStorage.removeItem(QA_STEP_ACTIVE_SECONDS_KEY);
    sessionStorage.removeItem(QA_TOTAL_ACTIVE_SECONDS_KEY);
    sessionStorage.removeItem(QA_LAST_DB_SAVE_KEY);
    sessionStorage.removeItem(QA_RECOVERED_TIME_KEY);

    // Clear state
    setTestRunId(null);
    setScenario(null);
    setCurrentStepIndex(0);
    setStepResults(new Map());
    setIsComplete(false);
    setTotalActiveSeconds(0);

    if (onClose) {
      onClose();
    }
  };

  // Sync buffered captures (called on mount and when auth state changes)
  useEffect(() => {
    const syncBuffer = async () => {
      if (typeof window === 'undefined') return;

      const buffer: CaptureBufferEntry[] = JSON.parse(sessionStorage.getItem(QA_CAPTURE_BUFFER_KEY) || '[]');
      if (buffer.length === 0) return;

      // Try to sync each buffered entry
      const remaining: CaptureBufferEntry[] = [];
      for (const entry of buffer) {
        try {
          const response = await fetch('/api/qa/step-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry.stepResult),
          });

          if (!response.ok && response.status === 401) {
            remaining.push(entry);
          }
        } catch {
          remaining.push(entry);
        }
      }

      if (remaining.length < buffer.length) {
        toast.success(`Sincronizados ${buffer.length - remaining.length} resultados`);
      }

      sessionStorage.setItem(QA_CAPTURE_BUFFER_KEY, JSON.stringify(remaining));
    };

    syncBuffer();
  }, [testRunId]);

  // Don't render if no active session
  if (!testRunId || !scenario) {
    return null;
  }

  const currentStep = scenario.steps[currentStepIndex];
  const totalSteps = scenario.steps.length;
  const progress = Math.round((currentStepIndex / totalSteps) * 100);

  // Check if current step requires logout (route is /login)
  const stepRequiresLogout = currentStep?.route === '/login';

  return (
    <div
      ref={widgetRef}
      className={`fixed z-[9999] bg-white rounded-lg shadow-2xl border border-gray-200 transition-all duration-200 ${isDragging ? 'cursor-grabbing' : ''}`}
      style={{
        right: position.x,
        bottom: position.y,
        width: isMinimized ? '200px' : '380px',
        maxHeight: isMinimized ? '48px' : '500px',
      }}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 bg-brand_primary rounded-t-lg cursor-grab ${isDragging ? 'cursor-grabbing' : ''}`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 text-white">
          <GripVertical className="w-4 h-4 opacity-70" />
          <span className="font-medium text-sm truncate">
            {isMinimized ? `QA: ${currentStepIndex + 1}/${totalSteps}` : 'QA Testing'}
          </span>
          {/* Timer display */}
          <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${activityTracker.isPaused ? 'bg-amber-500/80' : 'bg-green-500/80'}`} title={activityTracker.isPaused ? 'Pausado (inactivo)' : 'Tiempo activo'}>
            {activityTracker.isPaused ? <Pause className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {activityTracker.formatTime()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title={isMinimized ? 'Expandir' : 'Minimizar'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
          </button>
          <button
            onClick={exitQAMode}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Salir del modo QA"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && !isComplete && currentStep && (
        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
          {/* Scenario Name */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="truncate">{scenario.name}</span>
            {scenario.is_multi_user && (
              <span className="shrink-0 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-semibold uppercase">
                Multi-Usuario
              </span>
            )}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-brand_accent h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 font-medium">
              {currentStepIndex + 1}/{totalSteps}
            </span>
          </div>

          {/* Step indicators */}
          <div className="flex gap-1">
            {scenario.steps.map((_, index) => {
              const result = stepResults.get(index);
              let bgClass = 'bg-gray-200';
              if (result === true) bgClass = 'bg-green-500';
              else if (result === false) bgClass = 'bg-red-500';
              else if (index === currentStepIndex) bgClass = 'bg-brand_accent';

              return (
                <div
                  key={index}
                  className={`flex-1 h-1 rounded-full ${bgClass} transition-colors`}
                />
              );
            })}
          </div>

          {/* Logout warning */}
          {stepRequiresLogout && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Este paso requiere cerrar sesión. Los resultados se guardarán localmente.</span>
            </div>
          )}

          {/* Current Step */}
          <div className="space-y-2">
            {/* Multi-user indicator */}
            {currentStep.actor && (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                    currentStep.tabIndicator === 1
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : currentStep.tabIndicator === 2
                      ? 'bg-purple-100 text-purple-800 border border-purple-300'
                      : currentStep.tabIndicator === 3
                      ? 'bg-orange-100 text-orange-800 border border-orange-300'
                      : 'bg-gray-100 text-gray-800 border border-gray-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  {currentStep.actor}
                </span>
              </div>
            )}
            <div className="text-sm font-medium text-gray-900">
              {currentStep.instruction}
            </div>
            {currentStep.route && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <ExternalLink className="w-3 h-3" />
                <code className="bg-gray-100 px-1 rounded">{currentStep.route}</code>
                {currentStep.route !== router.asPath && (
                  <button
                    onClick={() => router.push(currentStep.route!)}
                    className="text-brand_accent hover:underline"
                  >
                    Ir
                  </button>
                )}
              </div>
            )}
            <div className="text-xs text-gray-600 bg-brand_accent/10 border border-brand_accent/30 rounded p-2">
              <span className="font-medium">Esperado:</span> {currentStep.expectedOutcome}
            </div>
          </div>

          {/* Tester Note */}
          <textarea
            value={testerNote}
            onChange={(e) => setTesterNote(e.target.value)}
            placeholder="Notas (opcional)..."
            rows={2}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand_accent resize-none"
          />

          {/* Screenshot indicator */}
          {isCapturingScreenshot && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Camera className="w-3 h-3 animate-pulse" />
              Capturando pantalla...
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => saveStepResult(false)}
              disabled={saving || isCapturingScreenshot}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-500 text-white rounded-lg font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Fallo
            </button>
            <button
              onClick={() => saveStepResult(true)}
              disabled={saving || isCapturingScreenshot}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg font-medium text-sm hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Paso
            </button>
          </div>
        </div>
      )}

      {/* Completion Screen */}
      {!isMinimized && isComplete && (
        <div className="p-4 space-y-4 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          <div className="font-medium text-gray-900">¡Prueba Completada!</div>

          <div className="flex justify-center gap-6 text-sm">
            <div>
              <div className="text-xl font-bold text-green-600">
                {Array.from(stepResults.values()).filter((r) => r === true).length}
              </div>
              <div className="text-gray-500">Pasaron</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-600">
                {Array.from(stepResults.values()).filter((r) => r === false).length}
              </div>
              <div className="text-gray-500">Fallaron</div>
            </div>
          </div>

          <textarea
            value={testerNote}
            onChange={(e) => setTesterNote(e.target.value)}
            placeholder="Notas finales (opcional)..."
            rows={2}
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand_accent resize-none"
          />

          <button
            onClick={completeTestRun}
            disabled={saving}
            className="w-full px-4 py-2 bg-brand_primary text-white rounded-lg font-medium text-sm hover:bg-brand_gray_dark transition-colors disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </span>
            ) : (
              'Finalizar y Ver Resultados'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default QAFloatingWidget;
