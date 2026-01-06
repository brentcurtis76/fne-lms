import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ClipboardCheck,
  ArrowLeft,
  Save,
  Send,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AREA_LABELS,
  MATURITY_LEVELS,
  CATEGORY_LABELS,
  FREQUENCY_UNIT_LABELS,
  TransformationArea,
  IndicatorCategory,
  FrequencyUnit,
} from '@/types/assessment-builder';

interface IndicatorData {
  id: string;
  code?: string;
  name: string;
  description?: string;
  category: IndicatorCategory;
  frequencyConfig?: {
    type: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  };
  frequencyUnitOptions?: FrequencyUnit[];
  level0Descriptor?: string;
  level1Descriptor?: string;
  level2Descriptor?: string;
  level3Descriptor?: string;
  level4Descriptor?: string;
  displayOrder: number;
  weight: number;
}

interface ModuleData {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  displayOrder: number;
  weight: number;
  indicators: IndicatorData[];
}

interface ResponseData {
  id?: string;
  coverageValue?: boolean;
  frequencyValue?: number;
  frequencyUnit?: FrequencyUnit;
  profundityLevel?: number;
  rationale?: string;
  evidenceNotes?: string;
}

const AssessmentResponseForm: React.FC = () => {
  const router = useRouter();
  const { instanceId } = router.query;
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Assessment data
  const [instance, setInstance] = useState<any>(null);
  const [template, setTemplate] = useState<any>(null);
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [responses, setResponses] = useState<Record<string, ResponseData>>({});
  const [progress, setProgress] = useState({ total: 0, answered: 0, percentage: 0 });
  const [assignee, setAssignee] = useState<any>(null);

  // UI state
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Debounce timer for auto-save
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check auth
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
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch assessment data
  const fetchAssessment = useCallback(async () => {
    if (!user || !instanceId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/docente/assessments/${instanceId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar la evaluación');
      }

      const data = await response.json();
      setInstance(data.instance);
      setTemplate(data.template);
      setModules(data.modules || []);
      setResponses(data.responses || {});
      setProgress(data.progress || { total: 0, answered: 0, percentage: 0 });
      setAssignee(data.assignee);

      // Expand first module by default
      if (data.modules?.length > 0) {
        setExpandedModules(new Set([data.modules[0].id]));
      }
    } catch (error: any) {
      console.error('Error fetching assessment:', error);
      toast.error(error.message || 'Error al cargar la evaluación');
      router.push('/docente/assessments');
    } finally {
      setLoading(false);
    }
  }, [user, instanceId, router]);

  useEffect(() => {
    if (user && instanceId) {
      fetchAssessment();
    }
  }, [user, instanceId, fetchAssessment]);

  // Update progress whenever responses change
  useEffect(() => {
    if (modules.length > 0) {
      // Recalculate progress based on current responses
      let total = 0;
      let answered = 0;

      modules.forEach(module => {
        module.indicators.forEach(indicator => {
          total++;
          const resp = responses[indicator.id];
          if (resp) {
            const hasValue =
              (indicator.category === 'cobertura' && resp.coverageValue !== undefined && resp.coverageValue !== null) ||
              (indicator.category === 'frecuencia' && resp.frequencyValue !== undefined && resp.frequencyValue !== null) ||
              (indicator.category === 'profundidad' && resp.profundityLevel !== undefined && resp.profundityLevel !== null);
            if (hasValue) answered++;
          }
        });
      });

      setProgress({
        total,
        answered,
        percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
      });
    }
  }, [responses, modules]);

  // Toggle module expansion
  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Handle response change
  const handleResponseChange = (indicatorId: string, field: keyof ResponseData, value: any) => {
    setResponses(prev => ({
      ...prev,
      [indicatorId]: {
        ...prev[indicatorId],
        [field]: value,
      },
    }));
    setHasUnsavedChanges(true);

    // Debounced auto-save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveResponses([indicatorId]);
    }, 2000);
  };

  // Save responses - uses ref to avoid stale closure issues
  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const saveResponses = async (indicatorIds?: string[]) => {
    if (!instanceId) return;

    // Use ref to get current responses (avoids stale closure)
    const currentResponses = responsesRef.current;

    // Build array of responses to save
    const idsToSave = indicatorIds || Object.keys(currentResponses);
    const responsesToSave = idsToSave
      .filter(id => currentResponses[id])
      .map(id => ({
        indicator_id: id,
        coverage_value: currentResponses[id].coverageValue,
        frequency_value: currentResponses[id].frequencyValue,
        frequency_unit: currentResponses[id].frequencyUnit,
        profundity_level: currentResponses[id].profundityLevel,
        rationale: currentResponses[id].rationale,
        evidence_notes: currentResponses[id].evidenceNotes,
      }));

    if (responsesToSave.length === 0) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/docente/assessments/${instanceId}/responses`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: responsesToSave }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar');
      }

      setHasUnsavedChanges(false);

      // Update progress
      updateProgress();
    } catch (error: any) {
      console.error('Error saving responses:', error);
      toast.error(error.message || 'Error al guardar respuestas');
    } finally {
      setSaving(false);
    }
  };

  // Calculate progress - uses ref to avoid stale closure issues
  const updateProgress = () => {
    const currentResponses = responsesRef.current;
    let total = 0;
    let answered = 0;

    modules.forEach(module => {
      module.indicators.forEach(indicator => {
        total++;
        const resp = currentResponses[indicator.id];
        if (resp) {
          const hasValue =
            (indicator.category === 'cobertura' && resp.coverageValue !== undefined && resp.coverageValue !== null) ||
            (indicator.category === 'frecuencia' && resp.frequencyValue !== undefined && resp.frequencyValue !== null) ||
            (indicator.category === 'profundidad' && resp.profundityLevel !== undefined && resp.profundityLevel !== null);
          if (hasValue) answered++;
        }
      });
    });

    setProgress({
      total,
      answered,
      percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
    });
  };

  // Submit assessment
  const handleSubmit = async () => {
    if (!instanceId) return;

    // First save any pending changes (use ref to get current responses)
    await saveResponses(Object.keys(responsesRef.current));

    setSubmitting(true);
    try {
      const response = await fetch(`/api/docente/assessments/${instanceId}/submit`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.missingCount) {
          toast.error(`Faltan ${data.missingCount} respuestas por completar`);
        } else {
          throw new Error(data.error || 'Error al enviar');
        }
        return;
      }

      toast.success('Evaluación enviada correctamente');
      // Redirect to results page after successful submission
      router.push(`/docente/assessments/${instanceId}/results`);
    } catch (error: any) {
      console.error('Error submitting:', error);
      toast.error(error.message || 'Error al enviar la evaluación');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Loading state
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  const isCompleted = instance?.status === 'completed';
  const canEdit = assignee?.canEdit && !isCompleted;

  return (
    <MainLayout
      user={user}
      currentPage="assessments"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={false}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardCheck />}
        title={template?.name || 'Evaluación'}
        subtitle={AREA_LABELS[template?.area as TransformationArea] || 'Evaluación'}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button and actions */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/docente/assessments" legacyBehavior>
            <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver a evaluaciones
            </a>
          </Link>

          <div className="flex items-center gap-3">
            {saving && (
              <span className="text-sm text-gray-500 flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Guardando...
              </span>
            )}
            {!isCompleted && (
              <>
                <button
                  onClick={() => saveResponses(Object.keys(responses))}
                  disabled={saving || !hasUnsavedChanges}
                  className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Guardar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || progress.percentage < 100}
                  className="inline-flex items-center px-4 py-1.5 text-sm bg-brand_blue text-white rounded-lg hover:bg-brand_blue/90 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1" />
                      Enviar
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white shadow-md rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progreso</span>
            <span className="text-sm text-gray-500">
              {progress.answered} de {progress.total} indicadores ({progress.percentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                progress.percentage === 100 ? 'bg-green-500' : 'bg-brand_blue'
              }`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          {isCompleted && (
            <div className="mt-3 flex items-center text-green-600">
              <CheckCircle className="w-4 h-4 mr-2" />
              <span className="text-sm font-medium">Evaluación completada</span>
            </div>
          )}
        </div>

        {/* Modules */}
        <div className="space-y-4">
          {modules.map((module) => (
            <div key={module.id} className="bg-white shadow-md rounded-lg overflow-hidden">
              {/* Module header */}
              <button
                onClick={() => toggleModule(module.id)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div>
                  <h3 className="text-lg font-semibold text-brand_blue">{module.name}</h3>
                  {module.description && (
                    <p className="text-sm text-gray-500 mt-1">{module.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {module.indicators.length} indicador{module.indicators.length !== 1 ? 'es' : ''}
                  </p>
                </div>
                {expandedModules.has(module.id) ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Module instructions */}
              {expandedModules.has(module.id) && module.instructions && (
                <div className="px-4 pb-4 pt-0">
                  <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
                    {module.instructions}
                  </div>
                </div>
              )}

              {/* Indicators */}
              {expandedModules.has(module.id) && (
                <div className="border-t border-gray-200 divide-y divide-gray-100">
                  {module.indicators.map((indicator) => (
                    <IndicatorInput
                      key={indicator.id}
                      indicator={indicator}
                      response={responses[indicator.id] || {}}
                      onChange={(field, value) => handleResponseChange(indicator.id, field, value)}
                      disabled={!canEdit}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
};

interface IndicatorInputProps {
  indicator: IndicatorData;
  response: ResponseData;
  onChange: (field: keyof ResponseData, value: any) => void;
  disabled?: boolean;
}

const IndicatorInput: React.FC<IndicatorInputProps> = ({
  indicator,
  response,
  onChange,
  disabled,
}) => {
  const hasResponse =
    (indicator.category === 'cobertura' && response.coverageValue !== undefined && response.coverageValue !== null) ||
    (indicator.category === 'frecuencia' && response.frequencyValue !== undefined && response.frequencyValue !== null) ||
    (indicator.category === 'profundidad' && response.profundityLevel !== undefined && response.profundityLevel !== null);

  return (
    <div className={`p-4 ${hasResponse ? 'bg-green-50/50' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        {hasResponse && (
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {indicator.code && (
              <span className="text-xs font-mono bg-gray-200 px-1.5 py-0.5 rounded">
                {indicator.code}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {CATEGORY_LABELS[indicator.category]}
            </span>
          </div>
          <h4 className="font-medium text-gray-900">{indicator.name}</h4>
          {indicator.description && (
            <p className="text-sm text-gray-500 mt-1">{indicator.description}</p>
          )}
        </div>
      </div>

      {/* Input based on category */}
      <div className="ml-8">
        {indicator.category === 'cobertura' && (
          <CoberturaInput
            value={response.coverageValue}
            onChange={(v) => onChange('coverageValue', v)}
            disabled={disabled}
          />
        )}

        {indicator.category === 'frecuencia' && (
          <FrecuenciaInput
            value={response.frequencyValue}
            unit={response.frequencyUnit}
            config={indicator.frequencyConfig}
            unitOptions={indicator.frequencyUnitOptions}
            onValueChange={(v) => onChange('frequencyValue', v)}
            onUnitChange={(u) => onChange('frequencyUnit', u)}
            disabled={disabled}
          />
        )}

        {indicator.category === 'profundidad' && (
          <ProfundidadInput
            value={response.profundityLevel}
            descriptors={{
              0: indicator.level0Descriptor,
              1: indicator.level1Descriptor,
              2: indicator.level2Descriptor,
              3: indicator.level3Descriptor,
              4: indicator.level4Descriptor,
            }}
            onChange={(v) => onChange('profundityLevel', v)}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
};

// Cobertura input (Yes/No toggle)
const CoberturaInput: React.FC<{
  value?: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => (
  <div className="flex gap-3">
    <button
      type="button"
      onClick={() => onChange(true)}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        value === true
          ? 'bg-green-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      Sí
    </button>
    <button
      type="button"
      onClick={() => onChange(false)}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        value === false
          ? 'bg-red-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      No
    </button>
  </div>
);

// Frecuencia input (number with unit dropdown)
const FrecuenciaInput: React.FC<{
  value?: number;
  unit?: FrequencyUnit;
  config?: {
    type: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
  };
  unitOptions?: FrequencyUnit[];
  onValueChange: (value: number) => void;
  onUnitChange: (unit: FrequencyUnit) => void;
  disabled?: boolean;
}> = ({ value, unit, config, unitOptions, onValueChange, onUnitChange, disabled }) => {
  // Default to all options if none specified
  const availableUnits: FrequencyUnit[] = unitOptions && unitOptions.length > 0
    ? unitOptions
    : ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año'];

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onValueChange(parseFloat(e.target.value))}
        min={config?.min ?? 0}
        max={config?.max}
        step={config?.step ?? 1}
        disabled={disabled}
        className={`w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''
        }`}
        placeholder="0"
      />
      <span className="text-sm text-gray-500">veces por</span>
      <select
        value={unit || availableUnits[0]}
        onChange={(e) => onUnitChange(e.target.value as FrequencyUnit)}
        disabled={disabled}
        className={`px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''
        }`}
      >
        {availableUnits.map((u) => (
          <option key={u} value={u}>
            {FREQUENCY_UNIT_LABELS[u]}
          </option>
        ))}
      </select>
    </div>
  );
};

// Profundidad input (level selector with descriptors)
const ProfundidadInput: React.FC<{
  value?: number;
  descriptors: Record<number, string | undefined>;
  onChange: (value: number) => void;
  disabled?: boolean;
}> = ({ value, descriptors, onChange, disabled }) => (
  <div className="space-y-2">
    {MATURITY_LEVELS.map((level) => {
      const isSelected = value === level.value;
      const descriptor = descriptors[level.value];

      return (
        <button
          key={level.value}
          type="button"
          onClick={() => onChange(level.value)}
          disabled={disabled}
          className={`w-full p-3 rounded-lg text-left transition-all ${
            isSelected
              ? `${level.bgColor} ring-2 ring-offset-1 ring-${level.color}-500`
              : 'bg-gray-50 hover:bg-gray-100'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-3">
            <span className={`font-semibold ${isSelected ? level.textColor : 'text-gray-700'}`}>
              {level.value}. {level.label}
            </span>
            {isSelected && <CheckCircle className="w-4 h-4 text-green-600" />}
          </div>
          {descriptor && (
            <p className={`text-sm mt-1 ${isSelected ? level.textColor : 'text-gray-500'}`}>
              {descriptor}
            </p>
          )}
        </button>
      );
    })}
  </div>
);

export default AssessmentResponseForm;
