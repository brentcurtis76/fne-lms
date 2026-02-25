import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, ArrowLeftRight, Trash2, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import ReallocationModal from './ReallocationModal';

// ============================================================
// Warning level helper (shared threshold: <25% = warning, 0 = exhausted)
// ============================================================
function getWarningLevel(available: number, allocated: number): 'healthy' | 'warning' | 'exhausted' {
  if (available <= 0) return 'exhausted';
  if (allocated > 0 && (available / allocated) * 100 < 25) return 'warning';
  return 'healthy';
}

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

interface AllocationRow {
  hour_type_key: string;
  display_name: string;
  modality: 'online' | 'presencial';
  hours: string;
  is_fixed: boolean;
}

interface HourAllocationPanelProps {
  contratoId: string;
  horasContratadas: number;
  isAdmin: boolean;
}

// Default 9 service categories (display_name shown to user)
const DEFAULT_HOUR_TYPES: Omit<AllocationRow, 'hours' | 'is_fixed'>[] = [
  { hour_type_key: 'online_learning', display_name: 'Cursos Online (LMS)', modality: 'online' },
  { hour_type_key: 'asesoria_tecnica_online', display_name: 'Asesoría Técnica Online', modality: 'online' },
  { hour_type_key: 'asesoria_tecnica_presencial', display_name: 'Asesoría Técnica Presencial', modality: 'presencial' },
  { hour_type_key: 'asesoria_directiva_online', display_name: 'Asesoría Directiva Online', modality: 'online' },
  { hour_type_key: 'asesoria_directiva_presencial', display_name: 'Asesoría Directiva Presencial', modality: 'presencial' },
  { hour_type_key: 'gestion_cambio_online', display_name: 'Gestión del Cambio Online', modality: 'online' },
  { hour_type_key: 'gestion_cambio_presencial', display_name: 'Gestión del Cambio Presencial', modality: 'presencial' },
  { hour_type_key: 'talleres_presenciales', display_name: 'Talleres Presenciales', modality: 'presencial' },
  { hour_type_key: 'encuentro_lideres', display_name: 'Encuentro de Líderes', modality: 'presencial' },
];

export default function HourAllocationPanel({
  contratoId,
  horasContratadas,
  isAdmin,
}: HourAllocationPanelProps) {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReallocationModal, setShowReallocationModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Focus ref for delete confirmation modal (ACC-2)
  const deleteCancelBtnRef = useRef<HTMLButtonElement>(null);

  // Allocation form state
  const [allocRows, setAllocRows] = useState<AllocationRow[]>(
    DEFAULT_HOUR_TYPES.map((ht) => ({
      ...ht,
      hours: '0',
      is_fixed: false,
    }))
  );

  const fetchBuckets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contracts/${contratoId}/hours`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err?.error || 'Error al cargar las horas del contrato');
        setLoading(false);
        return;
      }
      const json = await res.json();
      setBuckets(json.data?.buckets || []);
    } catch {
      toast.error('Error inesperado al cargar las horas del contrato');
    } finally {
      setLoading(false);
    }
  }, [contratoId]);

  useEffect(() => {
    fetchBuckets();
  }, [fetchBuckets]);

  // ACC-2: Focus first focusable element when delete confirm modal opens
  useEffect(() => {
    if (showDeleteConfirm && deleteCancelBtnRef.current) {
      deleteCancelBtnRef.current.focus();
    }
  }, [showDeleteConfirm]);

  const totalAllocated = allocRows.reduce((sum, row) => {
    const val = parseFloat(row.hours) || 0;
    return sum + val;
  }, 0);

  const totalMatchesContract = Math.abs(totalAllocated - horasContratadas) < 0.005;

  const handleHoursChange = (key: string, value: string) => {
    setAllocRows((prev) =>
      prev.map((row) => (row.hour_type_key === key ? { ...row, hours: value } : row))
    );
  };

  const handleIsFixedChange = (key: string, value: boolean) => {
    setAllocRows((prev) =>
      prev.map((row) => (row.hour_type_key === key ? { ...row, is_fixed: value } : row))
    );
  };

  const handleSaveAllocation = async () => {
    if (!totalMatchesContract) return;

    setSaving(true);
    try {
      const allocations = allocRows
        .filter((row) => (parseFloat(row.hours) || 0) > 0)
        .map((row) => ({
          hour_type_key: row.hour_type_key,
          hours: parseFloat(row.hours),
          is_fixed: row.hour_type_key === 'online_learning' ? row.is_fixed : false,
        }));

      const res = await fetch(`/api/contracts/${contratoId}/hours/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json?.error || 'Error al guardar la distribución de horas');
        return;
      }

      toast.success('Distribución de horas guardada correctamente');
      await fetchBuckets();
    } catch {
      toast.error('Error inesperado al guardar la distribución de horas');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllocation = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contracts/${contratoId}/hours/allocate`, {
        method: 'DELETE',
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json?.error || 'Error al eliminar la distribución de horas');
        return;
      }

      toast.success('Distribución de horas eliminada correctamente');
      setShowDeleteConfirm(false);
      await fetchBuckets();
    } catch {
      toast.error('Error inesperado al eliminar la distribución de horas');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-brand_primary border-b pb-2">
          Distribución de Horas
        </h3>
        <div className="bg-gray-50 p-4 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand_primary mr-3"></div>
          <span className="text-gray-600">Cargando distribución de horas...</span>
        </div>
      </div>
    );
  }

  const hasAllocations = buckets.length > 0;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-brand_primary border-b pb-2 flex items-center space-x-2">
        <Clock size={20} />
        <span>Distribución de Horas</span>
        <span className="text-sm font-normal text-gray-500 ml-2">
          ({horasContratadas} horas contratadas)
        </span>
      </h3>

      {/* State 1: No allocations + admin → allocation form */}
      {!hasAllocations && isAdmin && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Distribuya las {horasContratadas} horas contratadas entre las categorías de servicio.
          </p>
          <div className="bg-gray-50 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-brand_primary">
                    Categoría
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-brand_primary w-32">
                    Horas
                  </th>
                </tr>
              </thead>
              <tbody>
                {allocRows.map((row) => (
                  <tr key={row.hour_type_key} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        {/* ACC-6: aria-hidden on modality emoji */}
                        <span aria-hidden="true" className="text-base">
                          {row.modality === 'online' ? '🖥️' : '🏫'}
                        </span>
                        <span className="text-sm text-gray-800">{row.display_name}</span>
                        {/* ID-1: is_fixed checkbox for online_learning */}
                        {row.hour_type_key === 'online_learning' && (
                          <label className="flex items-center space-x-1 ml-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={row.is_fixed}
                              onChange={(e) => handleIsFixedChange(row.hour_type_key, e.target.checked)}
                              className="rounded border-gray-300 text-brand_accent focus:ring-brand_accent focus:ring-offset-2"
                            />
                            <span className="text-xs text-gray-600">Horas fijas</span>
                          </label>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.hours}
                        onChange={(e) => handleHoursChange(row.hour_type_key, e.target.value)}
                        className="w-full text-right border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`border-t-2 ${totalMatchesContract ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                  <td className="px-4 py-3 font-semibold text-sm">Total distribuido</td>
                  {/* ID-2: toFixed(2) and "h" suffix */}
                  <td className={`px-4 py-3 text-right font-bold text-sm ${totalMatchesContract ? 'text-green-700' : 'text-red-700'}`}>
                    {totalAllocated.toFixed(2)} h / {horasContratadas.toFixed(2)} h
                    {!totalMatchesContract && (
                      <span className="ml-1 text-xs font-normal">
                        ({totalAllocated > horasContratadas ? '+' : ''}
                        {(totalAllocated - horasContratadas).toFixed(2)})
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end">
            {/* BC-2: yellow primary action button; BC-5: rounded-md */}
            <button
              onClick={handleSaveAllocation}
              disabled={!totalMatchesContract || saving}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-colors ${
                totalMatchesContract && !saving
                  ? 'bg-brand_accent text-brand_primary hover:bg-brand_accent_hover font-semibold'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand_primary"></div>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Clock size={16} />
                  <span>Guardar Distribución</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* State 2: No allocations + non-admin → pending message */}
      {!hasAllocations && !isAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Clock className="text-yellow-600" size={20} />
            <p className="text-sm text-yellow-800 font-medium">
              Horas pendientes de distribución
            </p>
          </div>
          <p className="text-sm text-yellow-700 mt-2">
            Las {horasContratadas} horas contratadas aún no han sido distribuidas por el administrador.
          </p>
        </div>
      )}

      {/* State 3: Allocations exist → summary view */}
      {hasAllocations && (
        <div className="space-y-3">
          {buckets.map((bucket) => {
            const total = bucket.allocated + (bucket.annex_hours || 0);
            const consumedPct = total > 0 ? (bucket.consumed / total) * 100 : 0;
            const reservedPct = total > 0 ? (bucket.reserved / total) * 100 : 0;
            const availablePct = total > 0 ? (bucket.available / total) * 100 : 0;
            const warningLevel = getWarningLevel(bucket.available, total);

            // Available segment color: healthy=gray-300, warning=yellow-100, exhausted=red-100
            const availableBarClass =
              warningLevel === 'exhausted'
                ? 'bg-red-100'
                : warningLevel === 'warning'
                ? 'bg-yellow-100'
                : 'bg-gray-300';

            // "Disponibles" legend text color
            const availableLegendClass =
              warningLevel === 'exhausted'
                ? 'text-red-600'
                : warningLevel === 'warning'
                ? 'text-yellow-600'
                : 'text-gray-500';

            return (
              <div key={bucket.hour_type_key} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {/* ACC-6: aria-hidden on modality emoji */}
                    <span aria-hidden="true" className="text-sm">
                      {bucket.hour_type_key.includes('online') ? '🖥️' : '🏫'}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{bucket.display_name}</span>
                    {/* BC-4: brand_accent badge; GENERA-4: brackets format */}
                    {bucket.annex_hours > 0 && (
                      <span className="text-xs bg-brand_accent text-brand_primary px-2 py-0.5 rounded-full font-medium">
                        [+{bucket.annex_hours} del Anexo]
                      </span>
                    )}
                    {warningLevel === 'exhausted' && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        Agotado
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${warningLevel === 'exhausted' ? 'text-red-600' : warningLevel === 'warning' ? 'text-yellow-600' : 'text-brand_primary'}`}>
                      {bucket.available.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-500"> / {total.toFixed(1)} h disponibles</span>
                  </div>
                </div>
                {/* ACC-5: aria-label on progress bar */}
                <div
                  role="img"
                  aria-label={`Progreso: ${bucket.consumed.toFixed(1)} h consumidas, ${bucket.reserved.toFixed(1)} h reservadas, ${bucket.available.toFixed(1)} h disponibles de ${total.toFixed(1)} h totales`}
                  className="h-2 rounded-full bg-gray-200 overflow-hidden flex"
                >
                  {consumedPct > 0 && (
                    <div
                      className="h-full bg-brand_primary"
                      style={{ width: `${consumedPct}%` }}
                      title={`Consumidas: ${bucket.consumed.toFixed(1)} h`}
                    />
                  )}
                  {reservedPct > 0 && (
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${reservedPct}%` }}
                      title={`Reservadas: ${bucket.reserved.toFixed(1)} h`}
                    />
                  )}
                  {availablePct > 0 && (
                    <div
                      className={`h-full ${availableBarClass}`}
                      style={{ width: `${availablePct}%` }}
                      title={`Disponibles: ${bucket.available.toFixed(1)} h`}
                    />
                  )}
                </div>
                <div className="flex items-center space-x-3 mt-1">
                  <span className="flex items-center space-x-1 text-xs text-gray-500">
                    <span className="inline-block w-2 h-2 rounded-full bg-brand_primary"></span>
                    <span>Consumidas {bucket.consumed.toFixed(1)} h</span>
                  </span>
                  <span className="flex items-center space-x-1 text-xs text-gray-500">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Reservadas {bucket.reserved.toFixed(1)} h</span>
                  </span>
                  <span className={`flex items-center space-x-1 text-xs ${availableLegendClass}`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${availableBarClass}`}></span>
                    <span>Disponibles {bucket.available.toFixed(1)} h</span>
                  </span>
                </div>
              </div>
            );
          })}

          {/* Admin action buttons — RD-2: flex-wrap for mobile */}
          {isAdmin && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
              {/* CSV Export button */}
              <a
                href={`/api/contracts/${contratoId}/hours/ledger/csv`}
                download
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Download size={16} />
                <span>Exportar CSV</span>
              </a>
              {/* BC-1: brand_accent; BC-5: rounded-md */}
              <button
                onClick={() => setShowReallocationModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-brand_accent text-brand_primary rounded-md hover:bg-brand_accent_hover transition-colors text-sm font-medium"
              >
                <ArrowLeftRight size={16} />
                <span>Redistribuir Horas</span>
              </button>
              {/* BC-5: rounded-md */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors text-sm font-medium"
              >
                <Trash2 size={16} />
                <span>Eliminar Distribución</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reallocation Modal */}
      {showReallocationModal && (
        <ReallocationModal
          contratoId={contratoId}
          buckets={buckets}
          onClose={() => setShowReallocationModal(false)}
          onSuccess={() => {
            setShowReallocationModal(false);
            fetchBuckets();
          }}
        />
      )}

      {/* Delete Confirmation Modal — ACC-4: z-[60], ACC-1: dialog ARIA */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
          >
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="text-red-600" size={20} />
                </div>
                <div>
                  {/* ACC-1: id on title */}
                  <h3 id="delete-confirm-title" className="text-lg font-semibold text-gray-900">
                    Eliminar Distribución de Horas
                  </h3>
                  <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <div className="mb-6">
                <p className="text-gray-700">
                  ¿Está seguro de que desea eliminar la distribución de horas de este contrato?
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Solo es posible eliminar si no existen registros en el libro de horas.
                </p>
              </div>
              <div className="flex space-x-3 justify-end">
                {/* ACC-2: ref for focus management */}
                <button
                  ref={deleteCancelBtnRef}
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                {/* BC-5: rounded-md */}
                <button
                  onClick={handleDeleteAllocation}
                  disabled={deleting}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  {deleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <span>Eliminar Distribución</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
