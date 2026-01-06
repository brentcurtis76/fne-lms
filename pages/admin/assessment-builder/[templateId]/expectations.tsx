import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ClipboardList,
  ArrowLeft,
  Save,
  Target,
  Info,
  CheckCircle,
  AlertCircle,
  Lock,
} from 'lucide-react';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  FREQUENCY_UNIT_LABELS,
  FREQUENCY_UNIT_OPTIONS,
} from '@/types/assessment-builder';
import type { TransformationArea, IndicatorCategory, FrequencyUnit, GenerationType } from '@/types/assessment-builder';

interface ExpectationData {
  year1: number | null;
  year1Unit: FrequencyUnit | null;
  year2: number | null;
  year2Unit: FrequencyUnit | null;
  year3: number | null;
  year3Unit: FrequencyUnit | null;
  year4: number | null;
  year4Unit: FrequencyUnit | null;
  year5: number | null;
  year5Unit: FrequencyUnit | null;
  tolerance: number;
}

interface IndicatorExpectation {
  indicatorId: string;
  indicatorCode?: string;
  indicatorName: string;
  indicatorCategory: IndicatorCategory;
  frequencyUnitOptions?: FrequencyUnit[];
  expectationsGT: ExpectationData;
  expectationsGI: ExpectationData | null; // null if template is always_gt
  isDirtyGT: boolean;
  isDirtyGI: boolean;
}

interface ModuleExpectations {
  moduleId: string;
  moduleName: string;
  moduleOrder: number;
  indicators: IndicatorExpectation[];
}

interface TemplateInfo {
  id: string;
  name: string;
  area: TransformationArea;
  status: string;
  version: string;
  gradeId?: number;
  gradeName?: string;
  isAlwaysGT: boolean;
  requiresDualExpectations: boolean;
}

const ExpectationsEditor: React.FC = () => {
  const router = useRouter();
  const { templateId } = router.query;
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Template info
  const [template, setTemplate] = useState<TemplateInfo | null>(null);

  // Expectations data
  const [moduleExpectations, setModuleExpectations] = useState<ModuleExpectations[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const hasAdminAccess = roles?.some(r => ['admin', 'consultor'].includes(r.role_type)) || false;
      setHasPermission(hasAdminAccess);
    };

    checkAuth();
  }, [supabase, router]);

  // Helper to create default expectation data
  const createDefaultExpectation = (): ExpectationData => ({
    year1: null,
    year1Unit: null,
    year2: null,
    year2Unit: null,
    year3: null,
    year3Unit: null,
    year4: null,
    year4Unit: null,
    year5: null,
    year5Unit: null,
    tolerance: 1,
  });

  // Fetch template and expectations
  const fetchData = useCallback(async () => {
    if (!templateId || typeof templateId !== 'string' || !user || hasPermission === false) return;

    setLoading(true);
    try {
      // Fetch expectations (includes template info now)
      const expectationsRes = await fetch(`/api/admin/assessment-builder/templates/${templateId}/expectations`);
      if (!expectationsRes.ok) {
        const data = await expectationsRes.json();
        throw new Error(data.error || 'Error al cargar expectativas');
      }
      const expectationsData = await expectationsRes.json();

      // Set template info from expectations response
      const templateInfo = expectationsData.template;
      setTemplate({
        id: templateInfo.id,
        name: templateInfo.name,
        area: templateInfo.area,
        status: templateInfo.status,
        version: templateInfo.version || '1.0',
        gradeId: templateInfo.gradeId,
        gradeName: templateInfo.grade?.name,
        isAlwaysGT: templateInfo.isAlwaysGT,
        requiresDualExpectations: templateInfo.requiresDualExpectations,
      });

      const requiresDual = templateInfo.requiresDualExpectations;

      // Transform API response to local state
      const modules: ModuleExpectations[] = (expectationsData.modules || []).map((mod: any) => ({
        moduleId: mod.moduleId,
        moduleName: mod.moduleName,
        moduleOrder: mod.moduleOrder,
        indicators: (mod.indicators || []).map((ind: any) => {
          // Parse GT expectations
          const gtExp = ind.expectationsGT;
          const gtData: ExpectationData = gtExp ? {
            year1: gtExp.year1 ?? null,
            year1Unit: gtExp.year1Unit ?? null,
            year2: gtExp.year2 ?? null,
            year2Unit: gtExp.year2Unit ?? null,
            year3: gtExp.year3 ?? null,
            year3Unit: gtExp.year3Unit ?? null,
            year4: gtExp.year4 ?? null,
            year4Unit: gtExp.year4Unit ?? null,
            year5: gtExp.year5 ?? null,
            year5Unit: gtExp.year5Unit ?? null,
            tolerance: gtExp.tolerance ?? 1,
          } : createDefaultExpectation();

          // Parse GI expectations (only for non-always_gt templates)
          let giData: ExpectationData | null = null;
          if (requiresDual) {
            const giExp = ind.expectationsGI;
            giData = giExp ? {
              year1: giExp.year1 ?? null,
              year1Unit: giExp.year1Unit ?? null,
              year2: giExp.year2 ?? null,
              year2Unit: giExp.year2Unit ?? null,
              year3: giExp.year3 ?? null,
              year3Unit: giExp.year3Unit ?? null,
              year4: giExp.year4 ?? null,
              year4Unit: giExp.year4Unit ?? null,
              year5: giExp.year5 ?? null,
              year5Unit: giExp.year5Unit ?? null,
              tolerance: giExp.tolerance ?? 1,
            } : createDefaultExpectation();
          }

          return {
            indicatorId: ind.indicatorId,
            indicatorCode: ind.indicatorCode,
            indicatorName: ind.indicatorName,
            indicatorCategory: ind.indicatorCategory,
            frequencyUnitOptions: ind.frequencyUnitOptions,
            expectationsGT: gtData,
            expectationsGI: giData,
            isDirtyGT: false,
            isDirtyGI: false,
          };
        }),
      }));

      setModuleExpectations(modules);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error(error.message || 'Error al cargar datos');
      router.push('/admin/assessment-builder');
    } finally {
      setLoading(false);
    }
  }, [templateId, user, hasPermission, router]);

  useEffect(() => {
    if (user && hasPermission === true && templateId) {
      fetchData();
    }
  }, [user, hasPermission, templateId, fetchData]);

  // Update expectation value for GT or GI
  const updateExpectation = (
    moduleId: string,
    indicatorId: string,
    generationType: GenerationType,
    field: keyof ExpectationData,
    value: number | null | FrequencyUnit
  ) => {
    setModuleExpectations(prev =>
      prev.map(mod =>
        mod.moduleId === moduleId
          ? {
              ...mod,
              indicators: mod.indicators.map(ind => {
                if (ind.indicatorId !== indicatorId) return ind;

                if (generationType === 'GT') {
                  return {
                    ...ind,
                    expectationsGT: { ...ind.expectationsGT, [field]: value },
                    isDirtyGT: true,
                  };
                } else {
                  // GI
                  if (!ind.expectationsGI) return ind; // Should not happen
                  return {
                    ...ind,
                    expectationsGI: { ...ind.expectationsGI, [field]: value },
                    isDirtyGI: true,
                  };
                }
              }),
            }
          : mod
      )
    );
    setHasChanges(true);
  };

  // Save all changes
  const handleSaveAll = async () => {
    if (!template) return;

    // Collect all dirty indicators (GT and GI separately)
    const updates: Array<{
      indicatorId: string;
      generationType: GenerationType;
      year1: number | null;
      year1Unit: FrequencyUnit | null;
      year2: number | null;
      year2Unit: FrequencyUnit | null;
      year3: number | null;
      year3Unit: FrequencyUnit | null;
      year4: number | null;
      year4Unit: FrequencyUnit | null;
      year5: number | null;
      year5Unit: FrequencyUnit | null;
      tolerance: number;
    }> = [];

    moduleExpectations.forEach(mod => {
      mod.indicators.forEach(ind => {
        // Save GT expectations if dirty
        if (ind.isDirtyGT) {
          updates.push({
            indicatorId: ind.indicatorId,
            generationType: 'GT',
            year1: ind.expectationsGT.year1,
            year1Unit: ind.expectationsGT.year1Unit,
            year2: ind.expectationsGT.year2,
            year2Unit: ind.expectationsGT.year2Unit,
            year3: ind.expectationsGT.year3,
            year3Unit: ind.expectationsGT.year3Unit,
            year4: ind.expectationsGT.year4,
            year4Unit: ind.expectationsGT.year4Unit,
            year5: ind.expectationsGT.year5,
            year5Unit: ind.expectationsGT.year5Unit,
            tolerance: ind.expectationsGT.tolerance,
          });
        }
        // Save GI expectations if dirty (only for non-always_gt templates)
        if (ind.isDirtyGI && ind.expectationsGI) {
          updates.push({
            indicatorId: ind.indicatorId,
            generationType: 'GI',
            year1: ind.expectationsGI.year1,
            year1Unit: ind.expectationsGI.year1Unit,
            year2: ind.expectationsGI.year2,
            year2Unit: ind.expectationsGI.year2Unit,
            year3: ind.expectationsGI.year3,
            year3Unit: ind.expectationsGI.year3Unit,
            year4: ind.expectationsGI.year4,
            year4Unit: ind.expectationsGI.year4Unit,
            year5: ind.expectationsGI.year5,
            year5Unit: ind.expectationsGI.year5Unit,
            tolerance: ind.expectationsGI.tolerance,
          });
        }
      });
    });

    if (updates.length === 0) {
      toast.success('No hay cambios para guardar');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/expectations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectations: updates }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al guardar expectativas');
      }

      // Clear dirty flags
      setModuleExpectations(prev =>
        prev.map(mod => ({
          ...mod,
          indicators: mod.indicators.map(ind => ({ ...ind, isDirtyGT: false, isDirtyGI: false })),
        }))
      );
      setHasChanges(false);
      toast.success(`${updates.length} expectativa${updates.length !== 1 ? 's' : ''} guardada${updates.length !== 1 ? 's' : ''}`);
    } catch (error: any) {
      console.error('Error saving expectations:', error);
      toast.error(error.message || 'Error al guardar expectativas');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Render year input cell for GT or GI
  const renderYearCell = (
    moduleId: string,
    indicator: IndicatorExpectation,
    generationType: GenerationType,
    yearKey: 'year1' | 'year2' | 'year3' | 'year4' | 'year5',
    disabled: boolean
  ) => {
    const expectations = generationType === 'GT' ? indicator.expectationsGT : indicator.expectationsGI;
    if (!expectations) return <td key={`${yearKey}-${generationType}`} className="px-2 py-2 text-center border-r border-gray-200">-</td>;

    const value = expectations[yearKey];

    // For cobertura indicators, show checkbox (0 or null)
    if (indicator.indicatorCategory === 'cobertura') {
      return (
        <td key={`${yearKey}-${generationType}`} className="px-2 py-2 text-center border-r border-gray-200">
          <input
            type="checkbox"
            checked={value === 1}
            onChange={(e) => updateExpectation(moduleId, indicator.indicatorId, generationType, yearKey, e.target.checked ? 1 : null)}
            disabled={disabled}
            className="h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded disabled:opacity-50"
          />
        </td>
      );
    }

    // For frecuencia indicators, show numeric input AND unit dropdown
    if (indicator.indicatorCategory === 'frecuencia') {
      const unitKey = `${yearKey}Unit` as keyof ExpectationData;
      const unitValue = expectations[unitKey] as FrequencyUnit | null;
      const availableUnits = indicator.frequencyUnitOptions && indicator.frequencyUnitOptions.length > 0
        ? indicator.frequencyUnitOptions
        : FREQUENCY_UNIT_OPTIONS;

      return (
        <td key={`${yearKey}-${generationType}`} className="px-2 py-2 text-center border-r border-gray-200">
          <div className="flex items-center gap-1 justify-center">
            <input
              type="number"
              min="0"
              max="999"
              value={value ?? ''}
              onChange={(e) => {
                const newValue = e.target.value === '' ? null : parseInt(e.target.value, 10);
                updateExpectation(moduleId, indicator.indicatorId, generationType, yearKey, newValue);
              }}
              disabled={disabled}
              placeholder="-"
              className="w-12 px-1 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_blue disabled:bg-gray-100 disabled:opacity-50"
            />
            <span className="text-xs text-gray-400">/</span>
            <select
              value={unitValue || availableUnits[0]}
              onChange={(e) => {
                updateExpectation(moduleId, indicator.indicatorId, generationType, unitKey, e.target.value as FrequencyUnit);
              }}
              disabled={disabled}
              className="w-16 px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_blue disabled:bg-gray-100 disabled:opacity-50"
            >
              {availableUnits.map((u) => (
                <option key={u} value={u}>
                  {u === 'dia' ? 'día' : u === 'año' ? 'año' : u.substring(0, 3)}
                </option>
              ))}
            </select>
          </div>
        </td>
      );
    }

    // For profundidad indicators, show 0-4 dropdown
    return (
      <td key={`${yearKey}-${generationType}`} className="px-2 py-2 text-center border-r border-gray-200">
        <select
          value={value ?? ''}
          onChange={(e) => {
            const newValue = e.target.value === '' ? null : parseInt(e.target.value, 10);
            updateExpectation(moduleId, indicator.indicatorId, generationType, yearKey, newValue);
          }}
          disabled={disabled}
          className="w-14 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_blue disabled:bg-gray-100 disabled:opacity-50"
        >
          <option value="">-</option>
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </td>
    );
  };

  // Count configured expectations
  const countConfigured = (): { total: number; configured: number } => {
    let total = 0;
    let configured = 0;
    const requiresDual = template?.requiresDualExpectations ?? false;

    moduleExpectations.forEach(mod => {
      mod.indicators.forEach(ind => {
        total++;
        const hasGTExpectation =
          ind.expectationsGT.year1 !== null ||
          ind.expectationsGT.year2 !== null ||
          ind.expectationsGT.year3 !== null ||
          ind.expectationsGT.year4 !== null ||
          ind.expectationsGT.year5 !== null;

        if (requiresDual && ind.expectationsGI) {
          // For dual expectations, both GT and GI must be configured
          const hasGIExpectation =
            ind.expectationsGI.year1 !== null ||
            ind.expectationsGI.year2 !== null ||
            ind.expectationsGI.year3 !== null ||
            ind.expectationsGI.year4 !== null ||
            ind.expectationsGI.year5 !== null;
          if (hasGTExpectation && hasGIExpectation) configured++;
        } else {
          // For always_gt, only GT must be configured
          if (hasGTExpectation) configured++;
        }
      });
    });
    return { total, configured };
  };

  // Loading state
  if (loading || hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="assessment-builder"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Acceso Denegado</h1>
            <p className="text-gray-700 mb-6">No tienes permiso para editar expectativas.</p>
            <Link href="/dashboard" legacyBehavior>
              <a className="px-6 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
                Ir al Panel
              </a>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!template) {
    return (
      <MainLayout
        user={user}
        currentPage="assessment-builder"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={true}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Template no encontrado</h1>
            <Link href="/admin/assessment-builder" legacyBehavior>
              <a className="px-6 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
                Volver a la lista
              </a>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  const isDraft = template.status === 'draft';
  const stats = countConfigured();

  return (
    <MainLayout
      user={user}
      currentPage="assessment-builder"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Target />}
        title="Expectativas por Año"
        subtitle={template.name}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button and info */}
        <div className="flex items-center justify-between mb-6">
          <Link href={`/admin/assessment-builder/${template.id}`} legacyBehavior>
            <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver al template
            </a>
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{stats.configured}</span> de <span className="font-medium">{stats.total}</span> indicadores configurados
            </div>
            {isDraft ? (
              <button
                onClick={handleSaveAll}
                disabled={isSaving || !hasChanges}
                className="inline-flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-brand_blue/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Lock className="w-4 h-4" />
                Solo lectura (publicado)
              </div>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Cómo configurar expectativas:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li><strong>Profundidad (0-4):</strong> Selecciona el nivel de madurez esperado para cada año de transformación</li>
                <li><strong>Cobertura:</strong> Marca si se espera que el indicador esté implementado en ese año</li>
                <li><strong>Frecuencia:</strong> Ingresa el valor mínimo esperado (ej: 4 veces por semestre)</li>
                <li><strong>Tolerancia:</strong> Define cuántos niveles por debajo de lo esperado se considera "en camino" (0-2)</li>
                <li>Deja en blanco (-) si no hay expectativa definida para ese año</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Template info */}
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand_blue">{template.name}</h2>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                <span>Área: {AREA_LABELS[template.area]}</span>
                {template.gradeName && <span>Nivel: {template.gradeName}</span>}
                <span>Versión: {template.version}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  isDraft ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                }`}>
                  {isDraft ? 'Borrador' : 'Publicado'}
                </span>
              </div>
            </div>
          </div>
          {/* Dual expectations info banner */}
          {template.requiresDualExpectations && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 text-sm">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-gray-700">
                  Este nivel requiere <strong>expectativas duales</strong>: configure tanto
                  <span className="inline-flex items-center mx-1">
                    <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-xs font-medium">GT</span>
                  </span>
                  como
                  <span className="inline-flex items-center mx-1">
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium">GI</span>
                  </span>
                  para cada indicador.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Expectations matrix */}
        {moduleExpectations.length === 0 ? (
          <div className="bg-white shadow-md rounded-lg p-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-300" />
            <h4 className="mt-4 text-lg font-medium text-gray-900">Sin indicadores</h4>
            <p className="mt-2 text-sm text-gray-500">
              Agrega módulos e indicadores al template antes de configurar expectativas.
            </p>
            <Link href={`/admin/assessment-builder/${template.id}`} legacyBehavior>
              <a className="mt-4 inline-flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg text-sm font-medium hover:bg-brand_blue/90">
                Ir al editor de template
              </a>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {moduleExpectations.map((module) => (
              <div key={module.moduleId} className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900">
                    {module.moduleOrder}. {module.moduleName}
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3 border-r border-gray-200">
                          Indicador
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16 border-r border-gray-200">
                          Tipo
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_blue uppercase tracking-wider border-r border-gray-200 bg-blue-50">
                          Año 1
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_blue uppercase tracking-wider border-r border-gray-200 bg-blue-50">
                          Año 2
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_blue uppercase tracking-wider border-r border-gray-200 bg-blue-50">
                          Año 3
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_blue uppercase tracking-wider border-r border-gray-200 bg-blue-50">
                          Año 4
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_blue uppercase tracking-wider border-r border-gray-200 bg-blue-50">
                          Año 5
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                          Toler.
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {module.indicators.map((indicator) => {
                        const requiresDual = template?.requiresDualExpectations ?? false;
                        const hasDirtyRows = indicator.isDirtyGT || indicator.isDirtyGI;

                        // Render GT row (always shown)
                        const gtRow = (
                          <tr
                            key={`${indicator.indicatorId}-GT`}
                            className={`hover:bg-gray-50 ${indicator.isDirtyGT ? 'bg-yellow-50' : ''}`}
                          >
                            <td className={`px-4 py-3 border-r border-gray-200 ${requiresDual ? 'border-b-0' : ''}`} rowSpan={requiresDual ? 2 : 1}>
                              <div className="flex items-center gap-2">
                                {hasDirtyRows && (
                                  <span className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0" title="Cambios sin guardar" />
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">
                                    {indicator.indicatorCode && (
                                      <span className="font-mono text-xs bg-gray-100 px-1 rounded mr-2">
                                        {indicator.indicatorCode}
                                      </span>
                                    )}
                                    {indicator.indicatorName}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center border-r border-gray-200">
                              {requiresDual ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                  GT
                                </span>
                              ) : (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  indicator.indicatorCategory === 'cobertura'
                                    ? 'bg-blue-100 text-blue-700'
                                    : indicator.indicatorCategory === 'frecuencia'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {indicator.indicatorCategory === 'cobertura' ? 'Cob' :
                                   indicator.indicatorCategory === 'frecuencia' ? 'Frec' : 'Prof'}
                                </span>
                              )}
                            </td>
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year1', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year2', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year3', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year4', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year5', !isDraft)}
                            <td className="px-2 py-2 text-center">
                              <select
                                value={indicator.expectationsGT.tolerance}
                                onChange={(e) => updateExpectation(
                                  module.moduleId,
                                  indicator.indicatorId,
                                  'GT',
                                  'tolerance',
                                  parseInt(e.target.value, 10)
                                )}
                                disabled={!isDraft}
                                className="w-14 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_blue disabled:bg-gray-100 disabled:opacity-50"
                              >
                                <option value="0">0</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                              </select>
                            </td>
                          </tr>
                        );

                        // Render GI row (only for non-always_gt templates)
                        const giRow = requiresDual && indicator.expectationsGI ? (
                          <tr
                            key={`${indicator.indicatorId}-GI`}
                            className={`hover:bg-gray-50 ${indicator.isDirtyGI ? 'bg-blue-50' : 'bg-gray-50/50'}`}
                          >
                            {/* No indicator name cell - rowSpan from GT row */}
                            <td className="px-2 py-2 text-center border-r border-gray-200">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                GI
                              </span>
                            </td>
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year1', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year2', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year3', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year4', !isDraft)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year5', !isDraft)}
                            <td className="px-2 py-2 text-center">
                              <select
                                value={indicator.expectationsGI.tolerance}
                                onChange={(e) => updateExpectation(
                                  module.moduleId,
                                  indicator.indicatorId,
                                  'GI',
                                  'tolerance',
                                  parseInt(e.target.value, 10)
                                )}
                                disabled={!isDraft}
                                className="w-14 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_blue disabled:bg-gray-100 disabled:opacity-50"
                              >
                                <option value="0">0</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                              </select>
                            </td>
                          </tr>
                        ) : null;

                        return (
                          <React.Fragment key={indicator.indicatorId}>
                            {gtRow}
                            {giRow}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        {moduleExpectations.length > 0 && (
          <div className="mt-6 bg-white shadow-md rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Leyenda:</h4>

            {/* GT/GI Legend for dual expectations templates */}
            {template?.requiresDualExpectations && (
              <div className="mb-3 pb-3 border-b border-gray-200">
                <p className="text-xs text-gray-500 uppercase font-medium mb-2">Tipos de generación:</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">GT</span>
                    <span className="text-gray-600">Generación Tractor (expectativas más altas)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">GI</span>
                    <span className="text-gray-600">Generación Innova (expectativas adaptadas)</span>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 uppercase font-medium mb-2">Tipos de indicador:</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">Cob</span>
                <span className="text-gray-600">Cobertura (Sí/No implementado)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs">Frec</span>
                <span className="text-gray-600">Frecuencia (mínimo esperado por período)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">Prof</span>
                <span className="text-gray-600">Profundidad (niveles 0-4)</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <strong>Tolerancia:</strong> Número de niveles por debajo del esperado que se considera "en camino".
                Por ejemplo, si el esperado es nivel 3 y tolerancia es 1, alcanzar nivel 2 se considera "en camino".
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Unsaved changes warning */}
      {hasChanges && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-300 rounded-lg shadow-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600" />
          <span className="text-sm text-yellow-800">Hay cambios sin guardar</span>
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-3 py-1 bg-yellow-600 text-white rounded text-sm font-medium hover:bg-yellow-700 disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}
    </MainLayout>
  );
};

export default ExpectationsEditor;
