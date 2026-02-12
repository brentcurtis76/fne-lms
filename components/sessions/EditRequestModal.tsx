import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { STRUCTURAL_FIELDS, ConsultorSession } from '../../lib/types/consultor-sessions.types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface EditRequestModalProps {
  session: ConsultorSession;
  onClose: () => void;
  onSubmit: (changes: Record<string, { old: unknown; new: unknown }>, reason: string) => Promise<void>;
  submitting: boolean;
}

const EditRequestModal: React.FC<EditRequestModalProps> = ({
  session,
  onClose,
  onSubmit,
  submitting,
}) => {
  // Form state for structural fields
  const [sessionDate, setSessionDate] = useState(session.session_date);
  const [startTime, setStartTime] = useState(session.start_time);
  const [endTime, setEndTime] = useState(session.end_time);
  const [modality, setModality] = useState(session.modality);
  const [reason, setReason] = useState('');

  // Track which fields have changed
  const [changedFields, setChangedFields] = useState<string[]>([]);

  useEffect(() => {
    const changed: string[] = [];
    if (sessionDate !== session.session_date) changed.push('session_date');
    if (startTime !== session.start_time) changed.push('start_time');
    if (endTime !== session.end_time) changed.push('end_time');
    if (modality !== session.modality) changed.push('modality');
    setChangedFields(changed);
  }, [sessionDate, startTime, endTime, modality]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (changedFields.length === 0) {
      return;
    }

    // Build changes object
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (sessionDate !== session.session_date) {
      changes.session_date = { old: session.session_date, new: sessionDate };
    }
    if (startTime !== session.start_time) {
      changes.start_time = { old: session.start_time, new: startTime };
    }
    if (endTime !== session.end_time) {
      changes.end_time = { old: session.end_time, new: endTime };
    }
    if (modality !== session.modality) {
      changes.modality = { old: session.modality, new: modality };
    }

    await onSubmit(changes, reason);
  };

  const formatFieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      session_date: 'Fecha',
      start_time: 'Hora de inicio',
      end_time: 'Hora de término',
      modality: 'Modalidad',
      growth_community_id: 'Comunidad de crecimiento',
      school_id: 'Escuela',
      status: 'Estado',
    };
    return labels[field] || field;
  };

  const formatValue = (field: string, value: unknown): string => {
    if (value === null || value === undefined) return 'No definido';

    if (field === 'session_date') {
      try {
        return format(parseISO(value as string), 'dd MMMM yyyy', { locale: es });
      } catch {
        return value as string;
      }
    }

    if (field === 'modality') {
      const modalityLabels: Record<string, string> = {
        presencial: 'Presencial',
        online: 'En línea',
        hibrida: 'Híbrida',
      };
      return modalityLabels[value as string] || (value as string);
    }

    return value as string;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Solicitar Cambios a la Sesión</h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Cambios estructurales requieren aprobación</p>
              <p>
                Los campos marcados a continuación requieren aprobación del administrador. Los demás campos
                (título, descripción, objetivos, etc.) pueden editarse directamente.
              </p>
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de la sesión</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
            />
          </div>

          {/* Hora de inicio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hora de inicio</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
            />
          </div>

          {/* Hora de término */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Hora de término</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
            />
          </div>

          {/* Modalidad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modalidad</label>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
            >
              <option value="presencial">Presencial</option>
              <option value="online">En línea</option>
              <option value="hibrida">Híbrida</option>
            </select>
          </div>

          {/* Diff Preview */}
          {changedFields.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Cambios propuestos:</h4>
              <div className="space-y-2">
                {changedFields.map((field) => {
                  const oldVal = (session as any)[field];
                  const newVal =
                    field === 'session_date'
                      ? sessionDate
                      : field === 'start_time'
                      ? startTime
                      : field === 'end_time'
                      ? endTime
                      : modality;

                  return (
                    <div key={field} className="text-sm">
                      <div className="font-medium text-gray-700">{formatFieldLabel(field)}:</div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="line-through text-red-600">{formatValue(field, oldVal)}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-600 font-medium">{formatValue(field, newVal)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Razón */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Razón del cambio <span className="text-gray-500">(opcional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explique por qué necesita estos cambios..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || changedFields.length === 0}
              className="px-4 py-2 bg-brand_accent hover:bg-brand_accent_hover text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enviando...' : 'Enviar Solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditRequestModal;
