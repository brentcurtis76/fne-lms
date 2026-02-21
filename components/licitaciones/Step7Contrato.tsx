/**
 * Step 7: Contrato Component
 * Handles the final step of the licitacion workflow:
 *
 * State-dependent rendering:
 * - contrato_pendiente + ganador_es_fne=true: "Generar Contrato" button + document upload
 * - contrato_generado: "Ver Contrato" link + completion summary
 * - adjudicada_externo: document upload + "Cerrar Licitacion" button
 * - cerrada: read-only closure summary
 */

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import {
  FileText,
  ExternalLink,
  Upload,
  CheckCircle,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { LicitacionDetail } from '@/types/licitaciones';

interface Step7ContratoProps {
  licitacion: LicitacionDetail;
  isAdmin: boolean;
  onRefresh: () => void;
}

const BTN_PRIMARY =
  'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';
const BTN_DANGER =
  'px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';

export default function Step7Contrato({
  licitacion,
  isAdmin,
  onRefresh,
}: Step7ContratoProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const { estado, ganador_es_fne, contrato_id, carta_adjudicacion_url } = licitacion;

  // ============================================================
  // Document upload handler (for adjudicada_externo)
  // ============================================================

  const handleUploadDocument = async (
    file: File,
    tipo: string
  ) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', tipo);
      formData.append('nombre', file.name);

      const res = await fetch(`/api/licitaciones/${licitacion.id}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir documento');
      }

      toast.success('Documento subido exitosamente');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir documento');
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Use 'otro' type for external winner final documents
    await handleUploadDocument(file, 'otro');
    // Reset input so same file can be re-uploaded if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ============================================================
  // Close licitacion handler
  // ============================================================

  const handleClose = async () => {
    setClosing(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacion.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmar: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cerrar licitacion');
      }

      toast.success('Licitacion cerrada exitosamente');
      setShowCloseConfirm(false);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cerrar licitacion');
    } finally {
      setClosing(false);
    }
  };

  // ============================================================
  // Render: contrato_pendiente + ganador FNE
  // ============================================================

  if (estado === 'contrato_pendiente' && ganador_es_fne) {
    const canGenerateContract =
      isAdmin &&
      !contrato_id &&
      !!carta_adjudicacion_url;

    return (
      <div className="space-y-6">
        {/* Status info */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-purple-600" />
            <span className="font-medium text-purple-800 text-sm">
              Contrato Pendiente — ATE FNE
            </span>
          </div>
          <p className="text-purple-700 text-sm">
            La licitacion fue adjudicada a un ATE de FNE. El siguiente paso es generar el
            contrato en el modulo de contratos.
          </p>
        </div>

        {/* Missing carta warning */}
        {!carta_adjudicacion_url && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-2">
            <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-yellow-800 text-sm">
              Debe subir la carta de adjudicacion firmada antes de generar el contrato.
              Vuelva al Paso 6 — Adjudicacion para subirla.
            </p>
          </div>
        )}

        {/* Generar Contrato button (admin only) */}
        {isAdmin && (
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                router.push(`/contracts?tab=nuevo&licitacion_id=${licitacion.id}`)
              }
              disabled={!canGenerateContract}
              className={BTN_PRIMARY}
            >
              <FileText size={16} className="inline mr-2" />
              Generar Contrato
            </button>
            {!carta_adjudicacion_url && (
              <span className="text-xs text-gray-500">
                (Suba la carta de adjudicacion firmada para habilitar)
              </span>
            )}
          </div>
        )}

        {!isAdmin && (
          <p className="text-sm text-gray-500">
            Solo los administradores pueden generar contratos desde esta vista.
          </p>
        )}
      </div>
    );
  }

  // ============================================================
  // Render: contrato_generado
  // ============================================================

  if (estado === 'contrato_generado') {
    return (
      <div className="space-y-6">
        {/* Success banner */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-green-600" />
            <span className="font-medium text-green-800 text-sm">
              Contrato Generado
            </span>
          </div>
          <p className="text-green-700 text-sm">
            El contrato ha sido generado y vinculado a esta licitacion.
          </p>
        </div>

        {/* Ver Contrato link */}
        {contrato_id && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-gray-600" />
              <div>
                <p className="font-medium text-gray-900 text-sm">Contrato Vinculado</p>
                <p className="text-xs text-gray-500">Ver detalles del contrato en el modulo de contratos</p>
              </div>
            </div>
            <a
              href={`/contracts?contrato_id=${contrato_id}`}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              <ExternalLink size={14} />
              Ver Contrato
            </a>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          {licitacion.fecha_adjudicacion && (
            <div>
              <span className="text-gray-500">Fecha adjudicacion:</span>
              <span className="ml-2 text-gray-900 font-medium">
                {new Date(licitacion.fecha_adjudicacion + 'T00:00:00').toLocaleDateString('es-CL')}
              </span>
            </div>
          )}
          {licitacion.monto_adjudicado_uf && (
            <div>
              <span className="text-gray-500">Monto adjudicado:</span>
              <span className="ml-2 text-gray-900 font-medium">
                {licitacion.tipo_moneda} {licitacion.monto_adjudicado_uf.toLocaleString('es-CL')}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // Render: adjudicada_externo
  // ============================================================

  if (estado === 'adjudicada_externo') {
    return (
      <div className="space-y-6">
        {/* Status info */}
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-teal-600" />
            <span className="font-medium text-teal-800 text-sm">
              Adjudicada a Proveedor Externo
            </span>
          </div>
          <p className="text-teal-700 text-sm">
            La licitacion fue adjudicada a un proveedor externo a FNE. Suba los documentos
            finales y luego cierre la licitacion.
          </p>
        </div>

        {/* Document upload */}
        <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload size={24} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 mb-1">
            Suba documentos finales (contrato externo, resoluciones, etc.)
          </p>
          <p className="text-xs text-gray-400 mb-3">PDF, Word o imagen — max 25 MB</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={BTN_SECONDARY}
          >
            {uploading ? 'Subiendo...' : 'Seleccionar Archivo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={onFileChange}
            className="hidden"
          />
        </div>

        {/* Close licitacion */}
        <div className="border-t border-gray-200 pt-4">
          {!showCloseConfirm ? (
            <button
              onClick={() => setShowCloseConfirm(true)}
              className={BTN_PRIMARY}
            >
              Cerrar Licitacion
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <p className="text-red-800 text-sm font-medium">
                ¿Confirmar cierre de la licitacion?
              </p>
              <p className="text-red-700 text-xs">
                Esta accion es irreversible. La licitacion quedara en estado &quot;Cerrada&quot;.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className={BTN_DANGER}
                >
                  {closing ? 'Cerrando...' : 'Confirmar Cierre'}
                </button>
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  disabled={closing}
                  className={BTN_SECONDARY}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // Render: cerrada (read-only)
  // ============================================================

  if (estado === 'cerrada') {
    return (
      <div className="space-y-6">
        {/* Closed banner */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-gray-500" />
            <span className="font-medium text-gray-700 text-sm">
              Licitacion Cerrada
            </span>
          </div>
          <p className="text-gray-600 text-sm">
            Esta licitacion ha sido cerrada. No se pueden realizar mas acciones.
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          {licitacion.fecha_adjudicacion && (
            <div>
              <span className="text-gray-500">Fecha adjudicacion:</span>
              <span className="ml-2 text-gray-900 font-medium">
                {new Date(licitacion.fecha_adjudicacion + 'T00:00:00').toLocaleDateString('es-CL')}
              </span>
            </div>
          )}
          {licitacion.monto_adjudicado_uf && (
            <div>
              <span className="text-gray-500">Monto adjudicado:</span>
              <span className="ml-2 text-gray-900 font-medium">
                {licitacion.tipo_moneda} {licitacion.monto_adjudicado_uf.toLocaleString('es-CL')}
              </span>
            </div>
          )}
          {contrato_id && (
            <div className="col-span-2">
              <a
                href={`/contracts?contrato_id=${contrato_id}`}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                <ExternalLink size={14} />
                Ver Contrato Vinculado
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // Fallback: locked state (should not reach here in normal flow)
  // ============================================================

  return (
    <div className="flex items-center gap-2 text-gray-400 text-sm">
      <Lock size={14} />
      <span>Este paso estara disponible cuando la licitacion sea adjudicada.</span>
    </div>
  );
}
