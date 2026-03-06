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
  ChevronDown,
  ChevronUp,
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
  levelDescriptors?: {
    level0?: string;
    level1?: string;
    level2?: string;
    level3?: string;
    level4?: string;
  };
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

// Weight distributor types
interface WeightIndicator {
  id: string;
  name: string;
  category: IndicatorCategory;
  weight: number; // percentage 0-100
}

interface WeightModule {
  id: string;
  name: string;
  weight: number; // percentage 0-100
  indicators: WeightIndicator[];
}

interface WeightObjective {
  id: string;
  name: string;
  weight: number; // percentage 0-100
  modules: WeightModule[];
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Template info
  const [template, setTemplate] = useState<TemplateInfo | null>(null);

  // Expectations data
  const [moduleExpectations, setModuleExpectations] = useState<ModuleExpectations[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Expanded level descriptors state (indicatorId or null)
  const [expandedDescriptors, setExpandedDescriptors] = useState<string | null>(null);

  // Weight distributor state
  const [weightObjectives, setWeightObjectives] = useState<WeightObjective[]>([]);
  const [expandedWeightObjective, setExpandedWeightObjective] = useState<string | null>(null);
  const [expandedWeightModule, setExpandedWeightModule] = useState<string | null>(null);
  const [isWeightDistributorOpen, setIsWeightDistributorOpen] = useState(true);
  const [weightsDirty, setWeightsDirty] = useState(false);
  const [isSavingWeights, setIsSavingWeights] = useState(false);

  // Per-year weight distributor state
  const [selectedWeightYear, setSelectedWeightYear] = useState<number>(1);
  const [yearWeights, setYearWeights] = useState<Record<number, WeightObjective[]>>({
    1: [], 2: [], 3: [], 4: [], 5: [],
  });
  const [weightsDirtyByYear, setWeightsDirtyByYear] = useState<Record<number, boolean>>({
    1: false, 2: false, 3: false, 4: false, 5: false,
  });
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);

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
      const adminRole = roles?.some((r: any) => r.role_type === 'admin') || false;
      setHasPermission(hasAdminAccess);
      setIsAdmin(adminRole);
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
            levelDescriptors: ind.levelDescriptors,
            expectationsGT: gtData,
            expectationsGI: giData,
            isDirtyGT: false,
            isDirtyGI: false,
          };
        }),
      }));

      setModuleExpectations(modules);

      // Load weight distributor data from objectives hierarchy
      const rawObjectives = expectationsData.objectives || [];
      const convertedObjectives: WeightObjective[] = rawObjectives.map((obj: any) => {
        const objMods: WeightModule[] = (obj.modules || []).map((mod: any) => {
          // R1: Include ALL indicator categories (including detalle and traspaso) in weight distribution
          const scoredInds: WeightIndicator[] = (mod.indicators || []).map((ind: any) => ({
            id: ind.indicatorId,
            name: ind.indicatorName,
            category: ind.indicatorCategory,
            weight: ind.indicatorWeight ?? 1,
          }));

          return {
            id: mod.moduleId,
            name: mod.moduleName,
            weight: mod.moduleWeight ?? 1,
            indicators: scoredInds,
          };
        });

        return {
          id: obj.objectiveId,
          name: obj.objectiveName,
          weight: obj.objectiveWeight ?? 1,
          modules: objMods,
        };
      });

      // Convert raw weights to percentages using largest-remainder method
      const toPercent = (items: Array<{ weight: number }>): number[] => {
        if (items.length === 0) return [];
        const total = items.reduce((s, i) => s + i.weight, 0);
        if (total === 0) {
          // Equal distribution with proper rounding
          const base = Math.floor(100 / items.length);
          const remainder = 100 - (base * items.length);
          return items.map((_, i) => base + (i < remainder ? 1 : 0));
        }

        const percentFloats = items.map(i => (i.weight / total) * 100);
        const floored = percentFloats.map(p => Math.floor(p));
        let remainder = 100 - floored.reduce((s, r) => s + r, 0);

        // Distribute remainder to items with largest fractional parts
        const fractional = percentFloats
          .map((p, i) => ({ index: i, frac: p - Math.floor(p) }))
          .sort((a, b) => b.frac - a.frac);

        for (let i = 0; i < remainder; i++) {
          floored[fractional[i].index]++;
        }

        return floored;
      };

      // Apply percentage conversion
      const objTotal = convertedObjectives.reduce((s, o) => s + o.weight, 0);
      const objPercents = objTotal > 0 ? toPercent(convertedObjectives) : convertedObjectives.map(() => Math.round(100 / Math.max(convertedObjectives.length, 1)));
      const weightedObjectives = convertedObjectives.map((obj, i) => {
        const modPercents = obj.modules.length > 0 ? toPercent(obj.modules) : [];
        const modulesWithPercent = obj.modules.map((mod, mi) => {
          const indPercents = mod.indicators.length > 0 ? toPercent(mod.indicators) : [];
          return {
            ...mod,
            weight: modPercents[mi] ?? 100,
            indicators: mod.indicators.map((ind, ii) => ({
              ...ind,
              weight: indPercents[ii] ?? 100,
            })),
          };
        });
        return {
          ...obj,
          weight: objPercents[i] ?? 100,
          modules: modulesWithPercent,
        };
      });

      setWeightObjectives(weightedObjectives);

      // Initialize per-year weight state.
      // For years with explicitly saved weights (from API yearWeights), use those.
      // For unconfigured years, use the default distribution (equal distribution).
      const apiYearWeights = expectationsData.yearWeights as Record<number, {
        objectives: Array<{ id: string; weight: number }>;
        modules: Array<{ id: string; weight: number }>;
        indicators: Array<{ id: string; weight: number }>;
      }> | undefined;

      const initialYearWeights: Record<number, WeightObjective[]> = {
        1: [], 2: [], 3: [], 4: [], 5: [],
      };

      for (let yr = 1; yr <= 5; yr++) {
        const savedForYear = apiYearWeights?.[yr];
        if (savedForYear &&
            (savedForYear.objectives.length > 0 || savedForYear.modules.length > 0 || savedForYear.indicators.length > 0)) {
          // Reconstruct WeightObjective[] from saved data
          const objWeightMap = new Map(savedForYear.objectives.map((o) => [o.id, o.weight]));
          const modWeightMap = new Map(savedForYear.modules.map((m) => [m.id, m.weight]));
          const indWeightMap = new Map(savedForYear.indicators.map((i) => [i.id, i.weight]));

          initialYearWeights[yr] = weightedObjectives.map((obj) => ({
            ...obj,
            weight: objWeightMap.has(obj.id) ? objWeightMap.get(obj.id)! : obj.weight,
            modules: obj.modules.map((mod) => ({
              ...mod,
              weight: modWeightMap.has(mod.id) ? modWeightMap.get(mod.id)! : mod.weight,
              indicators: mod.indicators.map((ind) => ({
                ...ind,
                weight: indWeightMap.has(ind.id) ? indWeightMap.get(ind.id)! : ind.weight,
              })),
            })),
          }));
        } else {
          // Use equal distribution as default for unconfigured years
          initialYearWeights[yr] = weightedObjectives.map((obj) => ({ ...obj }));
        }
      }

      setYearWeights(initialYearWeights);
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

  // Equitable weight distribution helper (largest-remainder method)
  const distributeEquitably = (count: number): number[] => {
    if (count === 0) return [];
    if (count === 1) return [100];
    const base = Math.floor(100 / count);
    const remainder = 100 - (base * count);
    return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
  };

  // Validate that weights sum to 100 within a group
  const weightSum = (items: Array<{ weight: number }>): number =>
    Math.round(items.reduce((s, i) => s + i.weight, 0) * 10) / 10;

  const handleSaveWeights = async () => {
    if (!template) return;

    // Validate all levels sum to 100
    if (weightObjectives.length > 1) {
      const s = weightSum(weightObjectives);
      if (Math.abs(s - 100) > 0.5) {
        toast.error(`Los pesos de los procesos deben sumar 100% (actual: ${s}%)`);
        return;
      }
    }
    for (const obj of weightObjectives) {
      if (obj.modules.length > 1) {
        const s = weightSum(obj.modules);
        if (Math.abs(s - 100) > 0.5) {
          toast.error(`Los pesos de las prácticas de "${obj.name}" deben sumar 100% (actual: ${s}%)`);
          return;
        }
      }
      for (const mod of obj.modules) {
        if (mod.indicators.length > 1) {
          const s = weightSum(mod.indicators);
          if (Math.abs(s - 100) > 0.5) {
            toast.error(`Los pesos de los indicadores de "${mod.name}" deben sumar 100% (actual: ${s}%)`);
            return;
          }
        }
      }
    }

    setIsSavingWeights(true);
    try {
      const weightsPayload = {
        objectives: weightObjectives.map(o => ({ id: o.id, weight: o.weight })),
        modules: weightObjectives.flatMap(o => o.modules.map(m => ({ id: m.id, weight: m.weight }))),
        indicators: weightObjectives.flatMap(o => o.modules.flatMap(m => m.indicators.map(i => ({ id: i.id, weight: i.weight })))),
      };

      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/expectations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: weightsPayload }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al guardar pesos');
      }

      setWeightsDirty(false);
      toast.success('Distribución de pesos guardada');
    } catch (error: any) {
      console.error('Error saving weights:', error);
      toast.error(error.message || 'Error al guardar pesos');
    } finally {
      setIsSavingWeights(false);
    }
  };

  // Save per-year weights for the currently selected year
  const handleSaveYearWeights = async () => {
    if (!template) return;
    const currentYearObjs = yearWeights[selectedWeightYear] || [];

    // Validate
    if (currentYearObjs.length > 1) {
      const s = weightSum(currentYearObjs);
      if (Math.abs(s - 100) > 0.5) {
        toast.error(`Los pesos de los procesos del Año ${selectedWeightYear} deben sumar 100% (actual: ${s}%)`);
        return;
      }
    }
    for (const obj of currentYearObjs) {
      if (obj.modules.length > 1) {
        const s = weightSum(obj.modules);
        if (Math.abs(s - 100) > 0.5) {
          toast.error(`Los pesos de las prácticas de "${obj.name}" (Año ${selectedWeightYear}) deben sumar 100% (actual: ${s}%)`);
          return;
        }
      }
      for (const mod of obj.modules) {
        if (mod.indicators.length > 1) {
          const s = weightSum(mod.indicators);
          if (Math.abs(s - 100) > 0.5) {
            toast.error(`Los pesos de los indicadores de "${mod.name}" (Año ${selectedWeightYear}) deben sumar 100% (actual: ${s}%)`);
            return;
          }
        }
      }
    }

    setIsSavingWeights(true);
    try {
      const yearWeightsPayload = [{
        year: selectedWeightYear,
        objectives: currentYearObjs.map(o => ({ id: o.id, weight: o.weight })),
        modules: currentYearObjs.flatMap(o => o.modules.map(m => ({ id: m.id, weight: m.weight }))),
        indicators: currentYearObjs.flatMap(o => o.modules.flatMap(m => m.indicators.map(i => ({ id: i.id, weight: i.weight })))),
      }];

      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/expectations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearWeights: yearWeightsPayload }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al guardar pesos por año');
      }

      setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: false }));
      toast.success(`Pesos del Año ${selectedWeightYear} guardados`);
    } catch (error: any) {
      console.error('Error saving year weights:', error);
      toast.error(error.message || 'Error al guardar pesos por año');
    } finally {
      setIsSavingWeights(false);
    }
  };

  // Copy weights from another year to the current year
  const handleCopyFromYear = (sourceYear: number) => {
    const sourceWeights = yearWeights[sourceYear];
    if (!sourceWeights || sourceWeights.length === 0) return;

    setYearWeights(prev => ({
      ...prev,
      [selectedWeightYear]: JSON.parse(JSON.stringify(sourceWeights)),
    }));
    setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: true }));
    setShowCopyDropdown(false);
    toast.success(`Pesos copiados del Año ${sourceYear} al Año ${selectedWeightYear}`);
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
            className="h-4 w-4 accent-brand_accent focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 border-gray-300 rounded disabled:opacity-50"
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
              className="w-12 px-1 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:opacity-50"
            />
            <span className="text-xs text-gray-400">/</span>
            <select
              value={unitValue || availableUnits[0]}
              onChange={(e) => {
                updateExpectation(moduleId, indicator.indicatorId, generationType, unitKey, e.target.value as FrequencyUnit);
              }}
              disabled={disabled}
              className="w-16 px-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:opacity-50"
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

    // For traspaso indicators, show checkbox (same as cobertura — expected yes/no per year)
    if (indicator.indicatorCategory === 'traspaso') {
      return (
        <td key={`${yearKey}-${generationType}`} className="px-2 py-2 text-center border-r border-gray-200">
          <input
            type="checkbox"
            checked={value === 1}
            onChange={(e) => updateExpectation(moduleId, indicator.indicatorId, generationType, yearKey, e.target.checked ? 1 : null)}
            disabled={disabled}
            className="h-4 w-4 accent-brand_accent focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 border-gray-300 rounded disabled:opacity-50"
          />
        </td>
      );
    }

    // For detalle indicators, show checkbox (expected yes/no per year — same as cobertura/traspaso)
    if (indicator.indicatorCategory === 'detalle') {
      return (
        <td key={`${yearKey}-${generationType}`} className="px-2 py-2 text-center border-r border-gray-200">
          <input
            type="checkbox"
            checked={value === 1}
            onChange={(e) => updateExpectation(moduleId, indicator.indicatorId, generationType, yearKey, e.target.checked ? 1 : null)}
            disabled={disabled}
            className="h-4 w-4 text-brand_accent accent-brand_accent focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 border-gray-300 rounded disabled:opacity-50"
          />
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
          className="w-14 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:opacity-50"
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
      <div className="min-h-screen bg-brand_light flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
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
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">Acceso Denegado</h1>
            <p className="text-gray-700 mb-6">No tienes permiso para editar expectativas.</p>
            <Link href="/dashboard" legacyBehavior>
              <a className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
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
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">Template no encontrado</h1>
            <Link href="/admin/assessment-builder" legacyBehavior>
              <a className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
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
        title="Calibración"
        subtitle={template.name}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button and info */}
        <div className="flex items-center justify-between mb-6">
          <Link href={`/admin/assessment-builder/${template.id}`} legacyBehavior>
            <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_primary">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver al template
            </a>
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{stats.configured}</span> de <span className="font-medium">{stats.total}</span> indicadores configurados
            </div>
            {isDraft && isAdmin ? (
              <button
                onClick={handleSaveAll}
                disabled={isSaving || !hasChanges}
                className="inline-flex items-center px-4 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-brand_primary/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Lock className="w-4 h-4" />
                {!isAdmin ? 'Solo lectura (consultor)' : 'Solo lectura (publicado)'}
              </div>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="bg-brand_light border border-brand_accent rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-brand_accent flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-800">
              <p className="font-medium mb-1">Cómo calibrar el template:</p>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                <li><strong>Profundidad (0-4):</strong> Selecciona el nivel de madurez esperado para cada año de transformación</li>
                <li><strong>Cobertura:</strong> Marca si se espera que el indicador esté implementado en ese año</li>
                <li><strong>Frecuencia:</strong> Ingresa el valor mínimo esperado (ej: 4 veces por semestre)</li>
                <li><strong>Traspaso:</strong> Marca si se espera que el evaluador adjunte evidencia y sugerencias de mejora ese año</li>
                <li><strong>Detalle:</strong> Marca si se espera que el evaluador responda la selección múltiple ese año</li>
                <li><strong>Tolerancia:</strong> Define cuántos niveles por debajo de lo esperado se considera &quot;en camino&quot; (0-2)</li>
                <li>Deja en blanco (-) si no hay expectativa definida para ese año</li>
                <li><strong>Pesos:</strong> Distribuye la importancia relativa (%) de cada proceso, práctica e indicador. Deben sumar 100% en cada nivel.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Template info */}
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-brand_primary">{template.name}</h2>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                <span>Área: {AREA_LABELS[template.area]}</span>
                {template.gradeName && <span>Nivel: {template.gradeName}</span>}
                <span>Versión: {template.version}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  isDraft ? 'bg-brand_accent_light text-brand_primary' : 'bg-brand_accent text-brand_primary'
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
                <Info className="w-4 h-4 text-brand_accent" />
                <span className="text-gray-700">
                  Este nivel requiere <strong>expectativas duales</strong>: configure tanto
                  <span className="inline-flex items-center mx-1">
                    <span className="px-1.5 py-0.5 rounded bg-brand_accent_light text-brand_gray_dark text-xs font-medium">GT</span>
                  </span>
                  como
                  <span className="inline-flex items-center mx-1">
                    <span className="px-1.5 py-0.5 rounded bg-brand_light text-brand_primary text-xs font-medium">GI</span>
                  </span>
                  para cada indicador.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Weight Distributor Section */}
        {weightObjectives.length > 0 && (
          <div className="mb-6 bg-white shadow-md rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setIsWeightDistributorOpen(prev => !prev)}
                className="flex items-center gap-2 flex-1 text-left"
                aria-expanded={isWeightDistributorOpen}
                aria-controls="weight-distributor-panel"
              >
                <span className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
                  Distribución de Pesos
                </span>
                {Object.values(weightsDirtyByYear).some(Boolean) && (
                  <span className="w-2 h-2 bg-brand_accent rounded-full" title="Cambios sin guardar" aria-label="Cambios sin guardar" />
                )}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWeightDistributorOpen(prev => !prev)}
                  className="p-1 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-1 rounded"
                  aria-label={isWeightDistributorOpen ? 'Cerrar distribución de pesos' : 'Abrir distribución de pesos'}
                >
                  {isWeightDistributorOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
            </div>

            {isWeightDistributorOpen && (
              <div id="year-weight-panel" role="tabpanel" aria-labelledby={`year-tab-${selectedWeightYear}`} className="p-4 space-y-4">
                {/* Year Tab Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1" role="tablist" aria-label="Año de transformación">
                    {[1, 2, 3, 4, 5].map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        role="tab"
                        id={`year-tab-${yr}`}
                        aria-selected={selectedWeightYear === yr}
                        aria-controls="year-weight-panel"
                        onClick={() => setSelectedWeightYear(yr)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors relative focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 ${
                          selectedWeightYear === yr
                            ? 'bg-brand_accent text-brand_primary'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Año {yr}
                        {weightsDirtyByYear[yr] && (
                          <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-white ${selectedWeightYear === yr ? 'bg-brand_primary' : 'bg-brand_accent'}`} title="Cambios sin guardar" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Copy from year dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowCopyDropdown(prev => !prev)}
                        className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-1"
                        disabled={!isDraft || !isAdmin}
                      >
                        Copiar de...
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showCopyDropdown && (
                        <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded shadow-lg z-10 min-w-28">
                          {[1, 2, 3, 4, 5]
                            .filter((yr) => yr !== selectedWeightYear)
                            .map((yr) => (
                              <button
                                key={yr}
                                type="button"
                                onClick={() => handleCopyFromYear(yr)}
                                className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-1"
                              >
                                Año {yr}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    {isDraft && isAdmin && weightsDirtyByYear[selectedWeightYear] && (
                      <button
                        type="button"
                        onClick={() => handleSaveYearWeights()}
                        disabled={isSavingWeights}
                        className="px-3 py-1 bg-brand_primary text-white text-xs rounded-md hover:bg-brand_primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
                      >
                        {isSavingWeights ? 'Guardando...' : `Guardar Año ${selectedWeightYear}`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Unsaved changes bar for current year */}
                {weightsDirtyByYear[selectedWeightYear] && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-brand_accent_light text-brand_primary border border-brand_accent rounded text-xs">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Cambios sin guardar para Año {selectedWeightYear}</span>
                  </div>
                )}

                {/* Level 1: Objectives (for selected year) */}
                <div>
                  {(() => {
                    const currentYearObjs = yearWeights[selectedWeightYear] || [];
                    return (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-700">Procesos Generativos</h4>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-semibold ${Math.abs(weightSum(currentYearObjs) - 100) <= 0.5 ? 'text-brand_accent_hover' : 'text-brand_primary font-bold'}`}>
                              Total: {weightSum(currentYearObjs)}%
                            </span>
                            {isDraft && isAdmin && currentYearObjs.length > 1 && (
                              <button
                                onClick={() => {
                                  const percents = distributeEquitably(currentYearObjs.length);
                                  setYearWeights(prev => ({
                                    ...prev,
                                    [selectedWeightYear]: (prev[selectedWeightYear] || []).map((o, i) => ({ ...o, weight: percents[i] })),
                                  }));
                                  setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: true }));
                                }}
                                className="text-xs text-brand_primary hover:underline"
                              >
                                Distribuir equitativamente
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {currentYearObjs.map((obj) => (
                            <div key={obj.id} className="border border-gray-200 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                className="w-full flex items-center gap-3 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 text-left"
                                onClick={() => setExpandedWeightObjective(prev => prev === obj.id ? null : obj.id)}
                                aria-expanded={expandedWeightObjective === obj.id}
                              >
                                <div className="flex-1 flex items-center gap-2">
                                  {expandedWeightObjective === obj.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                  <span className="text-sm text-gray-800">{obj.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={obj.weight}
                                    disabled={!isDraft || !isAdmin || currentYearObjs.length === 1}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                      setYearWeights(prev => ({
                                        ...prev,
                                        [selectedWeightYear]: (prev[selectedWeightYear] || []).map(o => o.id === obj.id ? { ...o, weight: val } : o),
                                      }));
                                      setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: true }));
                                    }}
                                    aria-label={`Peso de ${obj.name} (%) Año ${selectedWeightYear}`}
                                    className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:text-gray-500"
                                  />
                                  <span className="text-xs text-gray-500">%</span>
                                </div>
                              </button>

                              {/* Level 2: Modules */}
                              {expandedWeightObjective === obj.id && obj.modules.length > 0 && (
                                <div className="p-3 space-y-2 border-t border-gray-100">
                                  <div className="flex items-center justify-between mb-1">
                                    <h5 className="text-xs font-medium text-gray-600 uppercase">Practicas Generativas</h5>
                                    <div className="flex items-center gap-3">
                                      <span className={`text-xs font-semibold ${Math.abs(weightSum(obj.modules) - 100) <= 0.5 ? 'text-brand_accent_hover' : 'text-brand_primary font-bold'}`}>
                                        Total: {weightSum(obj.modules)}%
                                      </span>
                                      {isDraft && isAdmin && obj.modules.length > 1 && (
                                        <button
                                          onClick={() => {
                                            const percents = distributeEquitably(obj.modules.length);
                                            setYearWeights(prev => ({
                                              ...prev,
                                              [selectedWeightYear]: (prev[selectedWeightYear] || []).map(o => o.id === obj.id
                                                ? { ...o, modules: o.modules.map((m, mi) => ({ ...m, weight: percents[mi] })) }
                                                : o
                                              ),
                                            }));
                                            setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: true }));
                                          }}
                                          className="text-xs text-brand_primary hover:underline"
                                        >
                                          Distribuir equitativamente
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {obj.modules.map((mod) => (
                                    <div key={mod.id} className="border border-gray-100 rounded overflow-hidden">
                                      <button
                                        type="button"
                                        className="w-full flex items-center gap-3 px-3 py-2 bg-white cursor-pointer hover:bg-gray-50 text-left"
                                        onClick={() => setExpandedWeightModule(prev => prev === mod.id ? null : mod.id)}
                                        aria-expanded={expandedWeightModule === mod.id}
                                      >
                                        <div className="flex-1 flex items-center gap-2">
                                          {expandedWeightModule === mod.id ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                                          <span className="text-sm text-gray-700">{mod.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="1"
                                            value={mod.weight}
                                            disabled={!isDraft || !isAdmin || obj.modules.length === 1}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                              const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                              setYearWeights(prev => ({
                                                ...prev,
                                                [selectedWeightYear]: (prev[selectedWeightYear] || []).map(o => o.id === obj.id
                                                  ? { ...o, modules: o.modules.map(m => m.id === mod.id ? { ...m, weight: val } : m) }
                                                  : o
                                                ),
                                              }));
                                              setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: true }));
                                            }}
                                            aria-label={`Peso de ${mod.name} (%) Año ${selectedWeightYear}`}
                                            className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:text-gray-500"
                                          />
                                          <span className="text-xs text-gray-500">%</span>
                                        </div>
                                      </button>

                                      {/* Level 3: Indicators */}
                                      {expandedWeightModule === mod.id && mod.indicators.length > 0 && (
                                        <div className="px-3 pb-2 border-t border-gray-100">
                                          <div className="flex items-center justify-between my-1">
                                            <h6 className="text-xs font-medium text-gray-500 uppercase">Indicadores</h6>
                                            <div className="flex items-center gap-3">
                                              <span className={`text-xs font-semibold ${Math.abs(weightSum(mod.indicators) - 100) <= 0.5 ? 'text-brand_accent_hover' : 'text-brand_primary font-bold'}`}>
                                                Total: {weightSum(mod.indicators)}%
                                              </span>
                                              {isDraft && isAdmin && mod.indicators.length > 1 && (
                                                <button
                                                  onClick={() => {
                                                    const percents = distributeEquitably(mod.indicators.length);
                                                    setYearWeights(prev => ({
                                                      ...prev,
                                                      [selectedWeightYear]: (prev[selectedWeightYear] || []).map(o => o.id === obj.id
                                                        ? {
                                                            ...o, modules: o.modules.map(m => m.id === mod.id
                                                              ? { ...m, indicators: m.indicators.map((ind, ii) => ({ ...ind, weight: percents[ii] })) }
                                                              : m
                                                            )
                                                          }
                                                        : o
                                                      ),
                                                    }));
                                                    setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: true }));
                                                  }}
                                                  className="text-xs text-brand_primary hover:underline"
                                                >
                                                  Distribuir equitativamente
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          {mod.indicators.map((ind) => {
                                            // Check if this indicator has an expectation for selected year
                                            const hasExpectation = moduleExpectations.some(m =>
                                              m.indicators.some(i => {
                                                if (i.indicatorId !== ind.id) return false;
                                                const yearKey = `year${selectedWeightYear}` as 'year1' | 'year2' | 'year3' | 'year4' | 'year5';
                                                return i.expectationsGT[yearKey] !== null;
                                              })
                                            );
                                            const isInactive = !hasExpectation;

                                            return (
                                              <div
                                                key={ind.id}
                                                className={`flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0 ${isInactive ? 'opacity-50' : ''}`}
                                                title={isInactive ? `Sin expectativa para Año ${selectedWeightYear} — no participará en la evaluación` : undefined}
                                              >
                                                <div className="flex-1 flex items-center gap-2 min-w-0">
                                                  {/* Brand-compliant category badge */}
                                                  <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                                    ind.category === 'cobertura'
                                                      ? 'bg-brand_accent text-brand_primary'
                                                      : ind.category === 'frecuencia'
                                                      ? 'bg-brand_accent_light text-brand_gray_dark'
                                                      : ind.category === 'traspaso'
                                                      ? 'bg-gray-200 text-brand_gray_dark'
                                                      : ind.category === 'detalle'
                                                      ? 'bg-gray-100 text-brand_gray_medium border border-gray-300'
                                                      : 'bg-brand_primary text-white'
                                                  }`}>
                                                    {ind.category === 'cobertura' ? 'Cob' :
                                                     ind.category === 'frecuencia' ? 'Frec' :
                                                     ind.category === 'traspaso' ? 'Tras' :
                                                     ind.category === 'detalle' ? 'Det' : 'Prof'}
                                                  </span>
                                                  <span className="text-sm text-gray-700 truncate">{ind.name}</span>
                                                  {isInactive && (
                                                    <span className="text-xs text-gray-400 italic flex-shrink-0">(sin expectativa)</span>
                                                  )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="1"
                                                    value={ind.weight}
                                                    disabled={!isDraft || !isAdmin || mod.indicators.length === 1}
                                                    onChange={(e) => {
                                                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                                                      setYearWeights(prev => ({
                                                        ...prev,
                                                        [selectedWeightYear]: (prev[selectedWeightYear] || []).map(o => o.id === obj.id
                                                          ? {
                                                              ...o, modules: o.modules.map(m => m.id === mod.id
                                                                ? { ...m, indicators: m.indicators.map(i => i.id === ind.id ? { ...i, weight: val } : i) }
                                                                : m
                                                              )
                                                            }
                                                          : o
                                                        ),
                                                      }));
                                                      setWeightsDirtyByYear(prev => ({ ...prev, [selectedWeightYear]: true }));
                                                    }}
                                                    aria-label={`Peso de ${ind.name} (%) Año ${selectedWeightYear}`}
                                                    className="w-16 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:text-gray-500"
                                                  />
                                                  <span className="text-xs text-gray-500">%</span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expectations matrix */}
        {moduleExpectations.length === 0 ? (
          <div className="bg-white shadow-md rounded-lg p-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-300" />
            <h4 className="mt-4 text-lg font-medium text-gray-900">Sin indicadores</h4>
            <p className="mt-2 text-sm text-gray-500">
              Agrega módulos e indicadores al template antes de configurar expectativas.
            </p>
            <Link href={`/admin/assessment-builder/${template.id}`} legacyBehavior>
              <a className="mt-4 inline-flex items-center px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_primary/90">
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
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_primary uppercase tracking-wider border-r border-gray-200 bg-brand_light">
                          Año 1
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_primary uppercase tracking-wider border-r border-gray-200 bg-brand_light">
                          Año 2
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_primary uppercase tracking-wider border-r border-gray-200 bg-brand_light">
                          Año 3
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_primary uppercase tracking-wider border-r border-gray-200 bg-brand_light">
                          Año 4
                        </th>
                        <th className="px-2 py-3 text-center text-xs font-medium text-brand_primary uppercase tracking-wider border-r border-gray-200 bg-brand_light">
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
                            className={`hover:bg-gray-50 ${indicator.isDirtyGT ? 'bg-brand_accent_light/30' : ''}`}
                          >
                            <td className={`px-4 py-3 border-r border-gray-200 ${requiresDual ? 'border-b-0' : ''}`} rowSpan={requiresDual ? 2 : 1}>
                              <div className="flex items-center gap-2">
                                {hasDirtyRows && (
                                  <span className="w-2 h-2 bg-brand_accent rounded-full flex-shrink-0" title="Cambios sin guardar" />
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                                    {indicator.indicatorCode && (
                                      <span className="font-mono text-xs bg-gray-100 px-1 rounded mr-1">
                                        {indicator.indicatorCode}
                                      </span>
                                    )}
                                    <span className="truncate">{indicator.indicatorName}</span>
                                    {indicator.indicatorCategory === 'profundidad' && indicator.levelDescriptors && (
                                      <button
                                        onClick={() => setExpandedDescriptors(prev => prev === indicator.indicatorId ? null : indicator.indicatorId)}
                                        className="ml-1 text-gray-400 hover:text-brand_primary flex-shrink-0"
                                        aria-label={`Ver descriptores de nivel para ${indicator.indicatorName}`}
                                        aria-expanded={expandedDescriptors === indicator.indicatorId}
                                      >
                                        <Info className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  {expandedDescriptors === indicator.indicatorId && indicator.levelDescriptors && (
                                    <div className="mt-2 text-xs bg-gray-50 border-l-4 border-brand_accent p-2 rounded space-y-1">
                                      {(['level0', 'level1', 'level2', 'level3', 'level4'] as const).map((key, level) => {
                                        const desc = indicator.levelDescriptors?.[key];
                                        return desc ? (
                                          <div key={key} className="flex gap-2">
                                            <span className="font-semibold text-brand_primary w-4">{level}</span>
                                            <span className="text-gray-700">{desc}</span>
                                          </div>
                                        ) : null;
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center border-r border-gray-200">
                              {requiresDual ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-brand_accent_light text-brand_gray_dark font-medium">
                                  GT
                                </span>
                              ) : (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  indicator.indicatorCategory === 'cobertura'
                                    ? 'bg-brand_accent text-brand_primary'
                                    : indicator.indicatorCategory === 'frecuencia'
                                    ? 'bg-brand_accent_light text-brand_gray_dark'
                                    : indicator.indicatorCategory === 'traspaso'
                                    ? 'bg-gray-200 text-brand_gray_dark'
                                    : indicator.indicatorCategory === 'detalle'
                                    ? 'bg-gray-100 text-brand_gray_medium border border-gray-300'
                                    : 'bg-brand_primary text-white'
                                }`}>
                                  {indicator.indicatorCategory === 'cobertura' ? 'Cob' :
                                   indicator.indicatorCategory === 'frecuencia' ? 'Frec' :
                                   indicator.indicatorCategory === 'traspaso' ? 'Tras' :
                                   indicator.indicatorCategory === 'detalle' ? 'Det' : 'Prof'}
                                </span>
                              )}
                            </td>
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year1', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year2', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year3', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year4', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GT', 'year5', !isDraft || !isAdmin)}
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
                                disabled={!isDraft || !isAdmin}
                                className="w-14 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:opacity-50"
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
                            className={`hover:bg-gray-50 ${indicator.isDirtyGI ? 'bg-brand_light' : 'bg-gray-50/50'}`}
                          >
                            {/* No indicator name cell - rowSpan from GT row */}
                            <td className="px-2 py-2 text-center border-r border-gray-200">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-brand_light text-brand_primary font-medium">
                                GI
                              </span>
                            </td>
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year1', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year2', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year3', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year4', !isDraft || !isAdmin)}
                            {renderYearCell(module.moduleId, indicator, 'GI', 'year5', !isDraft || !isAdmin)}
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
                                disabled={!isDraft || !isAdmin}
                                className="w-14 px-1 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand_primary disabled:bg-gray-100 disabled:opacity-50"
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
                    <span className="px-2 py-0.5 rounded-full bg-brand_accent_light text-brand_gray_dark text-xs font-medium">GT</span>
                    <span className="text-gray-600">Generacion Tractor (expectativas mas altas)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-brand_light text-brand_primary text-xs font-medium">GI</span>
                    <span className="text-gray-600">Generacion Innova (expectativas adaptadas)</span>
                  </div>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 uppercase font-medium mb-2">Tipos de indicador:</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-brand_accent text-brand_primary text-xs font-medium">Cob</span>
                <span className="text-gray-600">Cobertura (Si/No implementado)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-brand_accent_light text-brand_gray_dark text-xs font-medium">Frec</span>
                <span className="text-gray-600">Frecuencia (minimo esperado por periodo)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-brand_primary text-white text-xs font-medium">Prof</span>
                <span className="text-gray-600">Profundidad (niveles 0-4)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-brand_gray_dark text-xs font-medium">Tras</span>
                <span className="text-gray-600">Traspaso (Se espera evidencia y mejoras ese ano)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-brand_gray_medium border border-gray-300 text-xs font-medium">Det</span>
                <span className="text-gray-600">Detalle (Se espera que el evaluador complete la seleccion multiple ese ano)</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <strong>Tolerancia:</strong> Número de niveles por debajo del esperado que se considera &quot;en camino&quot;.
                Por ejemplo, si el esperado es nivel 3 y tolerancia es 1, alcanzar nivel 2 se considera &quot;en camino&quot;.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Unsaved changes warning (admin only) */}
      {hasChanges && isAdmin && (
        <div className="fixed bottom-4 right-4 bg-brand_accent_light border border-brand_accent rounded-lg shadow-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-brand_primary" />
          <span className="text-sm text-brand_primary">Hay cambios sin guardar</span>
          <button
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-3 py-1 bg-brand_primary text-white rounded text-sm font-medium hover:bg-brand_primary/90 disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      )}
    </MainLayout>
  );
};

export default ExpectationsEditor;
