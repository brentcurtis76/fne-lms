import React, { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, ChevronUp, User, BookOpen, Route, Clock, Loader2 } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  action: 'assigned' | 'unassigned';
  entity_type: 'user' | 'community_workspace';
  entity_id: string;
  content_type: 'course' | 'learning_path';
  content_id: string;
  source: 'direct' | 'learning_path';
  source_learning_path_id: string | null;
  performed_by: string;
  performed_at: string;
  metadata: Record<string, any>;
  // Enriched fields
  performerName: string | null;
  performerEmail: string | null;
  entityName: string | null;
  contentTitle: string | null;
  sourceLPName: string | null;
}

interface AuditLogSectionProps {
  // 'user' for individual users, 'community_workspace' for workspace/group assignments
  entityType?: 'user' | 'community_workspace';
  entityId?: string;
  contentType?: 'course' | 'learning_path';
  contentId?: string;
  refreshTrigger?: number;
}

/**
 * AuditLogSection - Displays assignment history
 *
 * Can be filtered by:
 * - Entity (user, community_workspace)
 * - Content (course, learning path)
 *
 * Shows collapsible history of assign/unassign actions.
 */
export function AuditLogSection({
  entityType,
  entityId,
  contentType,
  contentId,
  refreshTrigger
}: AuditLogSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const fetchLogs = useCallback(async () => {
    if (!isExpanded) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      if (entityType && entityId) {
        params.set('entityType', entityType);
        params.set('entityId', entityId);
      }

      if (contentType && contentId) {
        params.set('contentType', contentType);
        params.set('contentId', contentId);
      }

      const response = await fetch(`/api/admin/assignment-matrix/audit-log?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al cargar historial');
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      setError(err.message || 'Error al cargar historial');
    } finally {
      setLoading(false);
    }
  }, [isExpanded, page, entityType, entityId, contentType, contentId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshTrigger]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [entityType, entityId, contentType, contentId]);

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionText = (log: AuditLogEntry) => {
    const action = log.action === 'assigned' ? 'asigno' : 'desasigno';
    const contentTypeText = log.content_type === 'course' ? 'el curso' : 'la ruta';

    if (log.source === 'learning_path' && log.sourceLPName) {
      return `${action} ${contentTypeText} (via ${log.sourceLPName})`;
    }

    return `${action} ${contentTypeText}`;
  };

  return (
    <div className="border-t border-gray-200 pt-4 mt-4">
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left group"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <History className="h-4 w-4" />
          Historial de Asignaciones
          {total > 0 && (
            <span className="text-xs text-gray-500">({total})</span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
        )}
      </button>

      {/* Content - only shown when expanded */}
      {isExpanded && (
        <div className="mt-3">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              <span className="ml-2 text-sm text-gray-500">Cargando historial...</span>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 py-2">{error}</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-gray-500 py-2 text-center">
              No hay historial de asignaciones
            </div>
          ) : (
            <>
              {/* Log entries */}
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 text-sm"
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 p-1 rounded ${
                      log.action === 'assigned'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {log.content_type === 'course' ? (
                        <BookOpen className="h-3 w-3" />
                      ) : (
                        <Route className="h-3 w-3" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-900">
                        <span className="font-medium">{log.performerName || 'Usuario desconocido'}</span>
                        {' '}
                        <span className="text-gray-600">{getActionText(log)}</span>
                        {' '}
                        <span className="font-medium">{log.contentTitle || 'Contenido desconocido'}</span>
                      </div>

                      {/* Target entity (if different from context) */}
                      {log.entityName && !entityId && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                          <User className="h-3 w-3" />
                          {log.entityName}
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {formatDate(log.performed_at)}
                      </div>

                      {/* Metadata (if any interesting info) */}
                      {log.metadata?.batchSize && log.metadata.batchSize > 1 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          Parte de asignacion masiva ({log.metadata.batchSize} usuarios)
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                    className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-gray-500">
                    Pagina {page} de {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                    className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AuditLogSection;
