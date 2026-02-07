/**
 * QA Scenario Import Page
 *
 * Interface for importing Claude Code generated scenarios.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import {
  ArrowLeft,
  Upload,
  FileJson,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import type { ImportScenariosResponse, FeatureArea } from '@/types/qa';
import { FEATURE_AREA_LABELS } from '@/types/qa';

const SAMPLE_JSON = `{
  "scenarios": [
    {
      "name": "Login con credenciales válidas",
      "description": "Verifica que un usuario puede iniciar sesión correctamente",
      "feature_area": "authentication",
      "role_required": "docente",
      "preconditions": [
        { "type": "custom", "description": "Tener credenciales de test disponibles" }
      ],
      "steps": [
        {
          "instruction": "Navegar a /login",
          "expectedOutcome": "Se muestra el formulario de login",
          "route": "/login",
          "captureOnFail": true,
          "captureOnPass": false
        },
        {
          "instruction": "Ingresar email y contraseña válidos",
          "expectedOutcome": "Los campos aceptan el texto",
          "captureOnFail": true,
          "captureOnPass": false
        },
        {
          "instruction": "Hacer clic en 'Iniciar Sesión'",
          "expectedOutcome": "Redirige al dashboard sin errores",
          "route": "/dashboard",
          "captureOnFail": true,
          "captureOnPass": true
        }
      ],
      "priority": 1,
      "estimated_duration_minutes": 3
    }
  ]
}`;

const QAScenarioImportPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const [jsonInput, setJsonInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedScenarios, setParsedScenarios] = useState<any[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportScenariosResponse | null>(null);

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
      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  // Parse JSON input
  const handleParse = () => {
    setParsing(true);
    setParseError(null);
    setParsedScenarios(null);

    try {
      const parsed = JSON.parse(jsonInput);

      if (!parsed.scenarios || !Array.isArray(parsed.scenarios)) {
        throw new Error('El JSON debe contener un array "scenarios"');
      }

      if (parsed.scenarios.length === 0) {
        throw new Error('El array de escenarios está vacío');
      }

      setParsedScenarios(parsed.scenarios);
    } catch (e: any) {
      setParseError(e.message || 'Error al parsear JSON');
    } finally {
      setParsing(false);
    }
  };

  // Import scenarios
  const handleImport = async () => {
    if (!parsedScenarios) return;

    setImporting(true);
    setImportResult(null);

    try {
      const response = await fetch('/api/qa/import-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarios: parsedScenarios }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al importar');
      }

      setImportResult(data);

      if (data.imported > 0) {
        toast.success(`${data.imported} escenario(s) importado(s)`);
      }
      if (data.skipped > 0) {
        toast(`${data.skipped} escenario(s) omitido(s)`, { icon: '⚠️' });
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  // Copy sample JSON
  const copySample = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_JSON);
      toast.success('Ejemplo copiado');
    } catch (e) {
      toast.error('Error al copiar');
    }
  };

  // Load sample
  const loadSample = () => {
    setJsonInput(SAMPLE_JSON);
    setParsedScenarios(null);
    setParseError(null);
    setImportResult(null);
  };

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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/admin/qa"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Importar Escenarios
            </h1>
            <p className="text-sm text-gray-500">
              Importa escenarios generados por Claude Code
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-blue-900 mb-2">
            ¿Cómo funciona?
          </h2>
          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
            <li>
              Pide a Claude Code que analice una funcionalidad y genere escenarios de prueba
            </li>
            <li>
              Claude Code generará un JSON con el formato esperado
            </li>
            <li>Pega el JSON aquí y haz clic en &quot;Validar&quot;</li>
            <li>Revisa los escenarios y haz clic en &quot;Importar&quot;</li>
          </ol>
          <div className="mt-3 flex gap-2">
            <button
              onClick={loadSample}
              className="text-sm text-blue-700 hover:underline"
            >
              Cargar ejemplo
            </button>
            <span className="text-blue-400">|</span>
            <button
              onClick={copySample}
              className="text-sm text-blue-700 hover:underline flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Copiar ejemplo
            </button>
          </div>
        </div>

        {/* JSON Input */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <label
            htmlFor="jsonInput"
            className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2"
          >
            <FileJson className="w-4 h-4" />
            JSON de Escenarios
          </label>
          <textarea
            id="jsonInput"
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.target.value);
              setParsedScenarios(null);
              setParseError(null);
              setImportResult(null);
            }}
            placeholder="Pega el JSON generado por Claude Code aquí..."
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-brand_accent"
          />

          {parseError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleParse}
              disabled={!jsonInput.trim() || parsing}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {parsing ? 'Validando...' : 'Validar JSON'}
            </button>
          </div>
        </div>

        {/* Parsed Preview */}
        {parsedScenarios && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {parsedScenarios.length} Escenario(s) Encontrado(s)
            </h2>

            <div className="space-y-4 max-h-96 overflow-y-auto">
              {parsedScenarios.map((scenario, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {scenario.name}
                      </h3>
                      {scenario.description && (
                        <p className="text-sm text-gray-500">
                          {scenario.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {scenario.feature_area
                        ? FEATURE_AREA_LABELS[scenario.feature_area as FeatureArea] || scenario.feature_area
                        : 'Sin área'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>Rol: {scenario.role_required || 'No especificado'}</span>
                    <span>•</span>
                    <span>{scenario.steps?.length || 0} pasos</span>
                    <span>•</span>
                    <span>Prioridad: {scenario.priority || 2}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-6 py-2 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {importing ? 'Importando...' : 'Importar Escenarios'}
              </button>
              <button
                onClick={() => {
                  setParsedScenarios(null);
                  setJsonInput('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Resultado de la Importación
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-2xl font-bold text-green-700">
                    {importResult.imported}
                  </span>
                </div>
                <p className="text-sm text-green-600">Importados</p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <span className="text-2xl font-bold text-yellow-700">
                    {importResult.skipped}
                  </span>
                </div>
                <p className="text-sm text-yellow-600">Omitidos</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800 mb-2">
                  Errores:
                </p>
                <ul className="text-sm text-red-700 space-y-1">
                  {importResult.errors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6">
              <Link
                href="/admin/qa/scenarios"
                className="px-4 py-2 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors inline-block"
              >
                Ver Escenarios
              </Link>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default QAScenarioImportPage;
