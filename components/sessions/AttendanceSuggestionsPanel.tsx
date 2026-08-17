import React, { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type {
  AttendanceSuggestion,
  SuggestionState,
  UnmatchedRow,
} from '../../pages/api/sessions/[id]/attendance-suggestions';

/**
 * Zoom attendance suggestions for the facilitator (Z7-5).
 *
 * The panel PROPOSES; the facilitator CONFIRMS. Applying writes through the
 * existing `PUT /api/sessions/[id]/attendees` — the one authorization decision for
 * attendance mutations — marking only the rows with a definite suggestion.
 *
 * Everything uncertain stays uncertain in the UI: provisional webhook data, open
 * intervals and unmatched participants are es-CL states, and a person the report
 * did not name is suggested absent ONLY when the authoritative report is in.
 */

interface AttendanceSuggestionsPanelProps {
  sessionId: string;
  /** Called after a successful apply so the host page can refetch its attendance. */
  onApplied?: () => void;
}

interface SuggestionsPayload {
  state: SuggestionState;
  provisional: boolean;
  suggestions: AttendanceSuggestion[];
  unmatched_rows: UnmatchedRow[];
}

const STATE_COPY: Record<SuggestionState, string | null> = {
  report: 'Informe de Zoom consolidado',
  webhook_provisional:
    'Datos provisionales (webhook) — el informe de Zoom aún no se consolida; las ausencias no se sugieren todavía',
  none: 'Sin datos de asistencia de Zoom todavía',
  no_meeting: null,
};

const AttendanceSuggestionsPanel: React.FC<AttendanceSuggestionsPanelProps> = ({
  sessionId,
  onApplied,
}) => {
  const [payload, setPayload] = useState<SuggestionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const [applying, setApplying] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/attendance-suggestions`);
      if (response.status === 404) {
        // Not the facilitator (or no session): the panel simply does not exist.
        setVisible(false);
        return;
      }
      if (!response.ok) {
        throw new Error('No se pudieron cargar las sugerencias de asistencia');
      }
      const body = (await response.json()) as { data?: SuggestionsPayload };
      // A payload this component does not recognise hides the panel rather than
      // crashing the whole session page it is embedded in.
      if (
        !body.data ||
        !Array.isArray(body.data.suggestions) ||
        !Array.isArray(body.data.unmatched_rows)
      ) {
        setVisible(false);
        return;
      }
      setPayload(body.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado');
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  if (!visible) return null;

  if (loading) {
    return (
      <section
        data-testid="attendance-suggestions-panel"
        className="mt-4 rounded-lg border border-gray-200 bg-white p-4"
      >
        <p className="text-sm text-gray-500">Cargando sugerencias de Zoom…</p>
      </section>
    );
  }

  if (!payload || payload.state === 'no_meeting') {
    // No managed meeting: nothing to suggest, and silence beats an empty box.
    return null;
  }

  const definite = payload.suggestions.filter(
    (suggestion) => suggestion.suggestion !== 'no_data'
  );

  const applySuggestions = async () => {
    setApplying(true);
    try {
      const attendees = definite.map((suggestion) => ({
        user_id: suggestion.user_id,
        attended: suggestion.suggestion === 'present',
      }));
      const response = await fetch(`/api/sessions/${sessionId}/attendees`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendees }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'No se pudo aplicar la asistencia sugerida');
      }
      toast.success('Asistencia sugerida aplicada');
      onApplied?.();
      await fetchSuggestions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado');
    } finally {
      setApplying(false);
    }
  };

  const stateCopy = STATE_COPY[payload.state];

  return (
    <section
      data-testid="attendance-suggestions-panel"
      className="mt-4 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
        <Users className="h-4 w-4 text-gray-500" aria-hidden="true" />
        Sugerencias de asistencia (Zoom)
      </h2>
      {stateCopy && (
        <p
          data-testid="attendance-suggestions-state"
          className={`mt-1 text-xs ${payload.provisional ? 'text-blue-700' : 'text-gray-600'}`}
        >
          {stateCopy}
        </p>
      )}

      <ul className="mt-3 space-y-1" data-testid="attendance-suggestions-list">
        {payload.suggestions.map((suggestion) => (
          <li
            key={suggestion.user_id}
            data-testid={`attendance-suggestion-${suggestion.user_id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1 text-sm text-gray-800"
          >
            <span>{suggestion.name ?? 'Participante'}</span>
            <span className="flex items-center gap-2 text-xs">
              {suggestion.suggestion === 'present' && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  Presente
                  {suggestion.observed_minutes !== null
                    ? ` · ${suggestion.observed_minutes} min`
                    : ''}
                </span>
              )}
              {suggestion.suggestion === 'absent' && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                  Ausente según informe
                </span>
              )}
              {suggestion.suggestion === 'no_data' && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                  Sin datos
                </span>
              )}
              {suggestion.has_open_interval && (
                <span
                  data-testid={`attendance-open-${suggestion.user_id}`}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700"
                >
                  Sin salida registrada
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {payload.unmatched_rows.length > 0 && (
        <div className="mt-3" data-testid="attendance-unmatched">
          <h3 className="text-xs font-semibold text-gray-700">
            Participantes sin identificar (confirmar a mano)
          </h3>
          <ul className="mt-1 space-y-1">
            {payload.unmatched_rows.map((row, index) => (
              <li key={`${row.display_name ?? 'anon'}-${index}`} className="text-xs text-gray-600">
                {row.display_name ?? 'Sin nombre'}
                {row.observed_minutes !== null ? ` · ${row.observed_minutes} min` : ''}
                {row.has_open_interval ? ' · sin salida registrada' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        data-testid="attendance-apply-suggestions"
        disabled={applying || definite.length === 0}
        onClick={() => void applySuggestions()}
        className="mt-3 rounded-md bg-brand_primary px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {applying
          ? 'Aplicando…'
          : `Aplicar sugerencias (${definite.length})`}
      </button>
      <p className="mt-1 text-xs text-gray-500">
        Solo se aplican las filas con sugerencia definida; el resto queda para marcar a mano.
      </p>
    </section>
  );
};

export default AttendanceSuggestionsPanel;
