import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type TaskStatus = 'completed' | 'in-progress' | 'planned' | 'blocked';
export type PhaseStatus = 'completed' | 'in-progress' | 'planned' | 'blocked';

export interface RoadmapTask {
  id: string;
  name: string;
  status: TaskStatus;
  assignee?: string;
  notes?: string;
}

export interface RoadmapPhase {
  id: string;
  name: string;
  description: string;
  status: PhaseStatus;
  progress: number; // 0-100
  startDate: string;
  endDate: string;
  tasks: RoadmapTask[];
}

export interface RoadmapData {
  title: string;
  lastUpdated: string;
  phases: RoadmapPhase[];
}

interface GeneraRoadmapProps {
  initialData: RoadmapData;
  onSave: (data: RoadmapData) => Promise<void>;
}

// ── Default data ───────────────────────────────────────────────────────────────

export const DEFAULT_DATA: RoadmapData = {
  title: 'GENERA MVP — Roadmap de Desarrollo',
  lastUpdated: new Date().toISOString(),
  phases: [
    {
      id: 'phase-1',
      name: 'Fase 1: Fundamentos',
      description: 'Infraestructura base, autenticación, y roles',
      status: 'completed',
      progress: 100,
      startDate: '2025-06-01',
      endDate: '2025-09-30',
      tasks: [
        { id: 't1-1', name: 'Sistema de autenticación', status: 'completed' },
        { id: 't1-2', name: 'RBAC con 7 roles', status: 'completed' },
        { id: 't1-3', name: 'Layout y navegación', status: 'completed' },
      ],
    },
    {
      id: 'phase-2',
      name: 'Fase 2: LMS Core',
      description: 'Cursos, módulos, lecciones, y contenido',
      status: 'completed',
      progress: 100,
      startDate: '2025-10-01',
      endDate: '2025-12-31',
      tasks: [
        { id: 't2-1', name: 'Constructor de cursos', status: 'completed' },
        { id: 't2-2', name: 'Sistema de asignaciones', status: 'completed' },
        { id: 't2-3', name: 'Evaluaciones y quizzes', status: 'completed' },
      ],
    },
    {
      id: 'phase-3',
      name: 'Fase 3: Consultorías',
      description: 'Sesiones, horas, tarifas, y reportes',
      status: 'in-progress',
      progress: 75,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      tasks: [
        { id: 't3-1', name: 'Sesiones de consultoría', status: 'completed' },
        { id: 't3-2', name: 'Tracking de horas', status: 'in-progress' },
        { id: 't3-3', name: 'Reportes y ganancias', status: 'in-progress' },
      ],
    },
    {
      id: 'phase-4',
      name: 'Fase 4: Transformación',
      description: 'Evaluaciones de transformación y rúbricas',
      status: 'planned',
      progress: 20,
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      tasks: [
        { id: 't4-1', name: 'Constructor de evaluaciones', status: 'in-progress' },
        { id: 't4-2', name: 'Análisis con IA', status: 'planned' },
        { id: 't4-3', name: 'Reportes PDF', status: 'planned' },
      ],
    },
  ],
};

// ── Brand colors ───────────────────────────────────────────────────────────────

const COLORS = {
  primary: '#0a0a0a',
  accent: '#fbbf24',
  completed: '#22c55e',
  inProgress: '#fbbf24',
  planned: '#9ca3af',
  blocked: '#ef4444',
} as const;

function statusColor(status: TaskStatus | PhaseStatus): string {
  switch (status) {
    case 'completed':
      return COLORS.completed;
    case 'in-progress':
      return COLORS.inProgress;
    case 'planned':
      return COLORS.planned;
    case 'blocked':
      return COLORS.blocked;
    default:
      return COLORS.planned;
  }
}

function statusLabel(status: TaskStatus | PhaseStatus): string {
  switch (status) {
    case 'completed':
      return 'Completado';
    case 'in-progress':
      return 'En progreso';
    case 'planned':
      return 'Planificado';
    case 'blocked':
      return 'Bloqueado';
    default:
      return status;
  }
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'completed', label: 'Completado' },
  { value: 'in-progress', label: 'En progreso' },
  { value: 'planned', label: 'Planificado' },
  { value: 'blocked', label: 'Bloqueado' },
];

// ── Helper ─────────────────────────────────────────────────────────────────────

function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function mergeWithDefaults(data: Partial<RoadmapData>): RoadmapData {
  return {
    title: data.title ?? DEFAULT_DATA.title,
    lastUpdated: data.lastUpdated ?? new Date().toISOString(),
    phases: (data.phases ?? DEFAULT_DATA.phases).map((phase) => ({
      id: phase.id ?? generateId(),
      name: phase.name ?? '',
      description: phase.description ?? '',
      status: phase.status ?? 'planned',
      progress: phase.progress ?? 0,
      startDate: phase.startDate ?? '',
      endDate: phase.endDate ?? '',
      tasks: (phase.tasks ?? []).map((task) => ({
        id: task.id ?? generateId(),
        name: task.name ?? '',
        status: task.status ?? 'planned',
        assignee: task.assignee,
        notes: task.notes,
      })),
    })),
  };
}

function calcOverallProgress(phases: RoadmapPhase[]): number {
  if (phases.length === 0) return 0;
  const total = phases.reduce((sum, p) => sum + p.progress, 0);
  return Math.round(total / phases.length);
}

// ── Component ──────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const GeneraRoadmap: React.FC<GeneraRoadmapProps> = ({ initialData, onSave }) => {
  const [data, setData] = useState<RoadmapData>(() => mergeWithDefaults(initialData));
  const [editMode, setEditMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  // FIX [BC-1]: hover state for edit toggle button
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // Keep mutable refs to avoid stale closures in async callbacks
  const onSaveRef = useRef(onSave);
  const dataRef = useRef(data);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // ── Serialized autosave ─────────────────────────────────────────────────────
  //
  // Invariant: at most one save request is in-flight at any time.
  //
  // saveChainRef holds the promise of the current save chain. Every caller
  // (debounce, flush, unmount) appends to this chain so they serialize
  // naturally and callers can await the full chain settling.
  //
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const unmountedRef = useRef(false);

  // Core save: drains dirty flag in a loop. Always appended to saveChainRef
  // so only one instance runs at a time. Resolves to true if all data was saved,
  // false if a save failed (dirty remains true).
  const enqueueSave = useCallback((): Promise<boolean> => {
    let resolveResult: (ok: boolean) => void;
    const resultPromise = new Promise<boolean>((r) => { resolveResult = r; });

    const work = async () => {
      let failed = false;
      while (dirtyRef.current) {
        dirtyRef.current = false;
        const snapshot = dataRef.current;
        try {
          await onSaveRef.current(snapshot);
        } catch {
          dirtyRef.current = true;
          failed = true;
          break;
        }
      }
      // Update indicator (skip if component unmounted)
      if (!unmountedRef.current) {
        if (failed) {
          setSaveState('error');
        } else {
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          setSaveState('saved');
          savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
        }
      }
      resolveResult(!failed);
    };
    // Chain: waits for any in-flight save to finish, then runs ours
    saveChainRef.current = saveChainRef.current.then(work, work);
    return resultPromise;
  }, []);

  // Flush: cancel debounce timer + drain the save chain. Returns true if
  // all data was saved, false if save failed (data still dirty).
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!dirtyRef.current) {
      // Nothing pending, but wait for any in-flight save to finish
      await saveChainRef.current;
      return !dirtyRef.current; // in-flight save may have failed
    }
    return enqueueSave();
  }, [enqueueSave]);

  // Trigger debounced save whenever data changes (only in edit mode after first render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!editMode) return;

    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

    setSaveState('saving');
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      enqueueSave();
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [data, editMode, enqueueSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (dirtyRef.current) {
        // Enqueue onto the chain so it waits for any in-flight save to finish first.
        // Cannot await in cleanup, but the chain ensures serialization.
        saveChainRef.current = saveChainRef.current.then(
          () => onSaveRef.current(dataRef.current).catch(() => { /* best effort */ }),
          () => onSaveRef.current(dataRef.current).catch(() => { /* best effort */ }),
        );
      }
    };
  }, []);

  // ── Mutation helpers ─────────────────────────────────────────────────────────

  const updateTitle = useCallback((title: string) => {
    setData((prev) => ({ ...prev, title }));
  }, []);

  const updatePhase = useCallback((phaseId: string, changes: Partial<Omit<RoadmapPhase, 'id' | 'tasks'>>) => {
    setData((prev) => ({
      ...prev,
      phases: prev.phases.map((p) => (p.id === phaseId ? { ...p, ...changes } : p)),
    }));
  }, []);

  const addTask = useCallback((phaseId: string) => {
    const newTask: RoadmapTask = {
      id: generateId(),
      name: 'Nueva tarea',
      status: 'planned',
    };
    setData((prev) => ({
      ...prev,
      phases: prev.phases.map((p) =>
        p.id === phaseId ? { ...p, tasks: [...p.tasks, newTask] } : p
      ),
    }));
  }, []);

  const updateTask = useCallback((phaseId: string, taskId: string, changes: Partial<Omit<RoadmapTask, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      phases: prev.phases.map((p) =>
        p.id === phaseId
          ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...changes } : t)) }
          : p
      ),
    }));
  }, []);

  const removeTask = useCallback((phaseId: string, taskId: string) => {
    setData((prev) => ({
      ...prev,
      phases: prev.phases.map((p) =>
        p.id === phaseId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) } : p
      ),
    }));
  }, []);

  const addPhase = useCallback(() => {
    const newPhase: RoadmapPhase = {
      id: generateId(),
      name: 'Nueva fase',
      description: '',
      status: 'planned',
      progress: 0,
      startDate: '',
      endDate: '',
      tasks: [],
    };
    setData((prev) => ({ ...prev, phases: [...prev.phases, newPhase] }));
  }, []);

  const removePhase = useCallback((phaseId: string) => {
    setData((prev) => ({
      ...prev,
      phases: prev.phases.filter((p) => p.id !== phaseId),
    }));
  }, []);

  const overallProgress = calcOverallProgress(data.phases);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        fontFamily: 'Inter, sans-serif',
        background: '#f9fafb',
        minHeight: '100%',
        padding: '0',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          background: COLORS.primary,
          color: '#fff',
          padding: '24px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          {editMode ? (
            <input
              value={data.title}
              onChange={(e) => updateTitle(e.target.value)}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.accent}`,
                borderRadius: '6px',
                color: '#fff',
                fontSize: '22px',
                fontWeight: 700,
                padding: '4px 10px',
                width: '420px',
                maxWidth: '100%',
              }}
            />
          ) : (
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{data.title}</h1>
          )}
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            Actualizado: {new Date(data.lastUpdated).toLocaleDateString('es-CL')}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* FIX [A-2]: Persistent aria-live region for save indicator — always in DOM */}
          <div role="status" aria-live="polite" aria-atomic="true">
            {saveState === 'saving' && (
              <span style={{ color: COLORS.accent, fontSize: '13px', fontWeight: 600 }}>
                GUARDANDO...
              </span>
            )}
            {saveState === 'saved' && (
              <span style={{ color: COLORS.completed, fontSize: '13px', fontWeight: 600 }}>
                ✓ GUARDADO
              </span>
            )}
            {saveState === 'error' && (
              <span style={{ color: COLORS.blocked, fontSize: '13px', fontWeight: 600 }}>
                ERROR AL GUARDAR
              </span>
            )}
          </div>

          {/* FIX [BC-1]: Edit toggle button with hover state */}
          <button
            onClick={async () => {
              if (editMode) {
                // Await flush — stay in edit mode if save fails
                const ok = await flushSave();
                if (!ok) return;
              }
              setEditMode((prev) => !prev);
            }}
            onMouseEnter={() => setHoveredBtn('edit')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              background: editMode
                ? (hoveredBtn === 'edit' ? '#f59e0b' : COLORS.accent)
                : (hoveredBtn === 'edit' ? 'rgba(251,191,36,0.12)' : 'transparent'),
              color: editMode ? COLORS.primary : COLORS.accent,
              border: `2px solid ${COLORS.accent}`,
              borderRadius: '8px',
              padding: '8px 20px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {editMode ? 'Finalizar edición' : 'Editar roadmap'}
          </button>
        </div>
      </div>

      {/* Overall progress */}
      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <span style={{ fontWeight: 600, color: COLORS.primary, minWidth: '120px', fontSize: '14px' }}>
          Progreso general
        </span>
        {/* FIX [A-4]: Overall progress bar with role="progressbar" and ARIA attributes */}
        <div
          role="progressbar"
          aria-valuenow={overallProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progreso general del roadmap: ${overallProgress}%`}
          style={{
            flex: 1,
            background: '#e5e7eb',
            borderRadius: '999px',
            height: '10px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${overallProgress}%`,
              height: '100%',
              background: overallProgress === 100 ? COLORS.completed : COLORS.accent,
              borderRadius: '999px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <span
          style={{
            minWidth: '40px',
            textAlign: 'right',
            fontWeight: 700,
            fontSize: '14px',
            color: COLORS.primary,
          }}
        >
          {overallProgress}%
        </span>
      </div>

      {/* Phase cards */}
      <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {data.phases.map((phase, phaseIndex) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            phaseIndex={phaseIndex}
            editMode={editMode}
            onUpdatePhase={updatePhase}
            onAddTask={addTask}
            onUpdateTask={updateTask}
            onRemoveTask={removeTask}
            onRemovePhase={removePhase}
          />
        ))}

        {/* FIX [BC-1]: Add phase button with hover state */}
        {editMode && (
          <AddPhaseButton onAddPhase={addPhase} />
        )}
      </div>
    </div>
  );
};

// ── AddPhaseButton — extracted to manage its own hover state ──────────────────

interface AddPhaseButtonProps {
  onAddPhase: () => void;
}

const AddPhaseButton: React.FC<AddPhaseButtonProps> = ({ onAddPhase }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onAddPhase}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(251,191,36,0.08)' : 'transparent',
        border: `2px dashed ${COLORS.accent}`,
        borderRadius: '12px',
        padding: '16px',
        color: COLORS.accent,
        fontWeight: 600,
        fontSize: '14px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'background 0.15s ease',
      }}
    >
      + Agregar fase
    </button>
  );
};

// ── PhaseCard sub-component ────────────────────────────────────────────────────

interface PhaseCardProps {
  phase: RoadmapPhase;
  phaseIndex: number;
  editMode: boolean;
  onUpdatePhase: (phaseId: string, changes: Partial<Omit<RoadmapPhase, 'id' | 'tasks'>>) => void;
  onAddTask: (phaseId: string) => void;
  onUpdateTask: (phaseId: string, taskId: string, changes: Partial<Omit<RoadmapTask, 'id'>>) => void;
  onRemoveTask: (phaseId: string, taskId: string) => void;
  onRemovePhase: (phaseId: string) => void;
}

const PhaseCard: React.FC<PhaseCardProps> = ({
  phase,
  phaseIndex,
  editMode,
  onUpdatePhase,
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onRemovePhase,
}) => {
  const badgeColor = statusColor(phase.status);
  // FIX [BC-1]: hover states for phase buttons
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  // FIX [A-1]: focus state for inputs
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Phase header */}
      <div
        style={{
          borderLeft: `4px solid ${badgeColor}`,
          padding: '20px 24px',
          background: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            {/* FIX [BC-3]: Phase number — 12px (was 11px) */}
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Fase {phaseIndex + 1}
            </div>

            {/* Phase name */}
            {editMode ? (
              <input
                value={phase.name}
                onChange={(e) => onUpdatePhase(phase.id, { name: e.target.value })}
                onFocus={() => setFocusedInput(`${phase.id}-name`)}
                onBlur={() => setFocusedInput(null)}
                style={getInputStyle(focusedInput === `${phase.id}-name`)}
                placeholder="Nombre de la fase"
              />
            ) : (
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: COLORS.primary }}>{phase.name}</h2>
            )}

            {/* Phase description */}
            {editMode ? (
              <input
                value={phase.description}
                onChange={(e) => onUpdatePhase(phase.id, { description: e.target.value })}
                onFocus={() => setFocusedInput(`${phase.id}-desc`)}
                onBlur={() => setFocusedInput(null)}
                style={{ ...getInputStyle(focusedInput === `${phase.id}-desc`), marginTop: '8px', color: '#6b7280', fontSize: '13px' }}
                placeholder="Descripción"
              />
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>{phase.description}</p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* Status badge / selector */}
            {editMode ? (
              <select
                value={phase.status}
                onChange={(e) => onUpdatePhase(phase.id, { status: e.target.value as PhaseStatus })}
                style={{
                  border: `1px solid ${badgeColor}`,
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: badgeColor,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <span
                style={{
                  background: `${badgeColor}20`,
                  color: badgeColor,
                  borderRadius: '999px',
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {statusLabel(phase.status)}
              </span>
            )}

            {/* FIX [A-3] + [ID-1] + [BC-1]: Remove phase button with aria-label, confirm, hover state */}
            {editMode && (
              <button
                onClick={() => {
                  if (window.confirm(`¿Eliminar la fase "${phase.name}" y todas sus tareas? Esta acción no se puede deshacer.`)) {
                    onRemovePhase(phase.id);
                  }
                }}
                onMouseEnter={() => setHoveredBtn('remove-phase')}
                onMouseLeave={() => setHoveredBtn(null)}
                title="Eliminar fase"
                aria-label={`Eliminar fase: ${phase.name}`}
                style={{
                  background: hoveredBtn === 'remove-phase' ? `${COLORS.blocked}15` : 'transparent',
                  border: `1px solid ${COLORS.blocked}`,
                  borderRadius: '6px',
                  color: COLORS.blocked,
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* FIX [A-4]: Per-phase progress bar with role="progressbar" and ARIA attributes */}
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Progreso</span>
            {editMode ? (
              // FIX [A-5]: Progress number input with aria-label
              <input
                type="number"
                min={0}
                max={100}
                value={phase.progress}
                onChange={(e) => onUpdatePhase(phase.id, { progress: Math.min(100, Math.max(0, Number(e.target.value))) })}
                aria-label={`Progreso de ${phase.name} (porcentaje)`}
                style={{
                  width: '60px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '12px',
                  textAlign: 'right',
                }}
              />
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 700, color: COLORS.primary }}>{phase.progress}%</span>
            )}
          </div>
          {editMode ? (
            // FIX [A-5]: Range slider with aria-label
            <input
              type="range"
              min={0}
              max={100}
              value={phase.progress}
              onChange={(e) => onUpdatePhase(phase.id, { progress: Number(e.target.value) })}
              aria-label={`Ajustar progreso de ${phase.name}`}
              style={{ width: '100%' }}
            />
          ) : (
            <div
              role="progressbar"
              aria-valuenow={phase.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progreso de ${phase.name}: ${phase.progress}%`}
              style={{ background: '#e5e7eb', borderRadius: '999px', height: '8px', overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${phase.progress}%`,
                  height: '100%',
                  background: badgeColor,
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          )}
        </div>

        {/* Dates */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* FIX [BC-3]: 12px (was 11px) */}
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Inicio:</span>
            {editMode ? (
              <input
                type="date"
                value={phase.startDate}
                onChange={(e) => onUpdatePhase(phase.id, { startDate: e.target.value })}
                onFocus={() => setFocusedInput(`${phase.id}-start`)}
                onBlur={() => setFocusedInput(null)}
                style={{ ...getInputStyle(focusedInput === `${phase.id}-start`), fontSize: '12px', padding: '2px 6px' }}
              />
            ) : (
              <span style={{ fontSize: '12px', color: '#374151' }}>{phase.startDate || '—'}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* FIX [BC-3]: 12px (was 11px) */}
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>Fin:</span>
            {editMode ? (
              <input
                type="date"
                value={phase.endDate}
                onChange={(e) => onUpdatePhase(phase.id, { endDate: e.target.value })}
                onFocus={() => setFocusedInput(`${phase.id}-end`)}
                onBlur={() => setFocusedInput(null)}
                style={{ ...getInputStyle(focusedInput === `${phase.id}-end`), fontSize: '12px', padding: '2px 6px' }}
              />
            ) : (
              <span style={{ fontSize: '12px', color: '#374151' }}>{phase.endDate || '—'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tasks list */}
      <div style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {phase.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              phaseId={phase.id}
              editMode={editMode}
              onUpdateTask={onUpdateTask}
              onRemoveTask={onRemoveTask}
            />
          ))}
          {phase.tasks.length === 0 && !editMode && (
            <div style={{ color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>Sin tareas</div>
          )}
        </div>

        {/* FIX [BC-1]: Add task button with hover state */}
        {editMode && (
          <AddTaskButton onAddTask={() => onAddTask(phase.id)} />
        )}
      </div>
    </div>
  );
};

// ── AddTaskButton — extracted to manage its own hover state ───────────────────

interface AddTaskButtonProps {
  onAddTask: () => void;
}

const AddTaskButton: React.FC<AddTaskButtonProps> = ({ onAddTask }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onAddTask}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        marginTop: '10px',
        background: hovered ? '#f9fafb' : 'transparent',
        border: `1px dashed ${hovered ? '#9ca3af' : '#d1d5db'}`,
        borderRadius: '6px',
        padding: '6px 14px',
        color: hovered ? '#374151' : '#6b7280',
        fontSize: '13px',
        cursor: 'pointer',
        width: '100%',
        transition: 'all 0.15s ease',
      }}
    >
      + Agregar tarea
    </button>
  );
};

// ── TaskRow sub-component ──────────────────────────────────────────────────────

interface TaskRowProps {
  task: RoadmapTask;
  phaseId: string;
  editMode: boolean;
  onUpdateTask: (phaseId: string, taskId: string, changes: Partial<Omit<RoadmapTask, 'id'>>) => void;
  onRemoveTask: (phaseId: string, taskId: string) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, phaseId, editMode, onUpdateTask, onRemoveTask }) => {
  const dotColor = statusColor(task.status);
  // FIX [BC-1]: hover state for remove task button
  const [removeHovered, setRemoveHovered] = useState(false);
  // FIX [A-1]: focus state for task inputs
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 0',
        borderBottom: '1px solid #f3f4f6',
      }}
    >
      {/* Status dot */}
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />

      {/* Task name */}
      {editMode ? (
        <input
          value={task.name}
          onChange={(e) => onUpdateTask(phaseId, task.id, { name: e.target.value })}
          onFocus={() => setFocusedInput('name')}
          onBlur={() => setFocusedInput(null)}
          style={{ ...getInputStyle(focusedInput === 'name'), flex: 1, fontSize: '13px' }}
          placeholder="Nombre de la tarea"
        />
      ) : (
        <span
          style={{
            flex: 1,
            fontSize: '13px',
            color: COLORS.primary,
            textDecoration: task.status === 'completed' ? 'line-through' : 'none',
            opacity: task.status === 'completed' ? 0.7 : 1,
          }}
        >
          {task.name}
        </span>
      )}

      {/* Status selector (edit mode) or badge (view mode) */}
      {editMode ? (
        <select
          value={task.status}
          onChange={(e) => onUpdateTask(phaseId, task.id, { status: e.target.value as TaskStatus })}
          style={{
            border: `1px solid ${dotColor}`,
            borderRadius: '999px',
            padding: '2px 8px',
            // FIX [BC-3]: 12px (was 11px)
            fontSize: '12px',
            color: dotColor,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <span
          style={{
            // FIX [BC-3]: 12px (was 11px)
            fontSize: '12px',
            color: dotColor,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel(task.status)}
        </span>
      )}

      {/* Assignee (edit mode) */}
      {editMode && (
        <input
          value={task.assignee ?? ''}
          onChange={(e) => onUpdateTask(phaseId, task.id, { assignee: e.target.value || undefined })}
          onFocus={() => setFocusedInput('assignee')}
          onBlur={() => setFocusedInput(null)}
          style={{ ...getInputStyle(focusedInput === 'assignee'), width: '100px', fontSize: '12px' }}
          placeholder="Responsable"
        />
      )}

      {/* FIX [A-3] + [BC-1]: Remove task button with aria-label and hover state */}
      {editMode && (
        <button
          onClick={() => onRemoveTask(phaseId, task.id)}
          onMouseEnter={() => setRemoveHovered(true)}
          onMouseLeave={() => setRemoveHovered(false)}
          title="Eliminar tarea"
          aria-label={`Eliminar tarea: ${task.name}`}
          style={{
            background: 'transparent',
            border: 'none',
            color: removeHovered ? '#ef4444' : '#9ca3af',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0 4px',
            flexShrink: 0,
            transition: 'color 0.15s ease',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};

// ── Shared input style (FIX [A-1]: focus ring via function, no outline: none) ──

function getInputStyle(focused: boolean): React.CSSProperties {
  return {
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '14px',
    color: COLORS.primary,
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
    // FIX [A-1]: visible focus ring instead of outline:none
    boxShadow: focused ? '0 0 0 2px #fbbf24' : 'none',
    outline: focused ? 'none' : undefined,
  };
}

export default GeneraRoadmap;
