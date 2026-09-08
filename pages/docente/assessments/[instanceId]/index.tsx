import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  GENERATION_TYPE_LABELS,
  GRADE_LEVEL_LABELS,
  GenerationType,
  GradeLevel,
  InstanceStatus,
  TransformationArea,
} from '@/types/assessment-builder';
import { ModuleCard } from '@/components/assessment';
import type { IndicatorData, ModuleData, ObjectiveData, ResponseData } from '@/components/assessment';
import { resolveCoberturaGate } from '@/lib/services/assessment-builder/coberturaGatePolicy';

const INSTANCE_STATUS_LABELS: Record<InstanceStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  completed: 'Completada',
  archived: 'Archivada',
};

const SAVE_FAILED_MESSAGE = 'No se pudieron guardar tus respuestas. Revisa tu conexión e intenta nuevamente.';
const LEAVE_WITH_UNSAVED_MESSAGE =
  'Tienes respuestas sin guardar en el servidor. Salir puede requerir recuperar el borrador de este navegador. ¿Deseas salir de todos modos?';
const BACK_SAVE_FAILED_MESSAGE =
  'No se pudieron guardar tus respuestas antes de salir. Revisa tu conexión e intenta nuevamente.';
const ASSESSMENTS_LIST_PATH = '/docente/assessments';

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
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navigationAllowedRef = useRef(false);
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

  // Preserve the reviewed internal-navigation guard, using main's durable
  // draft session as the single source of pending answers. Dispose on actual
  // unmount; cancelling navigation must leave autosave and recovery usable.
  useEffect(() => {
    const events = router.events;
    if (!events || !draftSession) return;
    const onRouteChangeStart = (url: string) => {
      if (navigationAllowedRef.current || draftSession.state.pendingCount === 0) return;
      if (window.confirm(LEAVE_WITH_UNSAVED_MESSAGE)) return;
      events.emit('routeChangeError', new Error('unsaved-responses'), url, { shallow: false });
      throw new Error('Navegación cancelada: hay respuestas sin guardar');
    };
    events.on('routeChangeStart', onRouteChangeStart);
    return () => events.off('routeChangeStart', onRouteChangeStart);
  }, [router.events, draftSession]);

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
    if (submittingRef.current || leaving || !assignee?.canEdit || ['completed', 'archived'].includes(instance?.status) || !draftSession?.state.ready || draftSession.state.recovery.length) return;
    const answer = { ...responsesRef.current[indicatorId], [field]: value };
    const next = { ...responsesRef.current, [indicatorId]: answer };
    // Persist synchronously in the input event, before a render or debounce can be interrupted.
    draftSession.record(indicatorId, answer);
    responsesRef.current = next;
    setResponses(next);
  };

  const saveResponses = () => draftSession?.save() ?? Promise.resolve(false);

  const handleManualSave = async () => {
    if (!(await saveResponses())) toast.error(SAVE_FAILED_MESSAGE);
  };

  const handleBack = async () => {
    if (leaving || submittingRef.current) return;
    setLeaving(true);
    try {
      if (draftSession?.state.pendingCount && !(await saveResponses())) {
        toast.error(BACK_SAVE_FAILED_MESSAGE);
        return;
      }
      navigationAllowedRef.current = true;
      await router.push(ASSESSMENTS_LIST_PATH);
    } finally {
      navigationAllowedRef.current = false;
      setLeaving(false);
    }
  };

  const recoverDraft = (key: string) => {
    const recovered = draftSession?.recover(key);
    if (recovered) {
      const next = { ...responsesRef.current, ...recovered };
      responsesRef.current = next;
      setResponses(next);
    }
  };

  // Enviar opens an explicit confirmation (submission is irreversible); the
  // real submit runs from the modal. Only an assignee with can_submit sees
  // the control at all (R11).
  const handleSubmit = () => {
    if (!instanceId || submittingRef.current || leaving || !assignee?.canSubmit || ['completed', 'archived'].includes(instance?.status) || !draftSession?.state.ready || draftSession.state.recovery.length) return;
    setConfirmSubmitOpen(true);
  };

  // Submit assessment: flush everything dirty first and abort — no POST — if
  // any of it did not persist, so the server never scores stale responses.
  const confirmSubmit = async () => {
    if (!instanceId || submittingRef.current || leaving || !assignee?.canSubmit || ['completed', 'archived'].includes(instance?.status) || !draftSession?.state.ready || draftSession.state.recovery.length) return;
    setConfirmSubmitOpen(false);

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
  const canSubmit = Boolean(assignee?.canSubmit) && !isCompleted && instance?.status !== 'archived';

  const gradeLevel = instance?.courseInfo?.gradeLevel as GradeLevel | undefined;
  const gradeLabel = gradeLevel ? (GRADE_LEVEL_LABELS[gradeLevel] ?? gradeLevel) : '';
  const generationType = instance?.generationType as GenerationType | undefined;
  const generationLabel = generationType && GENERATION_TYPE_LABELS[generationType]
    ? `${GENERATION_TYPE_LABELS[generationType]} (${generationType})`
    : 'Sin generación';
  const statusLabel = INSTANCE_STATUS_LABELS[instance?.status as InstanceStatus] ?? 'Sin estado';
  const canEdit = assignee?.canEdit && !isCompleted && instance?.status !== 'archived' && !submitting && !leaving && draftState.ready && !draftState.recovery.length;

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
          <button
            type="button"
            onClick={handleBack}
            disabled={leaving}
            data-testid="assessment-back-button"
            className="inline-flex items-center text-sm text-brand_primary/50 hover:text-brand_primary transition-colors disabled:opacity-60"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {leaving ? 'Guardando y volviendo...' : 'Volver a evaluaciones'}
          </button>

          <div className="flex items-center gap-3">
            {saving && (
              <span className="text-sm text-brand_primary/40 flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Guardando...
              </span>
            )}
            {!isCompleted && canEdit && (
              <button
                onClick={handleManualSave}
                disabled={saving || submitting || leaving || !hasUnsavedChanges}
                data-testid="assessment-save-button"
                className="inline-flex items-center px-4 py-2 text-sm font-medium border border-brand_primary/15 text-brand_primary/70 rounded-lg hover:bg-brand_primary/[0.03] disabled:opacity-40 transition-colors"
              >
                <Save className="w-4 h-4 mr-1.5" />
                Guardar
              </button>
            )}
            {!isCompleted && canSubmit && (
              <button
                onClick={handleSubmit}
                disabled={submitting || leaving || !draftState.ready || draftState.recovery.length > 0 || progress.percentage < 100}
                data-testid="assessment-submit-button"
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
            )}
            {!isCompleted && !canSubmit && (
              <span
                data-testid="assessment-submit-unavailable"
                className="text-sm text-brand_primary/50"
                title="Solo el docente responsable puede enviar esta evaluación"
              >
                Sin autorización para enviar
              </span>
            )}
          </div>
        </div>

        {confirmSubmitOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-submit-confirm-title"
            data-testid="assessment-submit-confirm"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          >
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 id="assessment-submit-confirm-title" className="text-lg font-semibold text-brand_primary">
                ¿Enviar la evaluación?
              </h2>
              <p className="mt-2 text-sm text-brand_primary/70">
                Al enviar, la evaluación queda completada y no podrás modificar tus respuestas.
                Tus respuestas pendientes se guardarán antes de enviar.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(false)}
                  data-testid="assessment-submit-cancel"
                  className="px-4 py-2 text-sm font-medium border border-brand_primary/15 text-brand_primary/70 rounded-lg hover:bg-brand_primary/[0.03]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmSubmit}
                  data-testid="assessment-submit-confirm-button"
                  className="px-5 py-2 text-sm font-semibold bg-brand_accent text-brand_primary rounded-lg hover:bg-brand_accent_hover shadow-sm"
                >
                  Sí, enviar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Context summary: what exactly is being evaluated */}
        <dl
          data-testid="assessment-context-summary"
          className="bg-white rounded-xl border border-brand_primary/[0.08] p-5 mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4"
        >
          <div>
            <dt className="text-[11px] font-semibold text-brand_primary/45 uppercase tracking-wider">Curso</dt>
            <dd className="text-sm font-medium text-brand_primary mt-0.5" data-testid="assessment-context-course">
              {instance?.courseInfo?.courseName || 'Sin curso asignado'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-brand_primary/45 uppercase tracking-wider">Nivel</dt>
            <dd className="text-sm font-medium text-brand_primary mt-0.5" data-testid="assessment-context-grade">
              {gradeLabel || 'Sin nivel'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-brand_primary/45 uppercase tracking-wider">Año de transformación</dt>
            <dd className="text-sm font-medium text-brand_primary mt-0.5" data-testid="assessment-context-year">
              {instance?.transformationYear ? `Año ${instance.transformationYear}` : 'Sin año'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-brand_primary/45 uppercase tracking-wider">Generación</dt>
            <dd className="text-sm font-medium text-brand_primary mt-0.5" data-testid="assessment-context-generation">
              {generationLabel}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-brand_primary/45 uppercase tracking-wider">Estado</dt>
            <dd className="text-sm font-medium text-brand_primary mt-0.5" data-testid="assessment-context-status">
              {statusLabel}
            </dd>
          </div>
        </dl>
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
