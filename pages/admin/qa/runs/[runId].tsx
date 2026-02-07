/**
 * QA Test Run Detail Page
 *
 * Detailed view of a single test run with all captured data.
 * Includes Claude Code export functionality.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Terminal,
  Globe,
  Image as ImageIcon,
  FileCode,
} from 'lucide-react';
import type { QATestRun, QAStepResult, ConsoleLogEntry, NetworkLogEntry } from '@/types/qa';
import { FEATURE_AREA_LABELS } from '@/types/qa';
import { generateClaudeCodeExport } from '@/lib/qa/exportToClaudeCode';

const QATestRunDetailPage: React.FC = () => {
  const router = useRouter();
  const { runId } = router.query;
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [testRun, setTestRun] = useState<QATestRun | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMarkdown, setExportMarkdown] = useState('');

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

      // Check permissions (admin only)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const isAdmin = roles?.some((r) => r.role_type === 'admin') || false;
      setHasPermission(isAdmin);
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch test run
  const fetchTestRun = useCallback(async () => {
    if (!runId || !user || hasPermission === false) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/qa/runs/${runId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar ejecución');
      }

      const data = await response.json();
      setTestRun(data.testRun);
    } catch (error: any) {
      console.error('Error fetching test run:', error);
      toast.error(error.message || 'Error al cargar ejecución');
      router.push('/admin/qa');
    } finally {
      setLoading(false);
    }
  }, [runId, user, hasPermission, router]);

  useEffect(() => {
    if (user && hasPermission === true && runId) {
      fetchTestRun();
    }
  }, [user, hasPermission, runId, fetchTestRun]);

  // Toggle step expansion
  const toggleStep = (stepIndex: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) {
        next.delete(stepIndex);
      } else {
        next.add(stepIndex);
      }
      return next;
    });
  };

  // Generate export for a failed step
  const handleExportStep = (stepResult: QAStepResult) => {
    if (!testRun || !testRun.scenario) return;

    const markdown = generateClaudeCodeExport(testRun, stepResult);
    setExportMarkdown(markdown);
    setShowExportModal(true);
  };

  // Copy export to clipboard
  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportMarkdown);
      toast.success('Copiado al portapapeles');
    } catch (e) {
      toast.error('Error al copiar');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Get result icon
  const getResultIcon = (
    result: 'pass' | 'fail' | 'partial' | null,
    status: string
  ) => {
    if (status === 'in_progress') {
      return <Clock className="w-5 h-5 text-blue-500" />;
    }
    switch (result) {
      case 'pass':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'partial':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  // Get result label
  const getResultLabel = (
    result: 'pass' | 'fail' | 'partial' | null,
    status: string
  ) => {
    if (status === 'in_progress') return 'En Progreso';
    if (status === 'aborted') return 'Abortado';
    switch (result) {
      case 'pass':
        return 'Pasó';
      case 'fail':
        return 'Falló';
      case 'partial':
        return 'Parcial';
      default:
        return 'Pendiente';
    }
  };

  // Loading state
  if (loading && hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="qa-admin"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">
              Acceso Denegado
            </h1>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!testRun) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando ejecución...</p>
      </div>
    );
  }

  const scenario = testRun.scenario;
  const stepResults = testRun.step_results || [];
  const tester = testRun.tester as any;

  return (
    <MainLayout
      user={user}
      currentPage="qa-admin"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/qa"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {scenario?.name || 'Escenario eliminado'}
              </h1>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>
                  {tester?.first_name} {tester?.last_name}
                </span>
                <span>•</span>
                <span>
                  {new Date(testRun.started_at).toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getResultIcon(testRun.overall_result, testRun.status)}
            <span
              className={`font-medium ${
                testRun.overall_result === 'pass'
                  ? 'text-green-600'
                  : testRun.overall_result === 'fail'
                    ? 'text-red-600'
                    : testRun.overall_result === 'partial'
                      ? 'text-yellow-600'
                      : 'text-gray-600'
              }`}
            >
              {getResultLabel(testRun.overall_result, testRun.status)}
            </span>
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Área</p>
              <p className="font-medium">
                {scenario?.feature_area
                  ? FEATURE_AREA_LABELS[scenario.feature_area]
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Rol Usado</p>
              <p className="font-medium">{testRun.role_used}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Ambiente</p>
              <p className="font-medium capitalize">{testRun.environment}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Duración</p>
              <p className="font-medium">
                {testRun.completed_at
                  ? `${Math.round(
                      (new Date(testRun.completed_at).getTime() -
                        new Date(testRun.started_at).getTime()) /
                        60000
                    )} min`
                  : 'En progreso'}
              </p>
            </div>
          </div>

          {testRun.notes && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">Notas Finales</p>
              <p className="text-gray-700">{testRun.notes}</p>
            </div>
          )}
        </div>

        {/* Step Results */}
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Resultados por Paso ({stepResults.length})
        </h2>

        <div className="space-y-4">
          {stepResults.map((result) => {
            const isExpanded = expandedSteps.has(result.step_index);
            const hasErrors =
              result.console_logs?.some((l) => l.level === 'error') ||
              result.network_logs?.some((n) => n.status && n.status >= 400);

            return (
              <div
                key={result.id}
                className="bg-white rounded-lg shadow-md overflow-hidden"
              >
                {/* Step Header */}
                <button
                  onClick={() => toggleStep(result.step_index)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {result.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <div className="text-left">
                      <p className="font-medium text-gray-900">
                        Paso {result.step_index}: {result.step_instruction}
                      </p>
                      <p className="text-sm text-gray-500">
                        Esperado: {result.expected_outcome}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasErrors && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                        Errores
                      </span>
                    )}
                    {result.screenshot_url && (
                      <ImageIcon className="w-4 h-4 text-gray-400" />
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-gray-200">
                    {/* Tester Note */}
                    {result.tester_note && (
                      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm font-medium text-yellow-800">
                          Nota del Tester:
                        </p>
                        <p className="text-sm text-yellow-700">
                          {result.tester_note}
                        </p>
                      </div>
                    )}

                    {/* Screenshot */}
                    {result.screenshot_url && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" />
                          Captura de Pantalla
                        </p>
                        <a
                          href={result.screenshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src={result.screenshot_url}
                            alt="Screenshot"
                            className="max-w-md rounded-lg border border-gray-300 hover:opacity-90 transition-opacity"
                          />
                        </a>
                      </div>
                    )}

                    {/* Console Logs */}
                    {result.console_logs && result.console_logs.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                          <Terminal className="w-4 h-4" />
                          Consola ({result.console_logs.length} entradas)
                        </p>
                        <div className="bg-gray-900 rounded-lg p-4 max-h-48 overflow-y-auto font-mono text-sm">
                          {result.console_logs.map((log, i) => (
                            <div
                              key={i}
                              className={`${
                                log.level === 'error'
                                  ? 'text-red-400'
                                  : log.level === 'warn'
                                    ? 'text-yellow-400'
                                    : 'text-gray-300'
                              }`}
                            >
                              [{log.level}] {log.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Network Logs */}
                    {result.network_logs && result.network_logs.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          Red ({result.network_logs.length} peticiones)
                        </p>
                        <div className="bg-gray-100 rounded-lg p-4 max-h-48 overflow-y-auto text-sm space-y-2">
                          {result.network_logs.map((req, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-2 ${
                                req.status && req.status >= 400
                                  ? 'text-red-600'
                                  : 'text-gray-700'
                              }`}
                            >
                              <span className="font-mono">{req.method}</span>
                              <span className="truncate flex-1">{req.url}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs ${
                                  req.status && req.status >= 400
                                    ? 'bg-red-100'
                                    : req.status && req.status >= 200
                                      ? 'bg-green-100'
                                      : 'bg-gray-200'
                                }`}
                              >
                                {req.status || 'ERR'}
                              </span>
                              {req.duration && (
                                <span className="text-gray-400 text-xs">
                                  {req.duration}ms
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Export Button (for failed steps) */}
                    {!result.passed && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => handleExportStep(result)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_gray_dark transition-colors"
                        >
                          <FileCode className="w-4 h-4" />
                          Exportar para Claude Code
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Exportar para Claude Code
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Copia este markdown y pégalo en Claude Code para depurar
              </p>
            </div>
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm whitespace-pre-wrap font-mono">
                {exportMarkdown}
              </pre>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={copyExport}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg hover:bg-brand_gray_dark transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copiar
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default QATestRunDetailPage;
