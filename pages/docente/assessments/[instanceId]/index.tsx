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
import { ResponseDraftSession, DraftState } from '@/lib/services/assessment-builder/responseDraft';
import {
  AREA_LABELS,
  ENTITY_LABELS,
  TransformationArea,
} from '@/types/assessment-builder';
import { ModuleCard } from '@/components/assessment';
import type { IndicatorData, ModuleData, ObjectiveData, ResponseData } from '@/components/assessment';
import { resolveCoberturaGate } from '@/lib/services/assessment-builder/coberturaGatePolicy';

const AssessmentResponseForm: React.FC = () => {
  const router = useRouter();
  const { instanceId } = router.query;
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
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
  const [draftState, setDraftState] = useState<DraftState>({ ready: false, saving: false,
    pendingCount: 0, recovery: [], storageError: false, saveError: null, lastSavedAt: null });
  const [draftOwner, setDraftOwner] = useState<{ scope: string; session: ResponseDraftSession } | null>(null);
  const scope = user?.id && typeof instanceId === 'string' ? `${user.id}:${instanceId}` : null;
  const draftSession = draftOwner?.scope === scope ? draftOwner.session : null;
  const saving = draftState.saving;
  const hasUnsavedChanges = draftState.pendingCount > 0;

  useEffect(() => {
    if (!scope || typeof instanceId !== 'string') return;
    const session = new ResponseDraftSession(user.id, instanceId, () => window.localStorage);
    const unsubscribe = session.subscribe(setDraftState);
    setDraftOwner({ scope, session });
    return () => { unsubscribe(); session.dispose(); };
  }, [scope, user?.id, instanceId]);

  useEffect(() => {
    if (!draftSession) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (draftSession.state.pendingCount > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const reconnect = () => { if (draftSession.state.pendingCount > 0) void draftSession.save(); };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('online', reconnect);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('online', reconnect);
    };
  }, [draftSession]);

  const loadSequence = useRef(0);
  const submittingRef = useRef(false);

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
    if (!user || typeof instanceId !== 'string' || !draftSession) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/docente/assessments/${instanceId}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar la evaluación');
      }

      const data = await response.json();
      if (sequence !== loadSequence.current) return;
      const all = data.objectives?.length
        ? data.objectives.flatMap((objective: ObjectiveData) => objective.modules) : (data.modules || []);
      draftSession.initialize(all.flatMap((module: ModuleData) => module.indicators.map(indicator => indicator.id)),
        data.assignee?.canEdit && !['completed', 'archived'].includes(data.instance.status));
      setLoadedScope(`${user.id}:${instanceId}`);
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
      if (sequence === loadSequence.current) setLoadError(error.message || 'No se pudieron recuperar las respuestas guardadas.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [user, instanceId, draftSession]);

  useEffect(() => {
    if (user && instanceId) {
      void fetchAssessment();
    }
    return () => { loadSequence.current++; };
  }, [user, instanceId, fetchAssessment]);

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

  // Compute a module's applicable indicators (cobertura-gate-aware) and how many are answered.
  const computeModuleProgress = (
    module: ModuleData,
    currentResponses: Record<string, ResponseData>
  ): { total: number; answered: number } => {
    const activeIndicators = module.indicators.filter((ind) => ind.isActiveThisYear !== false);
    const gate = resolveCoberturaGate({
      indicators: activeIndicators,
      getId: (ind: IndicatorData) => ind.id,
      getCategory: (ind: IndicatorData) => ind.category,
      getDisplayOrder: (ind: IndicatorData) => ind.displayOrder,
      getCoverageValue: (id: string) => currentResponses[id]?.coverageValue,
    });

    let answered = 0;
    gate.applicable.forEach((indicator) => {
      if (isIndicatorAnswered(indicator, currentResponses[indicator.id])) answered++;
    });

    return { total: gate.applicable.length, answered };
  };

  // Update progress whenever responses change
  useEffect(() => {
    const modulesToCheck = objectives.length > 0
      ? objectives.flatMap((o) => o.modules)
      : modules;

    if (modulesToCheck.length > 0) {
      let total = 0;
      let answered = 0;

      modulesToCheck.forEach((module) => {
        const contribution = computeModuleProgress(module, responses);
        total += contribution.total;
        answered += contribution.answered;
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

  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const handleResponseChange = (indicatorId: string, field: keyof ResponseData, value: ResponseData[keyof ResponseData]) => {
    if (submittingRef.current || !draftSession?.state.ready || draftSession.state.recovery.length) return;
    const answer = { ...responsesRef.current[indicatorId], [field]: value };
    const next = { ...responsesRef.current, [indicatorId]: answer };
    // Persist synchronously in the input event, before a render or debounce can be interrupted.
    draftSession.record(indicatorId, answer);
    responsesRef.current = next;
    setResponses(next);
  };

  const saveResponses = () => draftSession?.save() ?? Promise.resolve(false);

  const recoverDraft = (key: string) => {
    const recovered = draftSession?.recover(key);
    if (recovered) {
      const next = { ...responsesRef.current, ...recovered };
      responsesRef.current = next;
      setResponses(next);
    }
  };

  // Submit assessment
  const handleSubmit = async () => {
    if (!instanceId || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      // Never finalize against older stored answers after a failed or partial save.
      const saved = await saveResponses();
      if (!saved) {
        toast.error('Hay respuestas pendientes de guardar. Intenta nuevamente antes de enviar.');
        return;
      }
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

      setInstance((previous: any) => ({ ...previous, status: 'completed', completed_at: data.completedAt }));
      toast.success('Evaluación completada');
    } catch (error: any) {
      console.error('Error submitting:', error);
      toast.error(error.message || 'Error al enviar la evaluación');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loadError) {
    return (
      <div className="max-w-xl mx-auto p-8" role="alert">
        <h1 className="text-xl font-semibold">No pudimos cargar la evaluación</h1>
        <p className="mt-3">{loadError}</p>
        <p className="mt-2">Para proteger tus respuestas, el formulario estará disponible cuando podamos recuperarlas.</p>
        <button data-testid="retry-assessment-load" className="mt-4 px-4 py-2 bg-brand_primary text-white rounded" onClick={() => void fetchAssessment()}>
          Reintentar carga
        </button>
      </div>
    );
  }

  // Loading state
  if (loading || !user || loadedScope !== scope || !draftSession) {
    return (
      <div className="min-h-screen bg-brand_light flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  const isCompleted = instance?.status === 'completed';
  const canEdit = assignee?.canEdit && !isCompleted && instance?.status !== 'archived' && !submitting && draftState.ready && !draftState.recovery.length;

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
                  onClick={() => void saveResponses()}
                  disabled={saving || submitting || !hasUnsavedChanges}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium border border-brand_primary/15 text-brand_primary/70 rounded-lg hover:bg-brand_primary/[0.03] disabled:opacity-40 transition-colors"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  Guardar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !canEdit || progress.percentage < 100}
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

        {draftState.recovery.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5" role="alert">
            <h2 className="font-semibold">Encontramos un borrador pendiente en este navegador</h2>
            <p className="mt-2 text-sm">Puedes recuperarlo para continuar. Sus respuestas reemplazarán las correspondientes del formulario; las demás se conservarán. Si otra persona o pestaña actualizó la evaluación, revisa antes de recuperar.</p>
            {draftState.recovery.map(draft => (
              <button key={draft.key} data-testid="recover-assessment-draft" className="mt-3 mr-3 rounded bg-brand_primary px-4 py-2 text-white"
                onClick={() => recoverDraft(draft.key)}>
                Recuperar borrador ({new Date(draft.savedAt).toLocaleString('es-CL')})
              </button>
            ))}
            <button data-testid="discard-assessment-drafts" className="mt-3 underline" onClick={() => draftSession.discardRecovery()}>
              Descartar borradores y usar las respuestas del servidor
            </button>
          </div>
        )}
        {!isCompleted && draftState.ready && !draftState.recovery.length && (
          <div className="mb-5 text-sm" aria-live="polite" data-testid="assessment-save-status">
            {saving ? 'Guardando respuestas…' : hasUnsavedChanges
              ? 'Cambios pendientes de guardar en el servidor.' : 'Respuestas guardadas en el servidor.'}
            {hasUnsavedChanges && !draftState.storageError && <p>Hay un borrador de tus cambios en este navegador para recuperarlos al volver.</p>}
            {draftState.saveError && <p className="mt-1 text-amber-800">{draftState.saveError}</p>}
            {draftState.lastSavedAt && <p>Último guardado: {new Date(draftState.lastSavedAt).toLocaleTimeString('es-CL')}</p>}
          </div>
        )}
        {draftState.storageError && (
          <p role="alert" className="mb-5 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            No pudimos asegurar el respaldo en este navegador. No cierres la página con cambios pendientes; espera la confirmación del guardado en el servidor.
          </p>
        )}

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
            <div role="status" className="mt-3 text-brand_primary">
              <div className="flex items-center font-semibold">
                <CheckCircle className="w-4 h-4 mr-2 text-brand_accent" />
                <span className="text-sm">Evaluación completada</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                Los informes individuales y del colegio se generarán una vez que todas las personas responsables hayan completado sus evaluaciones y los asesores correspondientes hayan aportado su retroalimentación al proceso.
              </p>
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
