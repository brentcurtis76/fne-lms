import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { Download, Upload, FileText, Archive } from 'lucide-react';
import { LicitacionDocumento } from '@/types/licitaciones';

interface ArchiveViewProps {
  licitacionId: string;
  isAdmin?: boolean;
  isEncargado?: boolean;
}

type DocTipo = LicitacionDocumento['tipo'];

interface BucketInfo {
  key: string;
  label: string;
  tipos: DocTipo[];
  uploadTipo: DocTipo;
}

const BUCKETS: BucketInfo[] = [
  { key: 'publicaciones', label: 'Publicaciones', tipos: ['publicacion_imagen'], uploadTipo: 'publicacion_imagen' },
  { key: 'bases', label: 'Bases', tipos: ['bases_generadas', 'bases_enviadas'], uploadTipo: 'bases_enviadas' },
  { key: 'propuestas', label: 'Propuestas', tipos: ['propuesta'], uploadTipo: 'propuesta' },
  { key: 'evaluacion', label: 'Evaluacion', tipos: ['evaluacion_generada', 'evaluacion_firmada'], uploadTipo: 'evaluacion_firmada' },
  { key: 'adjudicacion', label: 'Adjudicacion', tipos: ['carta_adjudicacion_generada', 'carta_adjudicacion_firmada'], uploadTipo: 'carta_adjudicacion_firmada' },
  { key: 'anexos', label: 'Anexos', tipos: ['anexos'], uploadTipo: 'anexos' },
  { key: 'otros', label: 'Otros', tipos: ['otro'], uploadTipo: 'otro' },
];

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

export default function ArchiveView({ licitacionId, isAdmin = false, isEncargado = false }: ArchiveViewProps) {
  const canUpload = isAdmin || isEncargado;
  const [documentos, setDocumentos] = useState<LicitacionDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadingBucket, setUploadingBucket] = useState<string | null>(null);

  const loadDocumentos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/documentos`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Error al cargar documentos');
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

  const handleDownload = async (doc: LicitacionDocumento) => {
    setDownloadingId(doc.id);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}/download-doc?doc_id=${doc.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'No se pudo generar el enlace de descarga');
      }
      const json = await res.json();
      const signedUrl = json.data?.signedUrl || json.signedUrl;
      if (!signedUrl) throw new Error('Enlace de descarga no disponible');

      // Supabase signed URLs are cross-origin, so browsers ignore `download`
      // and open the URL directly; opening in a new tab lets the browser
      // preview PDFs/images inline and trigger its native download for
      // unpreviewable types like .docx.
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descargar documento');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUpload = async (bucket: BucketInfo, file: File) => {
    setUploadingBucket(bucket.key);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', bucket.uploadTipo);
      formData.append('nombre', file.name);

      const res = await fetch(`/api/licitaciones/${licitacionId}/upload`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al subir archivo');
      }
      toast.success('Archivo subido');
      loadDocumentos();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploadingBucket(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
        <Archive size={18} className="text-gray-600" />
        <h2 className="font-semibold text-gray-900">Archivo Historico</h2>
        <span className="ml-2 text-xs text-gray-500">
          Licitacion cerrada · documentacion de registro
        </span>
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm animate-pulse">
            Cargando documentos...
          </div>
        ) : (
          BUCKETS.map(bucket => {
            const bucketDocs = documentos.filter(d => bucket.tipos.includes(d.tipo));
            const uploading = uploadingBucket === bucket.key;

            return (
              <div key={bucket.key} className="border border-gray-200 rounded-lg">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-medium text-gray-800 text-sm">{bucket.label}</h3>
                  <span className="text-xs text-gray-500">
                    {bucketDocs.length} archivo{bucketDocs.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="divide-y divide-gray-100">
                  {bucketDocs.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-400 italic">
                      Sin archivos en esta categoria.
                    </div>
                  ) : (
                    bucketDocs.map(doc => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <FileText size={16} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{doc.nombre}</p>
                          <p className="text-xs text-gray-400">
                            {doc.file_name}
                            {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
                            {doc.created_at ? ` · ${formatDate(doc.created_at)}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={downloadingId === doc.id}
                          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-xs disabled:opacity-60"
                        >
                          <Download size={12} />
                          {downloadingId === doc.id ? 'Generando...' : 'Descargar'}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {canUpload && (
                  <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-medium hover:bg-gray-900 transition-colors disabled:opacity-60">
                        <Upload size={12} />
                        {uploading ? 'Subiendo...' : 'Subir archivo'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleUpload(bucket, file);
                            e.target.value = '';
                          }
                        }}
                      />
                      <span className="text-xs text-gray-500">
                        PDF, Word o imagen · hasta 25 MB
                      </span>
                    </label>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
