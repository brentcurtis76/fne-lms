/**
 * Document Download Center
 * Lists all licitacion_documentos grouped by tipo category.
 * Supports individual download via signed URLs and bulk ZIP download.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  Download,
  FileText,
  Package,
  Folder,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { LicitacionDocumento } from '@/types/licitaciones';

interface DocumentCenterProps {
  licitacionId: string;
  numeroLicitacion?: string;
}

// Document tipo -> folder display info
interface FolderInfo {
  key: string;
  label: string;
  tipos: string[];
}

const FOLDERS: FolderInfo[] = [
  {
    key: '01-publicacion',
    label: '01 — Publicacion',
    tipos: ['publicacion_imagen'],
  },
  {
    key: '02-bases',
    label: '02 — Bases',
    tipos: ['bases_generadas', 'bases_enviadas'],
  },
  {
    key: '03-propuestas',
    label: '03 — Propuestas',
    tipos: ['propuesta'],
  },
  {
    key: '04-evaluacion',
    label: '04 — Evaluacion',
    tipos: ['evaluacion_generada', 'evaluacion_firmada'],
  },
  {
    key: '05-adjudicacion',
    label: '05 — Adjudicacion',
    tipos: ['carta_adjudicacion_generada', 'carta_adjudicacion_firmada'],
  },
  {
    key: '06-otros',
    label: '06 — Otros',
    tipos: ['otro'],
  },
];

const BTN_SECONDARY =
  'px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs disabled:opacity-60';

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function DocumentCenter({
  licitacionId,
  numeroLicitacion,
}: DocumentCenterProps) {
  const [documentos, setDocumentos] = useState<LicitacionDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    '01-publicacion': true,
    '02-bases': true,
    '03-propuestas': true,
    '04-evaluacion': true,
    '05-adjudicacion': true,
    '06-otros': true,
  });

  // ============================================================
  // Load documents
  // ============================================================

  const loadDocumentos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/documentos`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cargar documentos');
      }
      const json = await res.json();
      setDocumentos(json.data?.documentos || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [licitacionId]);

  useEffect(() => {
    loadDocumentos();
  }, [loadDocumentos]);

  // ============================================================
  // Individual document download (signed URL via existing download-url API)
  // The licitaciones bucket is private — must use service role via API
  // ============================================================

  const handleDownload = async (doc: LicitacionDocumento) => {
    setDownloadingId(doc.id);
    try {
      // Use dedicated download-doc endpoint with RBAC (admin/encargado school-scope)
      const res = await fetch(
        `/api/licitaciones/${licitacionId}/download-doc?doc_id=${doc.id}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'No se pudo generar el enlace de descarga');
      }

      const json = await res.json();
      const signedUrl = json.data?.signedUrl || json.signedUrl;
      if (!signedUrl) {
        throw new Error('Enlace de descarga no disponible');
      }

      // Trigger download
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = doc.file_name || doc.nombre;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descargar documento');
    } finally {
      setDownloadingId(null);
    }
  };

  // ============================================================
  // ZIP download
  // ============================================================

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/download-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al generar ZIP');
      }

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const zipName = (numeroLicitacion || licitacionId).replace(/[^a-zA-Z0-9._-]/g, '_');
      a.href = url;
      a.download = `${zipName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descargar ZIP');
    } finally {
      setDownloadingZip(false);
    }
  };

  // ============================================================
  // Toggle folder expand
  // ============================================================

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 text-gray-500 text-sm animate-pulse">
          <Package size={16} />
          <span>Cargando documentos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-gray-600" />
          <h2 className="font-semibold text-gray-900">Centro de Documentos</h2>
          {documentos.length > 0 && (
            <span className="ml-1 text-xs text-gray-500">({documentos.length} archivos)</span>
          )}
        </div>
        {documentos.length > 0 && (
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-medium hover:bg-gray-900 transition-colors disabled:opacity-60"
          >
            <Download size={14} />
            {downloadingZip ? 'Generando ZIP...' : 'Descargar Todo'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {documentos.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Package size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay documentos registrados para esta licitacion.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {FOLDERS.map(folder => {
              const folderDocs = documentos.filter(d => folder.tipos.includes(d.tipo));
              if (folderDocs.length === 0) return null;

              const isExpanded = expandedFolders[folder.key] !== false;

              return (
                <div key={folder.key} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Folder header */}
                  <button
                    onClick={() => toggleFolder(folder.key)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-gray-500 shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-500 shrink-0" />
                    )}
                    <Folder size={14} className="text-yellow-500 shrink-0" />
                    <span className="font-medium text-gray-700 text-sm">{folder.label}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {folderDocs.length} archivo{folderDocs.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Documents in folder */}
                  {isExpanded && (
                    <div className="divide-y divide-gray-100">
                      {folderDocs.map(doc => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                        >
                          <FileText size={16} className="text-gray-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 truncate">{doc.nombre}</p>
                            <p className="text-xs text-gray-400">
                              {doc.file_name}
                              {doc.file_size && ` · ${formatFileSize(doc.file_size)}`}
                              {doc.created_at && ` · ${formatDate(doc.created_at)}`}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingId === doc.id}
                            className={BTN_SECONDARY}
                            title="Descargar"
                          >
                            {downloadingId === doc.id ? (
                              <span className="flex items-center gap-1">
                                <span className="animate-spin">⌛</span>
                              </span>
                            ) : (
                              <Download size={12} className="inline" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
