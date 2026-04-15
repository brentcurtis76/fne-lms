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
} from 'lucide-react';
import HelpButton from '@/components/tutorials/HelpButton';
import {
  AREA_LABELS,
  ENTITY_LABELS,
  TransformationArea,
} from '@/types/assessment-builder';
import { ModuleCard } from '@/components/assessment';
import type { IndicatorData, ModuleData, ObjectiveData, ResponseData } from '@/components/assessment';

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
  const [objectives, setObjectives] = useState<ObjectiveData[]>([]);
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
      setObjectives(data.objectives || []);
      setResponses(data.responses || {});
      setProgress(data.progress || { total: 0, answered: 0, percentage: 0 });
      setAssignee(data.assignee);

      // Expand first module or first objective by default
      if (data.objectives?.length > 0 && data.objectives[0].modules?.length > 0) {
        setExpandedModules(new Set([data.objectives[0].modules[0].id]));
      } else if (data.modules?.length > 0) {
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

  // Compute all modules (from objectives hierarchy or flat list)
  const allModules: ModuleData[] = objectives.length > 0
    ? objectives.flatMap((o) => o.modules)
    : modules;

  // Check if an indicator response is "answered"
  const isIndicatorAnswered = (indicator: IndicatorData, resp: ResponseData | undefined): boolean => {
    if (!resp) return false;
    if (indicator.category === 'cobertura') return resp.coverageValue !== undefined && resp.coverageValue !== null;
    if (indicator.category === 'frecuencia') return resp.frequencyValue !== undefined && resp.frequencyValue !== null;
    if (indicator.category === 'profundidad') return resp.profundityLevel !== undefined && resp.profundityLevel !== null;
    if (indicator.category === 'traspaso') {
      const sub = resp.subResponses as Record<string, unknown> | undefined;
      return !!(sub?.evidence_link || sub?.improvement_suggestions);
    }
    if (indicator.category === 'detalle') {
      const sub = resp.subResponses as Record<string, unknown> | undefined;
      const selected = sub?.selected_options;
      return Array.isArray(selected) && selected.length > 0;
    }
    return false;
  };

  // Update progress whenever responses change
  useEffect(() => {
    const modulesToCheck = objectives.length > 0
      ? objectives.flatMap((o) => o.modules)
      : modules;

    if (modulesToCheck.length > 0) {
      // Recalculate progress based on current responses
      let total = 0;
      let answered = 0;

      modulesToCheck.forEach(module => {
        const sortedIndicators = [...module.indicators]
          .filter((ind) => ind.isActiveThisYear !== false)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        const hasCoberturaGate = sortedIndicators.length > 0 && sortedIndicators[0].category === 'cobertura';

        if (hasCoberturaGate) {
          const coberturaResp = responses[sortedIndicators[0].id];
          const coberturaValue = coberturaResp?.coverageValue;

          // Always count the cobertura indicator
          total++;
          if (isIndicatorAnswered(sortedIndicators[0], coberturaResp)) answered++;

          if (coberturaValue === false) {
            // Gate closed: hidden indicators don't count
          } else if (coberturaValue === true) {
            // Gate open: count remaining indicators
            sortedIndicators.slice(1).forEach(indicator => {
              total++;
              if (isIndicatorAnswered(indicator, responses[indicator.id])) answered++;
            });
          }
          // coberturaValue undefined: only show cobertura indicator (already counted above)
        } else {
          // Legacy: no cobertura gate, count all
          module.indicators.forEach(indicator => {
            total++;
            if (isIndicatorAnswered(indicator, responses[indicator.id])) answered++;
          });
        }
      });

      setProgress({
        total,
        answered,
        percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responses, modules, objectives]);

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
  const handleResponseChange = (indicatorId: string, field: keyof ResponseData, value: ResponseData[keyof ResponseData]) => {
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
        sub_responses: currentResponses[id].subResponses,
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

    allModules.forEach(module => {
      const sortedIndicators = [...module.indicators]
        .filter((ind) => ind.isActiveThisYear !== false)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      const hasCoberturaGate = sortedIndicators.length > 0 && sortedIndicators[0].category === 'cobertura';

      if (hasCoberturaGate) {
        const coberturaResp = currentResponses[sortedIndicators[0].id];
        const coberturaValue = coberturaResp?.coverageValue;

        total++;
        if (isIndicatorAnswered(sortedIndicators[0], coberturaResp)) answered++;

        if (coberturaValue === true) {
          sortedIndicators.slice(1).forEach(indicator => {
            total++;
            if (isIndicatorAnswered(indicator, currentResponses[indicator.id])) answered++;
          });
        }
      } else {
        module.indicators.forEach(indicator => {
          total++;
          if (isIndicatorAnswered(indicator, currentResponses[indicator.id])) answered++;
        });
      }
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
      <div className="min-h-screen bg-brand_light flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
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
      >
        <HelpButton sectionId="proceso-de-cambio" />
      </ResponsiveFunctionalPageHeader>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button and actions */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/docente/assessments" legacyBehavior>
            <a className="inline-flex items-center text-sm text-brand_primary/50 hover:text-brand_primary transition-colors">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Volver a evaluaciones
            </a>
          </Link>

          <div className="flex items-center gap-3">
            {saving && (
              <span className="text-sm text-brand_primary/40 flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Guardando...
              </span>
            )}
            {!isCompleted && (
              <>
                <button
                  onClick={() => saveResponses(Object.keys(responses))}
                  disabled={saving || !hasUnsavedChanges}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium border border-brand_primary/15 text-brand_primary/70 rounded-lg hover:bg-brand_primary/[0.03] disabled:opacity-40 transition-colors"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  Guardar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || progress.percentage < 100}
                  className="inline-flex items-center px-5 py-2 text-sm font-semibold bg-brand_accent text-brand_primary rounded-lg hover:bg-brand_accent_hover disabled:opacity-40 transition-colors shadow-sm"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1.5" />
                      Enviar
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-xl border border-brand_primary/[0.08] p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-brand_primary/50 uppercase tracking-wider">Progreso</span>
            <span className="text-sm text-brand_primary/50 font-medium tabular-nums">
              {progress.answered} de {progress.total} indicadores ({progress.percentage}%)
            </span>
          </div>
          <div className="w-full bg-brand_primary/[0.06] rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                progress.percentage === 100 ? 'bg-brand_accent' : 'bg-brand_primary'
              }`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          {isCompleted && (
            <div className="mt-3 flex items-center text-brand_accent">
              <CheckCircle className="w-4 h-4 mr-2" />
              <span className="text-sm font-semibold text-brand_primary">Evaluación completada</span>
            </div>
          )}
        </div>

        {/* 3-level hierarchy: Objectives → Acciones → Indicators */}
        {objectives.length > 0 ? (
          <div className="space-y-8">
            {objectives.map((objective) => (
              <div key={objective.id} className="space-y-4">
                {/* Objective header */}
                <div className="flex items-center gap-4 px-1">
                  <div className="h-px flex-1 bg-brand_accent/40" />
                  <h3 className="text-xs font-bold text-brand_primary/60 uppercase tracking-[0.15em] whitespace-nowrap">
                    {ENTITY_LABELS.objective}: {objective.name}
                  </h3>
                  <div className="h-px flex-1 bg-brand_accent/40" />
                </div>
                {objective.description && (
                  <p className="text-sm text-brand_primary/45 px-1 leading-relaxed">{objective.description}</p>
                )}

                {/* Acciones within this objective */}
                <div className="space-y-3">
                  {objective.modules.map((module) => (
                    <ModuleCard
                      key={module.id}
                      module={module}
                      responses={responses}
                      expanded={expandedModules.has(module.id)}
                      onToggle={() => toggleModule(module.id)}
                      onResponseChange={handleResponseChange}
                      canEdit={canEdit}
                    />
                  ))}
                  {objective.modules.length === 0 && (
                    <p className="text-sm text-brand_primary/30 italic px-2">
                      Sin {ENTITY_LABELS.modules.toLowerCase()} en este {ENTITY_LABELS.objective.toLowerCase()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Flat modules fallback (backward compat) */
          <div className="space-y-4">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                responses={responses}
                expanded={expandedModules.has(module.id)}
                onToggle={() => toggleModule(module.id)}
                onResponseChange={handleResponseChange}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default AssessmentResponseForm;
