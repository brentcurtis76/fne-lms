/**
 * QA Test Runner Page
 *
 * This page is the entry point for starting a QA test run.
 * When the tester confirms preconditions and starts the test:
 * 1. Creates a test run in the database
 * 2. Stores scenario data in sessionStorage
 * 3. Redirects to the first step's target URL
 * 4. The floating widget (QAFloatingWidget) takes over from there
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import {
  ArrowLeft,
  Play,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { getBrowserInfo, detectEnvironment } from '@/lib/qa';
import { useQASession } from '@/components/qa/QASessionProvider';
import type {
  QAScenario,
  BrowserInfo,
} from '@/types/qa';
import { FEATURE_AREA_LABELS, PRIORITY_LABELS } from '@/types/qa';

// Session storage keys
const QA_SESSION_KEY = 'qa_test_run_id';
const QA_SCENARIO_KEY = 'qa_scenario_data';
const QA_CURRENT_STEP_KEY = 'qa_current_step_index';
const QA_STEP_RESULTS_KEY = 'qa_step_results';

const QATestRunnerPage: React.FC = () => {
  const router = useRouter();
  const { scenarioId } = router.query;
  const supabase = useSupabaseClient();
  const { startQASession, isQASessionActive } = useQASession();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [canRunQATests, setCanRunQATests] = useState(false);

  // Scenario state
  const [scenario, setScenario] = useState<QAScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Preconditions
  const [showPreconditions, setShowPreconditions] = useState(true);
  const [preconditionsChecked, setPreconditionsChecked] = useState<Set<number>>(new Set());

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      // Get avatar
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Get QA permission flag from profile
      let canRunQA = false;
      const { data: qaData, error: qaError } = await supabase
        .from('profiles')
        .select('can_run_qa_tests')
        .eq('id', session.user.id)
        .single();

      if (qaError) {
        console.error('[QA] Error fetching can_run_qa_tests:', qaError.message);
        // Column might not exist - admins will still have access via role check
      } else {
        canRunQA = qaData?.can_run_qa_tests === true;
        console.log('[QA] can_run_qa_tests value:', qaData?.can_run_qa_tests, '-> canRunQA:', canRunQA);
      }

      // Check if admin
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const userIsAdmin = roles?.some((r) => r.role_type === 'admin') || false;
      setIsAdmin(userIsAdmin);

      // User can run QA tests if admin OR has the flag set
      setCanRunQATests(userIsAdmin || canRunQA);
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch scenario
  useEffect(() => {
    const fetchScenario = async () => {
      if (!scenarioId || !user) return;

      setLoading(true);
      try {
        const response = await fetch(`/api/qa/scenarios/${scenarioId}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Error al cargar escenario');
        }

        const data = await response.json();
        setScenario(data.scenario);
      } catch (error: any) {
        console.error('Error fetching scenario:', error);
        toast.error(error.message || 'Error al cargar escenario');
        router.push('/qa');
      } finally {
        setLoading(false);
      }
    };

    fetchScenario();
  }, [scenarioId, user, router]);

  // Redirect if already in a QA session
  useEffect(() => {
    if (isQASessionActive && scenario) {
      // Already have an active session, redirect to where the widget is
      const firstStepRoute = scenario.steps[0]?.route || '/dashboard';
      router.push(firstStepRoute);
    }
  }, [isQASessionActive, scenario, router]);

  // Toggle precondition check
  const togglePrecondition = (index: number) => {
    setPreconditionsChecked((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // All preconditions checked?
  const allPreconditionsChecked =
    !scenario?.preconditions ||
    scenario.preconditions.length === 0 ||
    preconditionsChecked.size === scenario.preconditions.length;

  // Start test run
  const handleStartTest = useCallback(async () => {
    if (!scenario || !user) return;

    setStarting(true);

    try {
      const browserInfo: BrowserInfo = getBrowserInfo();
      const environment = detectEnvironment();

      // Create the test run in the database
      const response = await fetch('/api/qa/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenario.id,
          environment,
          browser_info: browserInfo,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al iniciar ejecución');
      }

      const data = await response.json();
      const testRunId = data.testRun.id;

      // Store session data
      sessionStorage.setItem(QA_SESSION_KEY, testRunId);
      sessionStorage.setItem(QA_SCENARIO_KEY, JSON.stringify(scenario));
      sessionStorage.setItem(QA_CURRENT_STEP_KEY, '0');
      sessionStorage.setItem(QA_STEP_RESULTS_KEY, JSON.stringify({}));

      // Start the QA session (this will trigger the floating widget)
      startQASession(testRunId, scenario);

      toast.success('Prueba iniciada - El widget de QA aparecerá en pantalla');

      // Redirect to the first step's route (or dashboard if none specified)
      const firstStepRoute = scenario.steps[0]?.route || '/dashboard';
      router.push(firstStepRoute);
    } catch (error: any) {
      console.error('Error starting test run:', error);
      toast.error(error.message || 'Error al iniciar ejecución');
    } finally {
      setStarting(false);
    }
  }, [scenario, user, startQASession, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand_primary" />
      </div>
    );
  }

  // Access denied
  if (!canRunQATests && user) {
    return (
      <MainLayout
        user={user}
        currentPage="qa-testing"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso Restringido</h1>
          <p className="text-gray-600 mb-6">
            No tienes permisos para ejecutar pruebas de QA. Contacta a un administrador para
            solicitar acceso.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg hover:bg-brand_gray_dark transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Dashboard
          </Link>
        </div>
      </MainLayout>
    );
  }

  if (!scenario) {
    return (
      <div className="min-h-screen bg-brand_beige flex flex-col justify-center items-center">
        <p className="text-xl text-brand_primary mb-4">Escenario no encontrado</p>
        <Link href="/qa" className="text-brand_primary underline hover:no-underline">
          Volver a escenarios
        </Link>
      </div>
    );
  }

  const totalSteps = scenario.steps.length;
  const estimatedTime = scenario.estimated_duration_minutes;

  return (
    <MainLayout
      user={user}
      currentPage="qa-testing"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/qa" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{scenario.name}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
              <span className="px-2 py-0.5 bg-gray-100 rounded">
                {FEATURE_AREA_LABELS[scenario.feature_area]}
              </span>
              <span className="px-2 py-0.5 bg-gray-100 rounded">
                {PRIORITY_LABELS[scenario.priority]}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                ~{estimatedTime} min
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        {scenario.description && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Descripción</h2>
            <p className="text-gray-600">{scenario.description}</p>
          </div>
        )}

        {/* Preconditions */}
        {scenario.preconditions && scenario.preconditions.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <button
              onClick={() => setShowPreconditions(!showPreconditions)}
              className="flex items-center justify-between w-full"
            >
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Precondiciones ({preconditionsChecked.size}/{scenario.preconditions.length})
              </h2>
              {showPreconditions ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showPreconditions && (
              <>
                <p className="mt-3 text-sm text-gray-600 mb-4">
                  Marca cada condición cuando esté verificada:
                </p>
                <ul className="space-y-3">
                  {scenario.preconditions.map((precondition, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id={`precondition-${index}`}
                        checked={preconditionsChecked.has(index)}
                        onChange={() => togglePrecondition(index)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-brand_primary focus:ring-brand_accent"
                      />
                      <label
                        htmlFor={`precondition-${index}`}
                        className="text-sm text-gray-700 cursor-pointer"
                      >
                        <span
                          className={`inline-block px-1.5 py-0.5 text-xs rounded mr-2 ${
                            precondition.type === 'role'
                              ? 'bg-brand_accent/20 text-brand_gray_dark'
                              : precondition.type === 'data'
                              ? 'bg-brand_primary/10 text-brand_primary'
                              : precondition.type === 'navigation'
                              ? 'bg-brand_accent/30 text-brand_gray_dark'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {precondition.type}
                        </span>
                        {precondition.description}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Steps Preview */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Pasos a ejecutar ({totalSteps})
          </h2>
          <ol className="space-y-3">
            {scenario.steps.slice(0, 5).map((step, index) => (
              <li key={index} className="flex items-start gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-brand_primary text-white rounded-full text-xs font-medium">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-gray-700">{step.instruction}</p>
                  {step.route && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      {step.route}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {scenario.steps.length > 5 && (
              <li className="text-sm text-gray-500 italic pl-9">
                ... y {scenario.steps.length - 5} pasos más
              </li>
            )}
          </ol>
        </div>

        {/* Start Button */}
        <div className="bg-brand_primary rounded-lg shadow-lg p-6 text-center">
          <p className="text-white/80 text-sm mb-4">
            Al iniciar, aparecerá un widget flotante que te guiará durante la prueba.
            Podrás navegar libremente por la aplicación mientras ejecutas los pasos.
          </p>
          <button
            onClick={handleStartTest}
            disabled={!allPreconditionsChecked || starting}
            className={`inline-flex items-center gap-2 px-8 py-4 rounded-lg font-semibold text-lg transition-all ${
              allPreconditionsChecked && !starting
                ? 'bg-white text-brand_primary hover:bg-gray-100 hover:scale-105'
                : 'bg-white/30 text-white/70 cursor-not-allowed'
            }`}
          >
            {starting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Iniciar Prueba
              </>
            )}
          </button>
          {!allPreconditionsChecked && (
            <p className="text-white/70 text-xs mt-3">
              Debes verificar todas las precondiciones antes de iniciar
            </p>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default QATestRunnerPage;
