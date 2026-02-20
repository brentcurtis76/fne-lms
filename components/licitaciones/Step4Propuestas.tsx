import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Upload, Check, AlertTriangle, Plus, FileText } from 'lucide-react';
import { LicitacionDetail, LicitacionAte } from '@/types/licitaciones';
import { validateRut, formatRut } from '@/utils/rutValidation';

interface Step4PropuestasProps {
  licitacion: LicitacionDetail;
  isAdmin: boolean;
  onAdvance: () => void;
  onRefresh: () => void;
}

// AC-5: added focus:ring-offset-2
const INPUT_CLASS = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-full';
const BTN_PRIMARY = 'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY = 'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';

interface AteUploadState {
  uploading: boolean;
  file: File | null;
  fecha_propuesta: string;
  notas: string;
}

interface NewAteFormData {
  nombre_ate: string;
  rut_ate: string;
  nombre_contacto: string;
  email: string;
  telefono: string;
}

const EMPTY_NEW_ATE: NewAteFormData = {
  nombre_ate: '',
  rut_ate: '',
  nombre_contacto: '',
  email: '',
  telefono: '',
};

export default function Step4Propuestas({ licitacion, onAdvance, onRefresh }: Step4PropuestasProps) {
  const [ates, setAtes] = useState<LicitacionAte[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadStates, setUploadStates] = useState<Record<string, AteUploadState>>({});
  const [advancing, setAdvancing] = useState(false);

  // Add new ATE form (for ATEs not registered in Step 3)
  const [showNewAteForm, setShowNewAteForm] = useState(false);
  const [newAteForm, setNewAteForm] = useState<NewAteFormData>(EMPTY_NEW_ATE);
  const [newAteFormErrors, setNewAteFormErrors] = useState<Partial<NewAteFormData>>({});
  const [savingNewAte, setSavingNewAte] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const licitacionId = licitacion.id;

  const loadAtes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/ates`);
      if (res.ok) {
        const json = await res.json();
        const ateList: LicitacionAte[] = json.data?.ates || [];
        setAtes(ateList);

        // Initialize upload states for each ATE
        setUploadStates(prev => {
          const next: Record<string, AteUploadState> = {};
          for (const ate of ateList) {
            next[ate.id] = prev[ate.id] || {
              uploading: false,
              file: null,
              fecha_propuesta: new Date().toISOString().split('T')[0],
              notas: '',
            };
          }
          return next;
        });
      }
    } catch {
      toast.error('Error al cargar ATEs');
    } finally {
      setLoading(false);
    }
  }, [licitacionId]);

  useEffect(() => {
    loadAtes();
  }, [loadAtes]);

  // ============================================================
  // Upload proposal for an ATE
  // ============================================================

  const handleUploadProposal = async (ate: LicitacionAte) => {
    const state = uploadStates[ate.id];
    if (!state?.file) {
      toast.error('Seleccione un archivo para subir');
      return;
    }

    // Warning for date outside window (non-blocking)
    if (state.fecha_propuesta && licitacion.fecha_inicio_propuestas && licitacion.fecha_limite_propuestas) {
      const fecha = new Date(state.fecha_propuesta);
      const inicio = new Date(licitacion.fecha_inicio_propuestas);
      const limite = new Date(licitacion.fecha_limite_propuestas);
      if (fecha < inicio || fecha > limite) {
        toast(
          `Advertencia: La fecha de propuesta (${state.fecha_propuesta}) esta fuera del periodo de recepcion (${licitacion.fecha_inicio_propuestas} a ${licitacion.fecha_limite_propuestas}). Puede continuar de todas formas.`,
          { icon: '⚠️', duration: 6000 }
        );
      }
    }

    setUploadStates(prev => ({
      ...prev,
      [ate.id]: { ...prev[ate.id], uploading: true },
    }));

    try {
      const formData = new FormData();
      formData.append('file', state.file);
      formData.append('ate_id', ate.id);
      if (state.fecha_propuesta) {
        formData.append('fecha_propuesta', state.fecha_propuesta);
      }
      if (state.notas) {
        formData.append('notas', state.notas);
      }

      const res = await fetch(`/api/licitaciones/${licitacionId}/ates`, {
        method: 'PATCH',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al subir propuesta');
        return;
      }

      toast.success(`Propuesta de ${ate.nombre_ate} recibida exitosamente`);
      // Reset file input
      setUploadStates(prev => ({
        ...prev,
        [ate.id]: {
          ...prev[ate.id],
          file: null,
          uploading: false,
        },
      }));
      if (fileInputRefs.current[ate.id]) {
        fileInputRefs.current[ate.id]!.value = '';
      }
      loadAtes();
    } catch {
      toast.error('Error al subir propuesta');
    } finally {
      setUploadStates(prev => ({
        ...prev,
        [ate.id]: { ...prev[ate.id], uploading: false },
      }));
    }
  };

  // ============================================================
  // Add new ATE in Step 4
  // ============================================================

  const validateNewAteForm = (): boolean => {
    const errors: Partial<NewAteFormData> = {};
    if (!newAteForm.nombre_ate.trim()) {
      errors.nombre_ate = 'Nombre ATE requerido';
    }
    if (newAteForm.rut_ate && !validateRut(newAteForm.rut_ate)) {
      errors.rut_ate = 'RUT invalido. Ingrese un RUT valido (ej: 12.345.678-5)';
    }
    if (newAteForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newAteForm.email)) {
      errors.email = 'Correo electronico invalido';
    }
    setNewAteFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddNewAte = async () => {
    if (!validateNewAteForm()) return;

    setSavingNewAte(true);
    try {
      const body = {
        nombre_ate: newAteForm.nombre_ate.trim(),
        rut_ate: newAteForm.rut_ate ? formatRut(newAteForm.rut_ate) : null,
        nombre_contacto: newAteForm.nombre_contacto.trim() || null,
        email: newAteForm.email.trim() || null,
        telefono: newAteForm.telefono.trim() || null,
      };

      const res = await fetch(`/api/licitaciones/${licitacionId}/ates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al agregar ATE');
        return;
      }

      toast.success('ATE agregada exitosamente');
      setNewAteForm(EMPTY_NEW_ATE);
      setShowNewAteForm(false);
      loadAtes();
    } catch {
      toast.error('Error al agregar ATE');
    } finally {
      setSavingNewAte(false);
    }
  };

  // ============================================================
  // Advance to Evaluacion
  // ============================================================

  const handleAdvance = async () => {
    const atesWithProposal = ates.filter(a => a.propuesta_url);
    if (atesWithProposal.length === 0) {
      toast.error('Debe subir al menos una propuesta antes de avanzar a Evaluacion.');
      return;
    }

    // ID-3: fixed accent marks
    if (!window.confirm('¿Avanzar a Evaluación Pendiente? Esta acción cambiará el estado de la licitación.')) {
      return;
    }

    setAdvancing(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_estado: 'evaluacion_pendiente' }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al avanzar estado');
        return;
      }

      toast.success('Licitacion avanzada a Evaluacion Pendiente');
      onAdvance();
      onRefresh();
    } catch {
      toast.error('Error al avanzar estado');
    } finally {
      setAdvancing(false);
    }
  };

  const atesWithProposal = ates.filter(a => a.propuesta_url);
  const canAdvance = atesWithProposal.length > 0;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-CL');
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* BC-4: changed from bg-blue-50 to bg-gray-50, text-blue-800 to text-gray-700, added border */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-2">
        <span className="text-sm text-gray-700">
          {atesWithProposal.length} de {ates.length} ATEs con propuesta recibida.
          {licitacion.fecha_limite_propuestas && (
            <span> Fecha limite: {formatDate(licitacion.fecha_limite_propuestas)}</span>
          )}
        </span>
      </div>

      {/* Per-ATE Upload Cards */}
      <div className="space-y-4">
        {ates.map(ate => {
          const state = uploadStates[ate.id] || {
            uploading: false,
            file: null,
            fecha_propuesta: new Date().toISOString().split('T')[0],
            notas: '',
          };

          return (
            <div
              key={ate.id}
              className={`bg-white rounded-lg border p-5 ${ate.propuesta_url ? 'border-green-300' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">{ate.nombre_ate}</h4>
                  {ate.rut_ate && <p className="text-xs text-gray-500">RUT: {ate.rut_ate}</p>}
                  {ate.email && <p className="text-xs text-gray-500">{ate.email}</p>}
                </div>
                {ate.propuesta_url ? (
                  <span className="flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    <Check size={12} />
                    Propuesta recibida
                  </span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Sin propuesta
                  </span>
                )}
              </div>

              {ate.propuesta_url ? (
                // Proposal received — show metadata
                <div className="bg-green-50 rounded-lg p-3 text-sm">
                  <p className="flex items-center gap-1 text-green-800">
                    <FileText size={14} />
                    <span className="font-medium">{ate.propuesta_filename || 'Propuesta'}</span>
                    {ate.propuesta_size && (
                      <span className="text-green-600 text-xs ml-1">({formatFileSize(ate.propuesta_size)})</span>
                    )}
                  </p>
                  {ate.fecha_propuesta && (
                    <p className="text-xs text-green-700 mt-1">
                      Fecha de propuesta: {formatDate(ate.fecha_propuesta)}
                    </p>
                  )}
                  {ate.notas && (
                    <p className="text-xs text-green-700 mt-1 italic">{ate.notas}</p>
                  )}
                </div>
              ) : (
                // No proposal — show upload form
                <div className="space-y-3">
                  {/* Date warning check */}
                  {state.fecha_propuesta && licitacion.fecha_limite_propuestas &&
                    new Date(state.fecha_propuesta) > new Date(licitacion.fecha_limite_propuestas) && (
                    <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-3 text-xs text-amber-800">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>
                        La fecha seleccionada ({state.fecha_propuesta}) es posterior al limite de propuestas
                        ({licitacion.fecha_limite_propuestas}). La propuesta se registrara de todas formas.
                      </span>
                    </div>
                  )}

                  <div>
                    {/* AC-1 + AC-4: file input linked to label with dynamic id */}
                    <label htmlFor={`file-ate-${ate.id}`} className="block text-xs font-medium text-gray-600 mb-1">
                      Archivo de propuesta (PDF, Word, imagen — max 25MB)
                    </label>
                    <input
                      id={`file-ate-${ate.id}`}
                      type="file"
                      ref={el => { fileInputRefs.current[ate.id] = el; }}
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                      onChange={e => {
                        const file = e.target.files?.[0] || null;
                        setUploadStates(prev => ({
                          ...prev,
                          [ate.id]: { ...prev[ate.id], file },
                        }));
                      }}
                      className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-xs file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      {/* AC-1: linked label/input for fecha-propuesta with dynamic id */}
                      <label htmlFor={`fecha-propuesta-${ate.id}`} className="block text-xs font-medium text-gray-600 mb-1">
                        Fecha de la propuesta
                      </label>
                      <input
                        id={`fecha-propuesta-${ate.id}`}
                        type="date"
                        value={state.fecha_propuesta}
                        onChange={e => setUploadStates(prev => ({
                          ...prev,
                          [ate.id]: { ...prev[ate.id], fecha_propuesta: e.target.value },
                        }))}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      {/* AC-1: linked label/input for notas with dynamic id */}
                      <label htmlFor={`notas-ate-${ate.id}`} className="block text-xs font-medium text-gray-600 mb-1">
                        Notas (opcional)
                      </label>
                      <input
                        id={`notas-ate-${ate.id}`}
                        type="text"
                        value={state.notas}
                        onChange={e => setUploadStates(prev => ({
                          ...prev,
                          [ate.id]: { ...prev[ate.id], notas: e.target.value },
                        }))}
                        placeholder="Observaciones sobre la propuesta"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleUploadProposal(ate)}
                    disabled={state.uploading || !state.file}
                    className={BTN_PRIMARY}
                  >
                    <span className="flex items-center gap-1">
                      <Upload size={14} />
                      {state.uploading ? 'Subiendo...' : 'Subir propuesta'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ates.length === 0 && (
        <div className="bg-amber-50 rounded-lg p-4 text-center text-sm text-amber-800">
          No hay ATEs registradas. Agregue una ATE para poder subir propuestas.
        </div>
      )}

      {/* Add new ATE */}
      <div className="bg-white rounded-lg border border-dashed border-gray-300 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">¿Necesita agregar una ATE que no estaba en el Paso 3?</p>
          <button
            onClick={() => setShowNewAteForm(!showNewAteForm)}
            className={BTN_SECONDARY}
          >
            <span className="flex items-center gap-1">
              <Plus size={14} />
              Agregar ATE
            </span>
          </button>
        </div>

        {showNewAteForm && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                {/* AC-1: linked label/input for new ATE form */}
                <label htmlFor="new-ate-nombre" className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre ATE <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-ate-nombre"
                  type="text"
                  value={newAteForm.nombre_ate}
                  onChange={e => setNewAteForm(f => ({ ...f, nombre_ate: e.target.value }))}
                  placeholder="Nombre de la ATE"
                  className={INPUT_CLASS}
                />
                {newAteFormErrors.nombre_ate && (
                  <p className="text-xs text-red-600 mt-1">{newAteFormErrors.nombre_ate}</p>
                )}
              </div>
              <div>
                <label htmlFor="new-ate-rut" className="block text-xs font-medium text-gray-600 mb-1">RUT</label>
                <input
                  id="new-ate-rut"
                  type="text"
                  value={newAteForm.rut_ate}
                  onChange={e => setNewAteForm(f => ({ ...f, rut_ate: e.target.value }))}
                  placeholder="12.345.678-5"
                  className={INPUT_CLASS}
                />
                {newAteFormErrors.rut_ate && (
                  <p className="text-xs text-red-600 mt-1">{newAteFormErrors.rut_ate}</p>
                )}
              </div>
              <div>
                <label htmlFor="new-ate-contacto" className="block text-xs font-medium text-gray-600 mb-1">Contacto</label>
                <input
                  id="new-ate-contacto"
                  type="text"
                  value={newAteForm.nombre_contacto}
                  onChange={e => setNewAteForm(f => ({ ...f, nombre_contacto: e.target.value }))}
                  placeholder="Nombre del representante"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="new-ate-email" className="block text-xs font-medium text-gray-600 mb-1">Correo</label>
                <input
                  id="new-ate-email"
                  type="email"
                  value={newAteForm.email}
                  onChange={e => setNewAteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contacto@ate.cl"
                  className={INPUT_CLASS}
                />
                {newAteFormErrors.email && (
                  <p className="text-xs text-red-600 mt-1">{newAteFormErrors.email}</p>
                )}
              </div>
              <div>
                <label htmlFor="new-ate-telefono" className="block text-xs font-medium text-gray-600 mb-1">Telefono</label>
                <input
                  id="new-ate-telefono"
                  type="text"
                  value={newAteForm.telefono}
                  onChange={e => setNewAteForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+56 9 1234 5678"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleAddNewAte} disabled={savingNewAte} className={BTN_PRIMARY}>
                {savingNewAte ? 'Guardando...' : 'Agregar ATE'}
              </button>
              <button onClick={() => { setShowNewAteForm(false); setNewAteForm(EMPTY_NEW_ATE); }} className={BTN_SECONDARY}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Advance to Evaluacion */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Avanzar a Evaluación</h3>
        {canAdvance ? (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              {atesWithProposal.length} ATE{atesWithProposal.length !== 1 ? 's tienen' : ' tiene'} propuesta
              recibida. Puede avanzar al siguiente paso.
            </p>
            {/* ID-1: changed from bg-green-600 to bg-yellow-400 text-black */}
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="px-6 py-3 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors disabled:opacity-60"
            >
              {advancing ? 'Avanzando...' : 'Avanzar a Evaluación'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Para avanzar a Evaluación, debe subir al menos una propuesta de ATE.
          </p>
        )}
      </div>
    </div>
  );
}
