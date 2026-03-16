import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';

interface ChangeHistoryEntry {
  id: string;
  school_id: number;
  feature: string;
  action: string;
  changed_fields: string[];
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  user_id: string;
  user_name: string;
  created_at: string;
}

interface ChangeHistorySectionProps {
  schoolId: number;
  feature: 'transversal_context' | 'migration_plan' | 'context_responses';
  fieldLabels?: Record<string, string>;
}

const PAGE_SIZE = 10;

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs < 0) return 'hace un momento';
  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
  if (diffHours < 24) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  if (diffDays < 30) return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;

  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFieldName(field: string, fieldLabels?: Record<string, string>): string {
  if (fieldLabels && fieldLabels[field]) return fieldLabels[field];
  return field;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function actionLabel(action: string): string {
  switch (action) {
    case 'initial_save': return 'Registro inicial';
    case 'update': return 'Actualización';
    case 'delete': return 'Eliminación';
    default: return action;
  }
}

const ChangeHistorySection: React.FC<ChangeHistorySectionProps> = ({
  schoolId,
  feature,
  fieldLabels,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<ChangeHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const fetchHistory = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/school/change-history?school_id=${schoolId}&feature=${feature}&limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setEntries(data.history || []);
        } else {
          setEntries(prev => [...prev, ...(data.history || [])]);
        }
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error('Error fetching change history:', err);
      setError(true);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [schoolId, feature]);

  const handleToggle = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand && !initialLoaded) {
      fetchHistory(0);
    }
  };

  const handleLoadMore = () => {
    fetchHistory(entries.length);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white mt-6">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <Clock className="h-4 w-4 text-brand_primary/60" />
          <span className="text-sm font-medium text-brand_primary">
            Historial de cambios
          </span>
          {expanded && total > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand_primary/10 text-brand_primary">
              {total}
            </span>
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {loading && entries.length === 0 ? (
            // Loading skeleton
            <div className="space-y-3 pt-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-gray-200 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-400 py-4 text-center">
              Error al cargar el historial. Intente de nuevo.
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No hay cambios registrados aún
            </p>
          ) : (
            <div className="space-y-0 pt-1">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex gap-3 py-3 border-b border-gray-50 last:border-b-0"
                >
                  {/* Timeline dot */}
                  <div className="w-2 h-2 rounded-full bg-brand_accent mt-1.5 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    {/* Header line */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-brand_primary">
                        {entry.user_name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(entry.created_at)}
                      </span>
                    </div>

                    {/* Action */}
                    <p className="text-sm text-gray-600 mt-0.5">
                      {actionLabel(entry.action)}
                    </p>

                    {/* Changed fields with before→after */}
                    {entry.changed_fields && entry.changed_fields.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {entry.changed_fields.map(field => {
                          const prevVal = entry.previous_state?.[field];
                          const newVal = entry.new_state?.[field];
                          const label = formatFieldName(field, fieldLabels);

                          return (
                            <div key={field} className="text-xs text-gray-500">
                              <span className="font-medium">{label}</span>
                              {prevVal !== undefined && newVal !== undefined ? (
                                <>
                                  {': '}
                                  <span className="line-through text-gray-400">
                                    {formatValue(prevVal)}
                                  </span>
                                  {' → '}
                                  <span className="text-brand_primary">
                                    {formatValue(newVal)}
                                  </span>
                                </>
                              ) : newVal !== undefined ? (
                                <>
                                  {': '}
                                  <span className="text-brand_primary">
                                    {formatValue(newVal)}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Load more */}
              {entries.length < total && (
                <div className="pt-2 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="text-sm text-brand_accent hover:text-brand_primary font-medium disabled:opacity-50"
                  >
                    {loading ? 'Cargando...' : 'Ver más'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChangeHistorySection;
