/**
 * Step 6: Adjudicacion Component
 * Shows the adjudicacion workflow:
 * 1. Winner selection (pre-set from evaluation, overridable with justification)
 * 2. Adjudicacion details form
 * 3. Actions (Save, Generate Carta, Upload Signed Carta)
 * 4. FNE Decision (Yes → contrato_pendiente, No → adjudicada_externo)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Save, FileText, Upload, Check, Award } from 'lucide-react';
import { LicitacionDetail, LicitacionAte } from '@/types/licitaciones';

interface Step6AdjudicacionProps {
  licitacion: LicitacionDetail;
  isAdmin: boolean;
  onRefresh: () => void;
}

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-full';
const BTN_PRIMARY =
  'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';

export default function Step6Adjudicacion({
  licitacion,
  onRefresh,
}: Step6AdjudicacionProps) {
  const [ates, setAtes] = useState<LicitacionAte[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedAteId, setSelectedAteId] = useState<string>(
    licitacion.ganador_ate_id || ''
  );
  const [montoAdjudicado, setMontoAdjudicado] = useState<string>(
    licitacion.monto_adjudicado_uf ? String(licitacion.monto_adjudicado_uf) : ''
  );
  const [condicionesPago, setCondicionesPago] = useState<string>(
    licitacion.condiciones_pago || ''
  );
  const [fechaOferta, setFechaOferta] = useState<string>(
    licitacion.fecha_oferta_ganadora || ''
  );
  const [contactoNombre, setContactoNombre] = useState<string>(
    licitacion.contacto_coordinacion_nombre || ''
  );
  const [contactoEmail, setContactoEmail] = useState<string>(
    licitacion.contacto_coordinacion_email || ''
  );
  const [contactoTelefono, setContactoTelefono] = useState<string>(
    licitacion.contacto_coordinacion_telefono || ''
  );

  // Action states
  const [saving, setSaving] = useState(false);
  const [generatingCarta, setGeneratingCarta] = useState(false);
  const [cartaUrl, setCartaUrl] = useState<string | null>(null);
  const [uploadingCarta, setUploadingCarta] = useState(false);
  const [cartaSigned, setCartaSigned] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const licitacionId = licitacion.id;
  const isEditable = licitacion.estado === 'adjudicacion_pendiente';

  // ============================================================
  // Load ATEs
  // ============================================================

  const loadAtes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/ates`);
      if (res.ok) {
        const json = await res.json();
        const ateList: LicitacionAte[] = json.data?.ates || [];
        setAtes(ateList);

        // Pre-select top scorer only if not already set
        setSelectedAteId(prev => {
          if (prev) return prev;
          if (ateList.length === 0) return '';
          const sorted = [...ateList].sort((a, b) =>
            (Number(b.puntaje_total) || 0) - (Number(a.puntaje_total) || 0)
          );
          return sorted[0]?.id || '';
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
  // Save adjudicacion data
  // ============================================================

  const handleSave = async () => {
    if (!selectedAteId) {
      toast.error('Debe seleccionar un ATE ganador');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        ganador_ate_id: selectedAteId,
      };
      if (montoAdjudicado) body.monto_adjudicado_uf = parseFloat(montoAdjudicado);
      if (condicionesPago) body.condiciones_pago = condicionesPago;
      if (fechaOferta) body.fecha_oferta_ganadora = fechaOferta;
      if (contactoNombre) body.contacto_coordinacion_nombre = contactoNombre;
      if (contactoEmail) body.contacto_coordinacion_email = contactoEmail;
      if (contactoTelefono) body.contacto_coordinacion_telefono = contactoTelefono;

      const res = await fetch(`/api/licitaciones/${licitacionId}/adjudicacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al guardar adjudicacion');
        return;
      }

      toast.success('Datos de adjudicacion guardados');
      onRefresh();
    } catch {
      toast.error('Error al guardar adjudicacion');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Generate Carta
  // ============================================================

  const handleGenerateCarta = async () => {
    if (!selectedAteId) {
      toast.error('Guarde primero los datos de adjudicacion');
      return;
    }

    // Auto-save first to ensure ganador_ate_id is persisted
    await handleSave();

    setGeneratingCarta(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/generate-carta`);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al generar la Carta');
        return;
      }

      setCartaUrl(json.data.url);
      toast.success('Carta de Adjudicacion generada exitosamente');

      if (json.data.url) {
        window.open(json.data.url, '_blank');
      }
    } catch {
      toast.error('Error al generar la Carta');
    } finally {
      setGeneratingCarta(false);
    }
  };

  // ============================================================
  // Upload signed Carta
  // ============================================================

  const handleUploadCarta = async (file: File) => {
    setUploadingCarta(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', 'carta_adjudicacion_firmada');
      formData.append('nombre', `Carta firmada — ${licitacion.numero_licitacion}`);

      const res = await fetch(`/api/licitaciones/${licitacionId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al subir la Carta');
        return;
      }

      setCartaSigned(true);
      toast.success('Carta firmada subida exitosamente');
      onRefresh();
    } catch {
      toast.error('Error al subir la Carta');
    } finally {
      setUploadingCarta(false);
    }
  };

  // ============================================================
  // Confirm adjudicacion (FNE / External)
  // ============================================================

  const handleConfirm = async (esFne: boolean) => {
    const msg = esFne
      ? '¿Confirmar que el ATE es proveedor FNE? El estado cambiara a "Contrato Pendiente".'
      : '¿Confirmar adjudicacion a proveedor externo? El estado cambiara a "Adjudicada (Externa)".';

    if (!window.confirm(msg)) return;

    setConfirming(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/adjudicacion-confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es_fne: esFne }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al confirmar adjudicacion');
        return;
      }

      toast.success(
        esFne
          ? 'Adjudicacion confirmada. Estado: Contrato Pendiente'
          : 'Adjudicacion externa confirmada'
      );
      onRefresh();
    } catch {
      toast.error('Error al confirmar adjudicacion');
    } finally {
      setConfirming(false);
    }
  };

  // ============================================================
  // Read-only summary (when past adjudicacion_pendiente)
  // ============================================================

  if (!isEditable) {
    const winner = ates.find(a => a.es_ganador) || ates.find(a => a.id === licitacion.ganador_ate_id);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 bg-green-50 rounded-lg px-4 py-3 text-sm text-green-800">
          <Award size={16} />
          <span className="font-medium">Adjudicacion completada</span>
        </div>
        {winner && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">ATE Ganador</p>
            <p className="font-semibold text-gray-900">{winner.nombre_ate}</p>
            {winner.monto_propuesto && (
              <p className="text-sm text-gray-600 mt-1">
                Monto: ${Number(winner.monto_propuesto).toLocaleString('es-CL')} CLP
              </p>
            )}
          </div>
        )}
        {licitacion.condiciones_pago && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Condiciones de pago</p>
            <p className="text-sm text-gray-700">{licitacion.condiciones_pago}</p>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  const sortedAtes = [...ates].sort(
    (a, b) => (Number(b.puntaje_total) || 0) - (Number(a.puntaje_total) || 0)
  );

  return (
    <div className="space-y-6">
      {/* 1. Winner Selection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          1. Seleccion del Ganador
        </h3>
        <div className="space-y-2">
          {sortedAtes.map((ate, idx) => (
            <label
              key={ate.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                selectedAteId === ate.id
                  ? 'border-yellow-400 bg-yellow-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="ganador-ate"
                value={ate.id}
                checked={selectedAteId === ate.id}
                onChange={() => setSelectedAteId(ate.id)}
                className="text-yellow-400"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{ate.nombre_ate}</span>
                  {idx === 0 && (
                    <span className="text-xs bg-brand_accent_light text-brand_primary px-2 py-0.5 rounded-full">
                      Mayor puntaje
                    </span>
                  )}
                </div>
                {ate.puntaje_total && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Puntaje total: {Number(ate.puntaje_total).toFixed(1)}
                  </p>
                )}
              </div>
            </label>
          ))}
          {ates.length === 0 && (
            <p className="text-sm text-gray-800 bg-yellow-50 rounded-lg px-3 py-2">
              No hay ATEs evaluadas. Complete el Paso 5 primero.
            </p>
          )}
        </div>
      </div>

      {/* 2. Adjudicacion Details */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          2. Datos de la Adjudicacion
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="monto-uf" className="block text-xs font-medium text-gray-600 mb-1">
              Monto adjudicado (UF)
            </label>
            <input
              id="monto-uf"
              type="number"
              min={0}
              step={0.01}
              value={montoAdjudicado}
              onChange={e => setMontoAdjudicado(e.target.value)}
              className={INPUT_CLASS}
              placeholder="100.00"
            />
          </div>
          <div>
            <label htmlFor="fecha-oferta" className="block text-xs font-medium text-gray-600 mb-1">
              Fecha de la oferta ganadora
            </label>
            <input
              id="fecha-oferta"
              type="date"
              value={fechaOferta}
              onChange={e => setFechaOferta(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="condiciones" className="block text-xs font-medium text-gray-600 mb-1">
              Condiciones de pago
            </label>
            <textarea
              id="condiciones"
              value={condicionesPago}
              onChange={e => setCondicionesPago(e.target.value)}
              rows={3}
              placeholder="Detalle las condiciones de pago acordadas..."
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor="contacto-nombre" className="block text-xs font-medium text-gray-600 mb-1">
              Nombre coordinacion
            </label>
            <input
              id="contacto-nombre"
              type="text"
              value={contactoNombre}
              onChange={e => setContactoNombre(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Director / Jefe de UTP"
            />
          </div>
          <div>
            <label htmlFor="contacto-email" className="block text-xs font-medium text-gray-600 mb-1">
              Correo coordinacion
            </label>
            <input
              id="contacto-email"
              type="email"
              value={contactoEmail}
              onChange={e => setContactoEmail(e.target.value)}
              className={INPUT_CLASS}
              placeholder="coordinacion@escuela.cl"
            />
          </div>
          <div>
            <label htmlFor="contacto-telefono" className="block text-xs font-medium text-gray-600 mb-1">
              Telefono coordinacion
            </label>
            <input
              id="contacto-telefono"
              type="text"
              value={contactoTelefono}
              onChange={e => setContactoTelefono(e.target.value)}
              className={INPUT_CLASS}
              placeholder="+56 9 1234 5678"
            />
          </div>
        </div>
      </div>

      {/* 3. Save + Carta Actions */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">3. Documentos</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !selectedAteId}
            className={BTN_PRIMARY}
          >
            <span className="flex items-center gap-2">
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar Adjudicacion'}
            </span>
          </button>

          <button
            onClick={handleGenerateCarta}
            disabled={generatingCarta || !selectedAteId}
            className={BTN_SECONDARY}
          >
            <span className="flex items-center gap-2">
              <FileText size={16} />
              {generatingCarta ? 'Generando...' : 'Generar Carta de Adjudicacion'}
            </span>
          </button>
        </div>

        {cartaUrl && (
          <div className="mt-2 text-sm text-green-700 flex items-center gap-1">
            <Check size={14} />
            <a href={cartaUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Carta generada — descargar
            </a>
          </div>
        )}

        {/* Upload signed Carta */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600 mb-2">
            Suba la Carta de Adjudicacion firmada (PDF o imagen).
          </p>
          {cartaSigned ? (
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <Check size={16} />
              Carta firmada subida
            </div>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadCarta(file);
                }}
                className="hidden"
                id="carta-upload"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCarta}
                className={BTN_SECONDARY}
              >
                <span className="flex items-center gap-2">
                  <Upload size={16} />
                  {uploadingCarta ? 'Subiendo...' : 'Subir Carta Firmada'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 4. FNE Decision */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          4. Confirmacion FNE
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          ¿El ATE adjudicado es proveedor registrado en FNE?
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleConfirm(true)}
            disabled={confirming || !selectedAteId}
            className="px-5 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirming ? 'Procesando...' : 'Si — Proveedor FNE (genera Contrato)'}
          </button>
          <button
            onClick={() => handleConfirm(false)}
            disabled={confirming || !selectedAteId}
            className="px-5 py-3 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirming ? 'Procesando...' : 'No — Proveedor Externo (cerrar proceso)'}
          </button>
        </div>
      </div>
    </div>
  );
}
