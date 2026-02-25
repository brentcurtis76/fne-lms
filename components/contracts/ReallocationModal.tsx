import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface Bucket {
  hour_type_key: string;
  display_name: string;
  allocated: number;
  reserved: number;
  consumed: number;
  available: number;
  is_fixed: boolean;
  annex_hours: number;
}

interface ReallocationModalProps {
  contratoId: string;
  buckets: Bucket[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReallocationModal({
  contratoId,
  buckets,
  onClose,
  onSuccess,
}: ReallocationModalProps) {
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ACC-2: Focus the "from" select when modal opens
  const fromSelectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (fromSelectRef.current) {
      fromSelectRef.current.focus();
    }
  }, []);

  // Exclude online_learning from both dropdowns
  const eligibleBuckets = buckets.filter((b) => b.hour_type_key !== 'online_learning');
  const fromBuckets = eligibleBuckets.filter((b) => b.available > 0);
  const toBuckets = eligibleBuckets.filter((b) => b.hour_type_key !== fromKey);

  const selectedFrom = buckets.find((b) => b.hour_type_key === fromKey);
  const maxHours = selectedFrom?.available ?? 0;
  const hoursNum = parseFloat(hours) || 0;

  const isValid =
    fromKey &&
    toKey &&
    fromKey !== toKey &&
    hoursNum > 0 &&
    hoursNum <= maxHours &&
    reason.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/contracts/${contratoId}/hours/reallocate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_hour_type_key: fromKey,
          to_hour_type_key: toKey,
          hours: hoursNum,
          reason: reason.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json?.error || 'Error al redistribuir las horas');
        return;
      }

      toast.success('Horas redistribuidas correctamente');
      onSuccess();
    } catch {
      toast.error('Error inesperado al redistribuir las horas');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // ACC-4: z-[60] to avoid z-index conflicts with parent modals
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      {/* ACC-1: dialog ARIA attributes */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="realloc-modal-title"
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-6">
            <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <ArrowLeftRight className="text-brand_primary" size={20} />
            </div>
            <div>
              {/* ACC-1: id on modal title */}
              <h3 id="realloc-modal-title" className="text-lg font-semibold text-gray-900">
                Redistribuir Horas
              </h3>
              <p className="text-sm text-gray-500">Mover horas entre categorías de servicio</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* From dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría de origen
              </label>
              {/* BC-3/ACC-3: focus:ring-brand_accent focus:ring-offset-2; BC-5: rounded-md */}
              <select
                ref={fromSelectRef}
                value={fromKey}
                onChange={(e) => {
                  setFromKey(e.target.value);
                  if (toKey === e.target.value) setToKey('');
                  setHours('');
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
                required
              >
                <option value="">Seleccione una categoría</option>
                {fromBuckets.map((b) => (
                  <option key={b.hour_type_key} value={b.hour_type_key}>
                    {b.display_name} ({b.available.toFixed(1)} h disponibles)
                  </option>
                ))}
              </select>
              {fromBuckets.length === 0 && (
                <p className="text-xs text-red-600 mt-1">
                  No hay categorías con horas disponibles para redistribuir.
                </p>
              )}
            </div>

            {/* To dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoría de destino
              </label>
              {/* BC-3/ACC-3: focus:ring-brand_accent focus:ring-offset-2; BC-5: rounded-md */}
              <select
                value={toKey}
                onChange={(e) => setToKey(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
                required
                disabled={!fromKey}
              >
                <option value="">Seleccione una categoría</option>
                {toBuckets.map((b) => (
                  <option key={b.hour_type_key} value={b.hour_type_key}>
                    {b.display_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Hours input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Horas a redistribuir
              </label>
              {/* BC-3/ACC-3: focus:ring-brand_accent focus:ring-offset-2; BC-5: rounded-md */}
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={maxHours}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
                placeholder="0.00"
                required
                disabled={!fromKey}
              />
              {fromKey && (
                <p className="text-xs text-gray-500 mt-1">
                  Máximo disponible en origen: {maxHours.toFixed(2)} h
                </p>
              )}
              {hoursNum > maxHours && maxHours > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  Las horas exceden el disponible en la categoría de origen.
                </p>
              )}
            </div>

            {/* Reason textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motivo de redistribución
              </label>
              {/* BC-3/ACC-3: focus:ring-brand_accent focus:ring-offset-2; BC-5: rounded-md */}
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 resize-none"
                placeholder="Explique el motivo de esta redistribución (mínimo 10 caracteres)..."
                required
              />
              <p className={`text-xs mt-1 ${reason.trim().length >= 10 ? 'text-gray-500' : 'text-amber-600'}`}>
                {reason.trim().length} / 10 caracteres mínimos
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex space-x-3 justify-end pt-2">
              {/* BC-5: rounded-md */}
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              {/* BC-2: yellow primary action; BC-5: rounded-md */}
              <button
                type="submit"
                disabled={!isValid || submitting}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-colors ${
                  isValid && !submitting
                    ? 'bg-brand_accent text-brand_primary hover:bg-brand_accent_hover font-semibold'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_primary"></div>
                    <span>Procesando...</span>
                  </>
                ) : (
                  <>
                    <ArrowLeftRight size={16} />
                    <span>Confirmar Redistribución</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
