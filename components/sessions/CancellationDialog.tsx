import React, { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import {
  evaluateCancellationClause,
  calculateNoticeHours,
} from '../../lib/services/hour-tracking';
import {
  CancellationClauseResult,
  CancelledByParty,
} from '../../lib/types/hour-tracking.types';
import { ConsultorSession } from '../../lib/types/consultor-sessions.types';

interface CancellationDialogProps {
  session: ConsultorSession;
  hourTypeModality?: 'online' | 'presencial';
  onClose: () => void;
  onConfirm: (params: {
    cancellation_reason: string;
    cancelled_by: CancelledByParty;
    is_force_majeure: boolean;
    admin_override_status?: 'devuelta' | 'penalizada';
    admin_override_reason?: string;
  }) => Promise<void>;
  submitting: boolean;
}

const CancellationDialog: React.FC<CancellationDialogProps> = ({
  session,
  hourTypeModality,
  onClose,
  onConfirm,
  submitting,
}) => {
  const [cancelledBy, setCancelledBy] = useState<CancelledByParty>('school');
  const [reason, setReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [overrideActive, setOverrideActive] = useState(false);
  const [overrideStatus, setOverrideStatus] = useState<'devuelta' | 'penalizada'>('devuelta');
  const [overrideReason, setOverrideReason] = useState('');
  const [clauseResult, setClauseResult] = useState<CancellationClauseResult | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Determine if session has hour tracking
  const hasHourTracking = !!(session.hour_type_key && session.contrato_id);

  // Spanish clause labels
  const clauseLabels: Record<string, string> = {
    clause_1: 'Cláusula 1', clause_2: 'Cláusula 2',
    clause_3: 'Cláusula 3', clause_4: 'Cláusula 4',
    clause_5: 'Cláusula 5', clause_6: 'Cláusula 6',
  };

  // Focus trap and initial focus
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  // Recalculate clause whenever inputs change
  useEffect(() => {
    if (!hasHourTracking) return;

    const noticeHours = session.session_date && session.start_time
      ? calculateNoticeHours(session.session_date, session.start_time)
      : 0;

    const effectiveCancelledBy: CancelledByParty =
      cancelledBy === 'force_majeure' ? 'force_majeure' : cancelledBy;

    // Use hour type modality (from DB) when available, fall back to session modality
    const effectiveModality = hourTypeModality || session.modality;

    const result = evaluateCancellationClause(
      effectiveModality,
      effectiveCancelledBy,
      noticeHours
    );
    setClauseResult(result);
  }, [cancelledBy, session, hasHourTracking, hourTypeModality]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) return;
    if (overrideActive && !overrideReason.trim()) return;

    await onConfirm({
      cancellation_reason: reason.trim(),
      cancelled_by: cancelledBy,
      is_force_majeure: cancelledBy === 'force_majeure',
      admin_override_status: overrideActive ? overrideStatus : undefined,
      admin_override_reason: overrideActive ? overrideReason.trim() : undefined,
    });
  };

  const getFinalLedgerStatus = (): 'devuelta' | 'penalizada' | null => {
    if (!clauseResult) return null;
    if (overrideActive) return overrideStatus;
    return clauseResult.ledger_status;
  };

  const finalStatus = getFinalLedgerStatus();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancellation-dialog-title"
        tabIndex={-1}
        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 id="cancellation-dialog-title" className="text-lg font-semibold text-gray-900">Cancelar Sesión</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 rounded"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Session info */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">
            <p className="font-medium">{session.title}</p>
            <p className="text-gray-500 mt-1">
              {session.session_date} — {session.start_time?.slice(0, 5)} a {session.end_time?.slice(0, 5)}
            </p>
          </div>

          {/* Quien cancela? */}
          {hasHourTracking && (
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-3">
                ¿Quién cancela? <span className="text-red-500">*</span>
              </legend>
              <div className="space-y-2">
                {([
                  { value: 'school', label: 'Colegio' },
                  { value: 'fne', label: 'FNE' },
                  { value: 'force_majeure', label: 'Fuerza Mayor' },
                ] as { value: CancelledByParty; label: string }[]).map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="cancelled_by"
                      value={value}
                      checked={cancelledBy === value}
                      onChange={() => setCancelledBy(value)}
                      className="w-4 h-4 text-brand_accent border-gray-300 focus:ring-brand_accent"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Motivo de cancelación <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Explique el motivo de la cancelación..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent resize-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">{reason.length}/1000 caracteres</p>
          </div>

          {/* Resultado auto-calculado (solo si hay seguimiento de horas) */}
          {hasHourTracking && clauseResult && (
            <div
              aria-live="polite"
              aria-atomic="true"
              className={`rounded-lg p-4 border ${
                finalStatus === 'penalizada'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-green-50 border-green-200'
              }`}
            >
              <h4 className="text-sm font-semibold text-gray-900 mb-2">
                Resultado calculado — {clauseLabels[clauseResult.clause] ?? clauseResult.clause}
              </h4>
              <p className="text-sm text-gray-700">{clauseResult.description_es}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-full font-medium ${
                    finalStatus === 'penalizada'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  Estado de horas:{' '}
                  {overrideActive
                    ? `${overrideStatus} (anulación admin)`
                    : clauseResult.ledger_status}
                </span>
                {clauseResult.rescheduling_deadline_days !== null && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
                    Reprogramar en: {clauseResult.rescheduling_deadline_days} días
                  </span>
                )}
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-full font-medium ${
                    clauseResult.consultant_paid
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Consultor: {clauseResult.consultant_paid ? 'con derecho a pago' : 'sin pago'}
                </span>
              </div>
            </div>
          )}

          {/* Admin override section (collapsible) */}
          {hasHourTracking && (
            <div className="border border-gray-200 rounded-lg">
              <button
                type="button"
                onClick={() => setShowOverride(!showOverride)}
                aria-expanded={showOverride}
                aria-controls="admin-override-section"
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 rounded"
              >
                <span className="font-medium">Anulación administrativa (opcional)</span>
                {showOverride ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {showOverride && (
                <div id="admin-override-section" className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overrideActive}
                      onChange={(e) => setOverrideActive(e.target.checked)}
                      className="w-4 h-4 text-brand_accent border-gray-300 rounded focus:ring-brand_accent"
                    />
                    <span className="text-sm text-gray-700">
                      Anular el resultado calculado automáticamente
                    </span>
                  </label>

                  {overrideActive && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Estado de horas <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={overrideStatus}
                          onChange={(e) =>
                            setOverrideStatus(e.target.value as 'devuelta' | 'penalizada')
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                        >
                          <option value="devuelta">Devuelta (sin penalización)</option>
                          <option value="penalizada">Penalizada</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Razón de la anulación <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          maxLength={500}
                          rows={2}
                          placeholder="Explique por qué está anulando el resultado automático..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent resize-none"
                          required={overrideActive}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !reason.trim() ||
                (overrideActive && !overrideReason.trim())
              }
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? 'Cancelando...' : 'Confirmar Cancelación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CancellationDialog;
