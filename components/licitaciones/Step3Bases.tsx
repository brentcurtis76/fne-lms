import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, FileText, Download, Check, X, MessageSquare } from 'lucide-react';
import { LicitacionDetail, LicitacionAte, LicitacionConsulta, LicitacionDocumento } from '@/types/licitaciones';
import { validateRut, formatRut } from '@/utils/rutValidation';

interface Step3BasesProps {
  licitacion: LicitacionDetail;
  isAdmin: boolean;
  onAdvance: () => void;
  onRefresh: () => void;
}

// AC-5: added focus:ring-offset-2
const INPUT_CLASS = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-full';
const BTN_PRIMARY = 'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY = 'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';
const BTN_DANGER = 'text-red-600 hover:text-red-800 text-sm transition-colors';

interface AteFormData {
  nombre_ate: string;
  rut_ate: string;
  nombre_contacto: string;
  email: string;
  telefono: string;
  fecha_solicitud_bases: string;
}

const EMPTY_ATE_FORM: AteFormData = {
  nombre_ate: '',
  rut_ate: '',
  nombre_contacto: '',
  email: '',
  telefono: '',
  fecha_solicitud_bases: '',
};

interface ConsultaFormData {
  pregunta: string;
  respuesta: string;
  fecha_pregunta: string;
  fecha_respuesta: string;
  ate_id: string;
}

const EMPTY_CONSULTA_FORM: ConsultaFormData = {
  pregunta: '',
  respuesta: '',
  fecha_pregunta: '',
  fecha_respuesta: '',
  ate_id: '',
};

export default function Step3Bases({ licitacion, onAdvance, onRefresh }: Step3BasesProps) {
  const [ates, setAtes] = useState<LicitacionAte[]>([]);
  const [consultas, setConsultas] = useState<LicitacionConsulta[]>([]);
  const [basesDocumentos, setBasesDocumentos] = useState<LicitacionDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  // ATE form state
  const [ateForm, setAteForm] = useState<AteFormData>(EMPTY_ATE_FORM);
  const [ateFormErrors, setAteFormErrors] = useState<Partial<AteFormData>>({});
  const [savingAte, setSavingAte] = useState(false);
  const [editingAteId, setEditingAteId] = useState<string | null>(null);

  // ID-2: ATE form starts collapsed (visible when no ATEs exist or editing)
  const [showAteForm, setShowAteForm] = useState(false);

  // Bases generation state
  const [generatingBases, setGeneratingBases] = useState(false);
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);

  // Consultas form
  const [consultaForm, setConsultaForm] = useState<ConsultaFormData>(EMPTY_CONSULTA_FORM);
  const [savingConsulta, setSavingConsulta] = useState(false);
  const [showConsultasForm, setShowConsultasForm] = useState(false);

  // Advance state
  const [advancing, setAdvancing] = useState(false);

  const licitacionId = licitacion.id;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [atesRes, consultasRes, docsRes] = await Promise.all([
        fetch(`/api/licitaciones/${licitacionId}/ates`),
        fetch(`/api/licitaciones/${licitacionId}/consultas`),
        fetch(`/api/licitaciones/${licitacionId}/documentos`),
      ]);

      if (atesRes.ok) {
        const json = await atesRes.json();
        setAtes(json.data?.ates || []);
      }
      if (consultasRes.ok) {
        const json = await consultasRes.json();
        setConsultas(json.data?.consultas || []);
      }
      if (docsRes.ok) {
        const json = await docsRes.json();
        const docs: LicitacionDocumento[] = json.data?.documentos || [];
        setBasesDocumentos(docs.filter(d => d.tipo === 'bases_generadas'));
      }
    } catch {
      toast.error('Error al cargar datos del Paso 3');
    } finally {
      setLoading(false);
    }
  }, [licitacionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // ATE Form Handlers
  // ============================================================

  const validateAteForm = (): boolean => {
    const errors: Partial<AteFormData> = {};
    if (!ateForm.nombre_ate.trim()) {
      errors.nombre_ate = 'Nombre ATE requerido';
    }
    if (ateForm.rut_ate && !validateRut(ateForm.rut_ate)) {
      errors.rut_ate = 'RUT invalido. Ingrese un RUT valido (ej: 12.345.678-5)';
    }
    if (ateForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ateForm.email)) {
      errors.email = 'Correo electronico invalido';
    }
    setAteFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddAte = async () => {
    if (!validateAteForm()) return;

    setSavingAte(true);
    try {
      const body = {
        nombre_ate: ateForm.nombre_ate.trim(),
        rut_ate: ateForm.rut_ate ? formatRut(ateForm.rut_ate) : null,
        nombre_contacto: ateForm.nombre_contacto.trim() || null,
        email: ateForm.email.trim() || null,
        telefono: ateForm.telefono.trim() || null,
        fecha_solicitud_bases: ateForm.fecha_solicitud_bases || null,
      };

      const method = editingAteId ? 'PUT' : 'POST';
      const payload = editingAteId ? { ate_id: editingAteId, ...body } : body;

      const res = await fetch(`/api/licitaciones/${licitacionId}/ates`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al guardar ATE');
        return;
      }

      toast.success(editingAteId ? 'ATE actualizada' : 'ATE registrada exitosamente');
      setAteForm(EMPTY_ATE_FORM);
      setEditingAteId(null);
      setShowAteForm(false);
      loadData();
    } catch {
      toast.error('Error al guardar ATE');
    } finally {
      setSavingAte(false);
    }
  };

  const handleMarkBasesSent = async (ate: LicitacionAte) => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/ates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ate_id: ate.id,
          fecha_envio_bases: today,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al marcar bases enviadas');
        return;
      }

      toast.success('Bases marcadas como enviadas');
      loadData();
    } catch {
      toast.error('Error al marcar bases enviadas');
    }
  };

  const handleDeleteAte = async (ate: LicitacionAte) => {
    if (!window.confirm(`¿Eliminar la ATE "${ate.nombre_ate}"? Esta accion no se puede deshacer.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/ates`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ate_id: ate.id }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al eliminar ATE');
        return;
      }

      toast.success('ATE eliminada');
      loadData();
    } catch {
      toast.error('Error al eliminar ATE');
    }
  };

  const handleEditAte = (ate: LicitacionAte) => {
    setEditingAteId(ate.id);
    setAteForm({
      nombre_ate: ate.nombre_ate || '',
      rut_ate: ate.rut_ate || '',
      nombre_contacto: ate.nombre_contacto || '',
      email: ate.email || '',
      telefono: ate.telefono || '',
      fecha_solicitud_bases: ate.fecha_solicitud_bases || '',
    });
    setShowAteForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ============================================================
  // Bases Generation
  // ============================================================

  const handleGenerateBases = async () => {
    setGeneratingBases(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/generate-bases`);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al generar Bases');
        return;
      }

      toast.success('Documento de Bases generado exitosamente');
      setLastGeneratedUrl(json.data?.download_url || null);
      loadData();
    } catch {
      toast.error('Error al generar Bases');
    } finally {
      setGeneratingBases(false);
    }
  };

  // ============================================================
  // Consultas
  // ============================================================

  const handleAddConsulta = async () => {
    if (!consultaForm.pregunta.trim()) {
      toast.error('La pregunta es requerida');
      return;
    }

    setSavingConsulta(true);
    try {
      const body = {
        pregunta: consultaForm.pregunta.trim(),
        respuesta: consultaForm.respuesta.trim() || null,
        fecha_pregunta: consultaForm.fecha_pregunta || null,
        fecha_respuesta: consultaForm.fecha_respuesta || null,
        ate_id: consultaForm.ate_id || null,
      };

      const res = await fetch(`/api/licitaciones/${licitacionId}/consultas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al registrar consulta');
        return;
      }

      toast.success('Consulta registrada exitosamente');
      setConsultaForm(EMPTY_CONSULTA_FORM);
      setShowConsultasForm(false);
      loadData();
    } catch {
      toast.error('Error al registrar consulta');
    } finally {
      setSavingConsulta(false);
    }
  };

  // ============================================================
  // State Advance
  // ============================================================

  const handleAdvance = async () => {
    const atesWithBasesSent = ates.filter(a => a.fecha_envio_bases);
    if (atesWithBasesSent.length === 0) {
      toast.error('Debe marcar las bases como enviadas a al menos una ATE antes de avanzar.');
      return;
    }

    // ID-3: fixed accent marks
    if (!window.confirm('¿Avanzar a Recepción de Propuestas? Esta acción cambiará el estado de la licitación.')) {
      return;
    }

    setAdvancing(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_estado: 'propuestas_pendientes' }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al avanzar estado');
        return;
      }

      toast.success('Licitacion avanzada a Recepcion de Propuestas');
      onAdvance();
      onRefresh();
    } catch {
      toast.error('Error al avanzar estado');
    } finally {
      setAdvancing(false);
    }
  };

  const atesWithBasesSent = ates.filter(a => a.fecha_envio_bases);
  const canAdvance = atesWithBasesSent.length > 0;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${parseInt(parts[2], 10)}/${months[parseInt(parts[1], 10) - 1]}/${parts[0]}`;
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
      {/* ============================
          ATE Registration Section
      =============================== */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center">
            {/* BC-1: changed from bg-blue-100 text-blue-800 to bg-gray-100 text-gray-700 */}
            <span className="bg-gray-100 text-gray-700 text-xs font-medium px-2 py-0.5 rounded mr-2">
              {ates.length} ATE{ates.length !== 1 ? 's' : ''}
            </span>
            Registro de ATEs
          </h3>
          {/* ID-2: toggle button for ATE form */}
          <button
            onClick={() => {
              setShowAteForm(!showAteForm);
              if (showAteForm) {
                setEditingAteId(null);
                setAteForm(EMPTY_ATE_FORM);
                setAteFormErrors({});
              }
            }}
            className={BTN_SECONDARY}
          >
            <span className="flex items-center gap-1">
              {showAteForm ? <X size={14} /> : <Plus size={14} />}
              {showAteForm ? 'Cerrar' : 'Agregar nueva ATE'}
            </span>
          </button>
        </div>

        {/* Add/Edit ATE Form — ID-2: collapsed by default */}
        {showAteForm && (
          <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              {editingAteId ? 'Editar ATE' : 'Agregar nueva ATE'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* AC-1: all label/input pairs now linked with htmlFor/id */}
              <div>
                <label htmlFor="ate-nombre" className="block text-xs font-medium text-gray-600 mb-1">
                  Nombre ATE <span className="text-red-500">*</span>
                </label>
                <input
                  id="ate-nombre"
                  type="text"
                  value={ateForm.nombre_ate}
                  onChange={e => setAteForm(f => ({ ...f, nombre_ate: e.target.value }))}
                  placeholder="Nombre de la ATE o empresa"
                  className={INPUT_CLASS}
                />
                {ateFormErrors.nombre_ate && (
                  <p className="text-xs text-red-600 mt-1">{ateFormErrors.nombre_ate}</p>
                )}
              </div>
              <div>
                <label htmlFor="ate-rut" className="block text-xs font-medium text-gray-600 mb-1">RUT</label>
                <input
                  id="ate-rut"
                  type="text"
                  value={ateForm.rut_ate}
                  onChange={e => setAteForm(f => ({ ...f, rut_ate: e.target.value }))}
                  placeholder="12.345.678-5"
                  className={INPUT_CLASS}
                />
                {ateFormErrors.rut_ate && (
                  <p className="text-xs text-red-600 mt-1">{ateFormErrors.rut_ate}</p>
                )}
              </div>
              <div>
                <label htmlFor="ate-contacto" className="block text-xs font-medium text-gray-600 mb-1">Nombre Contacto</label>
                <input
                  id="ate-contacto"
                  type="text"
                  value={ateForm.nombre_contacto}
                  onChange={e => setAteForm(f => ({ ...f, nombre_contacto: e.target.value }))}
                  placeholder="Nombre del representante"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="ate-email" className="block text-xs font-medium text-gray-600 mb-1">Correo Electronico</label>
                <input
                  id="ate-email"
                  type="email"
                  value={ateForm.email}
                  onChange={e => setAteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contacto@ate.cl"
                  className={INPUT_CLASS}
                />
                {ateFormErrors.email && (
                  <p className="text-xs text-red-600 mt-1">{ateFormErrors.email}</p>
                )}
              </div>
              <div>
                <label htmlFor="ate-telefono" className="block text-xs font-medium text-gray-600 mb-1">Telefono</label>
                <input
                  id="ate-telefono"
                  type="text"
                  value={ateForm.telefono}
                  onChange={e => setAteForm(f => ({ ...f, telefono: e.target.value }))}
                  placeholder="+56 9 1234 5678"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="ate-fecha-solicitud" className="block text-xs font-medium text-gray-600 mb-1">Fecha Solicitud de Bases</label>
                <input
                  id="ate-fecha-solicitud"
                  type="date"
                  value={ateForm.fecha_solicitud_bases}
                  onChange={e => setAteForm(f => ({ ...f, fecha_solicitud_bases: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddAte}
                disabled={savingAte}
                className={BTN_PRIMARY}
              >
                <span className="flex items-center gap-1">
                  <Plus size={14} />
                  {savingAte ? 'Guardando...' : editingAteId ? 'Actualizar ATE' : 'Agregar ATE'}
                </span>
              </button>
              {editingAteId && (
                <button
                  onClick={() => { setEditingAteId(null); setAteForm(EMPTY_ATE_FORM); setAteFormErrors({}); setShowAteForm(false); }}
                  className={BTN_SECONDARY}
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}

        {/* ATEs Table */}
        {ates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* RD-1: bg-gray-50 on header row */}
                <tr className="border-b border-gray-200 text-left bg-gray-50">
                  {/* AC-6: scope="col" on all th elements */}
                  <th scope="col" className="pb-2 font-medium text-gray-600">Nombre ATE</th>
                  <th scope="col" className="pb-2 font-medium text-gray-600">RUT</th>
                  <th scope="col" className="pb-2 font-medium text-gray-600">Contacto</th>
                  <th scope="col" className="pb-2 font-medium text-gray-600">Fecha Solicitud</th>
                  <th scope="col" className="pb-2 font-medium text-gray-600">Bases Enviadas</th>
                  <th scope="col" className="pb-2 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ates.map(ate => (
                  <tr key={ate.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-gray-900">{ate.nombre_ate}</span>
                      {ate.email && <p className="text-xs text-gray-500">{ate.email}</p>}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{ate.rut_ate || '-'}</td>
                    <td className="py-2 pr-3 text-gray-700">
                      {ate.nombre_contacto || '-'}
                      {ate.telefono && <p className="text-xs text-gray-500">{ate.telefono}</p>}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{formatDate(ate.fecha_solicitud_bases)}</td>
                    <td className="py-2 pr-3">
                      {ate.fecha_envio_bases ? (
                        <span className="flex items-center text-green-700 text-xs">
                          <Check size={12} className="mr-1" />
                          {formatDate(ate.fecha_envio_bases)}
                        </span>
                      ) : (
                        // BC-2 + AC-3: fixed colors and added aria-label
                        <button
                          onClick={() => handleMarkBasesSent(ate)}
                          aria-label={`Marcar bases enviadas a ${ate.nombre_ate}`}
                          className="text-xs text-gray-700 hover:text-gray-900 underline"
                        >
                          Marcar bases enviadas
                        </button>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {/* BC-2: fixed colors */}
                        <button
                          onClick={() => handleEditAte(ate)}
                          className="text-gray-700 hover:text-gray-900 text-xs"
                        >
                          Editar
                        </button>
                        {!ate.propuesta_url && (
                          // AC-2: added aria-label to delete button
                          <button
                            onClick={() => handleDeleteAte(ate)}
                            aria-label={`Eliminar ATE ${ate.nombre_ate}`}
                            className={BTN_DANGER}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No hay ATEs registradas. Agregue la primera ATE usando el botón anterior.
          </p>
        )}
      </div>

      {/* ============================
          Bases Generation Section
      =============================== */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
          <FileText size={16} className="mr-2 text-gray-600" />
          Generacion de Bases
        </h3>

        <div className="flex flex-wrap gap-3 items-center mb-4">
          <button
            onClick={handleGenerateBases}
            disabled={generatingBases}
            className={BTN_PRIMARY}
          >
            <span className="flex items-center gap-1">
              <FileText size={14} />
              {generatingBases ? 'Generando...' : 'Generar Bases (.docx)'}
            </span>
          </button>
          {lastGeneratedUrl && (
            // BC-2: fixed colors for download link
            <a
              href={lastGeneratedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
            >
              <Download size={14} />
              Descargar ultima version
            </a>
          )}
        </div>

        {/* Previous bases documents */}
        {basesDocumentos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Versiones anteriores generadas:</p>
            <div className="space-y-1">
              {basesDocumentos.slice(0, 5).map(doc => (
                <div key={doc.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <FileText size={10} className="text-gray-400 flex-shrink-0" />
                  <span>{doc.file_name}</span>
                  <span className="text-gray-400">
                    {new Date(doc.created_at).toLocaleDateString('es-CL')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {basesDocumentos.length === 0 && (
          <p className="text-xs text-gray-500">
            Estado: Bases no generadas. Haga clic en &ldquo;Generar Bases&rdquo; para crear el documento Word.
          </p>
        )}
      </div>

      {/* ============================
          Consultas Section
      =============================== */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center">
            <MessageSquare size={16} className="mr-2 text-gray-600" />
            Consultas ({consultas.length})
          </h3>
          <button
            onClick={() => setShowConsultasForm(!showConsultasForm)}
            className={BTN_SECONDARY}
          >
            <span className="flex items-center gap-1">
              {showConsultasForm ? <X size={14} /> : <Plus size={14} />}
              {showConsultasForm ? 'Cerrar' : 'Registrar consulta'}
            </span>
          </button>
        </div>

        {showConsultasForm && (
          <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                {/* AC-1: linked label/textarea for consulta-pregunta */}
                <label htmlFor="consulta-pregunta" className="block text-xs font-medium text-gray-600 mb-1">
                  Pregunta <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="consulta-pregunta"
                  value={consultaForm.pregunta}
                  onChange={e => setConsultaForm(f => ({ ...f, pregunta: e.target.value }))}
                  placeholder="Ingrese la pregunta de la consulta"
                  rows={3}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="md:col-span-2">
                {/* AC-1: linked label/textarea for consulta-respuesta */}
                <label htmlFor="consulta-respuesta" className="block text-xs font-medium text-gray-600 mb-1">Respuesta</label>
                <textarea
                  id="consulta-respuesta"
                  value={consultaForm.respuesta}
                  onChange={e => setConsultaForm(f => ({ ...f, respuesta: e.target.value }))}
                  placeholder="Ingrese la respuesta (opcional)"
                  rows={3}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="consulta-fecha-pregunta" className="block text-xs font-medium text-gray-600 mb-1">Fecha Pregunta</label>
                <input
                  id="consulta-fecha-pregunta"
                  type="date"
                  value={consultaForm.fecha_pregunta}
                  onChange={e => setConsultaForm(f => ({ ...f, fecha_pregunta: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="consulta-fecha-respuesta" className="block text-xs font-medium text-gray-600 mb-1">Fecha Respuesta</label>
                <input
                  id="consulta-fecha-respuesta"
                  type="date"
                  value={consultaForm.fecha_respuesta}
                  onChange={e => setConsultaForm(f => ({ ...f, fecha_respuesta: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="consulta-ate" className="block text-xs font-medium text-gray-600 mb-1">ATE (opcional)</label>
                <select
                  id="consulta-ate"
                  value={consultaForm.ate_id}
                  onChange={e => setConsultaForm(f => ({ ...f, ate_id: e.target.value }))}
                  className={INPUT_CLASS}
                >
                  <option value="">-- Sin ATE especifica --</option>
                  {ates.map(ate => (
                    <option key={ate.id} value={ate.id}>{ate.nombre_ate}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddConsulta}
                disabled={savingConsulta}
                className={BTN_PRIMARY}
              >
                {savingConsulta ? 'Guardando...' : 'Registrar consulta'}
              </button>
              <button
                onClick={() => { setShowConsultasForm(false); setConsultaForm(EMPTY_CONSULTA_FORM); }}
                className={BTN_SECONDARY}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {consultas.length > 0 ? (
          <div className="space-y-3">
            {consultas.map(consulta => (
              <div key={consulta.id} className="border border-gray-100 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-900 mb-1">
                  P: {consulta.pregunta}
                </p>
                {consulta.respuesta && (
                  <p className="text-sm text-gray-700 mb-1">
                    R: {consulta.respuesta}
                  </p>
                )}
                <div className="flex gap-4 text-xs text-gray-500">
                  {consulta.fecha_pregunta && <span>Pregunta: {formatDate(consulta.fecha_pregunta)}</span>}
                  {consulta.fecha_respuesta && <span>Respuesta: {formatDate(consulta.fecha_respuesta)}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No hay consultas registradas.
          </p>
        )}
      </div>

      {/* ============================
          Advance State Button
      =============================== */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Avanzar a Recepción de Propuestas</h3>
        {canAdvance ? (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              {atesWithBasesSent.length} ATE{atesWithBasesSent.length !== 1 ? 's tienen' : ' tiene'} las bases enviadas.
              Puede avanzar al siguiente paso.
            </p>
            {/* ID-1: changed from bg-green-600 to bg-yellow-400 text-black */}
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="px-6 py-3 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors disabled:opacity-60"
            >
              {advancing ? 'Avanzando...' : 'Avanzar a Recepción de Propuestas'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Para avanzar, debe marcar las bases como enviadas a al menos una ATE registrada.
          </p>
        )}
      </div>
    </div>
  );
}
