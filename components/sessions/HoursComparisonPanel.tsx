import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { HoursComparisonPayload } from '../../pages/api/admin/sessions/[id]/hours-comparison';

/**
 * The §11 comparison panel + «Ajustar horas descontadas» (Z7-5, admin only).
 *
 * Comparison is COMPARISON: the numbers here never change billing by being looked
 * at. The one mutation is the override form below, which calls the admin-gated
 * endpoint backed by `apply_session_hour_override` — and the §11 banner states the
 * invariant in the UI itself.
 *
 * States render as states (plan §15.3.9 / the carried Z7-2 item): a meeting still
 * open, webhook-only provisional data, or an interval with no recorded leave is es-CL
 * TEXT, never a number invented to fill a cell.
 */

interface HoursComparisonPanelProps {
  sessionId: string;
}

export const OVERRIDE_CATEGORY_LABELS: Record<string, string> = {
  consultant_shortfall: 'Presencia parcial del consultor',
  school_request: 'Solicitud del colegio',
  technical_failure: 'Falla técnica',
  other: 'Otro',
};

/** ≥15% mismatch = review flag (§11) — a highlight, never an action. */
export function isMismatchFlagged(plannedMinutes: number, observedMinutes: number): boolean {
  if (plannedMinutes <= 0) return false;
  return Math.abs(plannedMinutes - observedMinutes) / plannedMinutes >= 0.15;
}

function formatMinutes(minutes: number | null): string {
  return minutes === null ? '—' : `${minutes} min`;
}

const HoursComparisonPanel: React.FC<HoursComparisonPanelProps> = ({ sessionId }) => {
  const [payload, setPayload] = useState<HoursComparisonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The override form. `requestId` is minted when the form opens and survives a
  // failed submit, so a retry of the same intent is idempotent at the RPC.
  const [formOpen, setFormOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('consultant_shortfall');
  const [requestId, setRequestId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}/hours-comparison`);
      if (!response.ok) {
        throw new Error('No se pudo cargar la comparación de horas');
      }
      const body = (await response.json()) as { data: HoursComparisonPayload };
      setPayload(body.data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchComparison();
  }, [fetchComparison]);

  const lead = useMemo(
    () => payload?.facilitator_presence.find((facilitator) => facilitator.is_lead) ?? null,
    [payload]
  );

  const submitOverride = async (reversesOverrideId: string | null) => {
    if (!payload) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        reason: reason.trim(),
        reason_category: category,
        request_id: requestId || crypto.randomUUID(),
        reverses_override_id: reversesOverrideId,
      };
      if (reversesOverrideId === null) {
        body.new_minutes = Number(minutes);
      }
      const response = await fetch(`/api/admin/sessions/${sessionId}/hour-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const responseBody = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(responseBody.error || 'No se pudo aplicar el ajuste');
      }
      toast.success(
        reversesOverrideId ? 'Ajuste revertido correctamente' : 'Horas ajustadas correctamente'
      );
      setFormOpen(false);
      setMinutes('');
      setReason('');
      setRequestId('');
      await fetchComparison();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section data-testid="hours-comparison-panel" className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Cargando comparación de horas…</p>
      </section>
    );
  }

  if (loadError || !payload) {
    return (
      <section data-testid="hours-comparison-panel" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{loadError ?? 'Error inesperado'}</p>
      </section>
    );
  }

  const planned = payload.planned_minutes;
  const presence = lead?.observed_minutes ?? null;
  const delta = planned !== null && presence !== null ? presence - planned : null;
  const deltaPct = planned && delta !== null ? Math.round((delta / planned) * 100) : null;
  const flagged = planned !== null && presence !== null && isMismatchFlagged(planned, presence);

  const effectiveMinutes = payload.ledger?.effective_minutes ?? null;
  const canOverride = payload.ledger?.status === 'consumida';

  // The latest unreversed APPLY is the only reversible event.
  const reversedIds = new Set(
    payload.overrides
      .map((override) => override.reverses_override_id)
      .filter((value): value is string => value !== null)
  );
  const reversible = [...payload.overrides]
    .reverse()
    .find((override) => override.reverses_override_id === null && !reversedIds.has(override.id));

  return (
    <section
      data-testid="hours-comparison-panel"
      className="mt-6 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <Clock className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Horas: planificado vs. Zoom
      </h2>

      {/* The §11 invariant, stated where the numbers are read. */}
      <p
        data-testid="hours-invariant-banner"
        className="mt-1 text-xs text-gray-600"
      >
        Las horas descontadas siguen siendo las planificadas salvo ajuste manual.
      </p>

      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md bg-gray-50 p-3">
          <dt className="text-xs text-gray-500">Planificado</dt>
          <dd data-testid="hours-planned" className="text-lg font-semibold text-gray-900">
            {formatMinutes(planned)}
          </dd>
        </div>
        <div className="rounded-md bg-gray-50 p-3">
          <dt className="text-xs text-gray-500">Zoom (reunión)</dt>
          <dd data-testid="hours-zoom-elapsed" className="text-lg font-semibold text-gray-900">
            {payload.zoom.state === 'none' && 'Sin reunión Zoom'}
            {payload.zoom.state === 'live' && 'Reunión en curso'}
            {payload.zoom.state === 'ended' && formatMinutes(payload.zoom.elapsed_minutes)}
          </dd>
        </div>
        <div className={`rounded-md p-3 ${flagged ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-gray-50'}`}>
          <dt className="text-xs text-gray-500">Zoom (presencia facilitador)</dt>
          <dd data-testid="hours-presence" className="text-lg font-semibold text-gray-900">
            {lead === null
              ? 'Sin facilitador principal'
              : presence === null
                ? 'Sin datos de presencia'
                : formatMinutes(presence)}
          </dd>
          {delta !== null && (
            <p data-testid="hours-delta" className={`text-xs ${flagged ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
              Δ {delta > 0 ? '+' : ''}
              {delta} min{deltaPct !== null ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct}%)` : ''}
              {flagged ? ' · revisar' : ''}
            </p>
          )}
        </div>
      </dl>

      {/* States, never fabricated numbers. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {payload.attendance.state === 'webhook_provisional' && (
          <span
            data-testid="hours-provisional-badge"
            className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
          >
            Datos provisionales (webhook) — el informe de Zoom aún no se consolida
          </span>
        )}
        {payload.attendance.state === 'none' && payload.zoom.state !== 'none' && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            Sin datos de asistencia todavía
          </span>
        )}
        {payload.attendance.has_open_intervals && (
          <span
            data-testid="hours-open-badge"
            className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
          >
            Hay intervalos sin salida registrada — presencia incompleta
          </span>
        )}
        {lead?.has_open_interval && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
            El facilitador tiene un intervalo abierto
          </span>
        )}
      </div>

      {/* The current billable value. */}
      <div className="mt-3 text-sm text-gray-700" data-testid="hours-effective">
        {effectiveMinutes === null && 'Horas descontadas: valor planificado'}
        {effectiveMinutes === 0 && (
          <span className="font-semibold text-emerald-700">Sesión eximida (0 min descontados)</span>
        )}
        {effectiveMinutes !== null && effectiveMinutes > 0 && (
          <span>
            Horas descontadas ajustadas: <strong>{effectiveMinutes} min</strong>
          </span>
        )}
      </div>

      {/* «Ajustar horas descontadas» */}
      <div className="mt-4">
        <button
          type="button"
          data-testid="override-open-button"
          disabled={!canOverride}
          onClick={() => {
            setFormOpen((open) => !open);
            setRequestId(crypto.randomUUID());
          }}
          className="rounded-md bg-brand_primary px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Ajustar horas descontadas
        </button>
        {!canOverride && (
          <p className="mt-1 text-xs text-gray-500">
            Disponible cuando la sesión esté finalizada (horas consumidas).
          </p>
        )}

        {formOpen && canOverride && (
          <form
            data-testid="override-form"
            className="mt-3 space-y-3 rounded-md border border-gray-200 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitOverride(null);
            }}
          >
            <div>
              <label htmlFor="override-minutes" className="block text-xs font-medium text-gray-700">
                Minutos a descontar (0 = sesión eximida)
              </label>
              <input
                id="override-minutes"
                data-testid="override-minutes-input"
                type="number"
                min={0}
                step={1}
                required
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className="mt-1 w-32 rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Valor anterior: {effectiveMinutes === null ? 'planificado' : `${effectiveMinutes} min`}
              </p>
            </div>
            <div>
              <label htmlFor="override-category" className="block text-xs font-medium text-gray-700">
                Categoría del motivo
              </label>
              <select
                id="override-category"
                data-testid="override-category-select"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
              >
                {Object.entries(OVERRIDE_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="override-reason" className="block text-xs font-medium text-gray-700">
                Motivo (obligatorio)
              </label>
              <textarea
                id="override-reason"
                data-testid="override-reason-input"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <button
              type="submit"
              data-testid="override-submit"
              disabled={submitting || reason.trim() === '' || minutes === ''}
              className="rounded-md bg-brand_primary px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {submitting ? 'Aplicando…' : 'Aplicar ajuste'}
            </button>
          </form>
        )}
      </div>

      {/* The audit trail: previous value, new value, admin, timestamp, reason. */}
      {payload.overrides.length > 0 && (
        <div className="mt-4" data-testid="override-history">
          <h3 className="text-sm font-semibold text-gray-900">Historial de ajustes</h3>
          <ul className="mt-2 space-y-2">
            {payload.overrides.map((override) => (
              <li
                key={override.id}
                data-testid={`override-row-${override.id}`}
                className="rounded-md border border-gray-200 p-2 text-xs text-gray-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {override.reverses_override_id !== null && 'Reversión: '}
                    {override.previous_minutes === null ? 'planificado' : `${override.previous_minutes} min`}
                    {' → '}
                    {override.new_minutes === null
                      ? 'planificado'
                      : override.new_minutes === 0
                        ? 'Sesión eximida (0 min)'
                        : `${override.new_minutes} min`}
                  </span>
                  {reversible?.id === override.id && (
                    <button
                      type="button"
                      data-testid={`override-reverse-${override.id}`}
                      disabled={submitting || reason.trim() === ''}
                      onClick={() => void submitOverride(override.id)}
                      className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                      title="Requiere un motivo escrito en el formulario de ajuste"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Revertir
                    </button>
                  )}
                </div>
                <div className="mt-1 text-gray-500">
                  {OVERRIDE_CATEGORY_LABELS[override.reason_category] ?? override.reason_category}
                  {' · '}
                  {override.created_by_name ?? 'Administrador'}
                  {' · '}
                  {new Date(override.created_at).toLocaleString('es-CL')}
                </div>
                <div className="mt-1">{override.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default HoursComparisonPanel;
