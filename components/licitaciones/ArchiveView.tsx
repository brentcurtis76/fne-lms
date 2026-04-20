import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, FileText, Folder, Upload } from 'lucide-react';
import { LicitacionDetail, LicitacionDocumento } from '@/types/licitaciones';

interface ArchiveViewProps {
  licitacion: LicitacionDetail;
  isAdmin: boolean;
  isEncargado: boolean;
  onRefresh: () => void;
}

// Only the 5 buckets that the spec lists for the archive view.
type ArchiveTipo = LicitacionDocumento['tipo'];

interface Bucket {
  key: string;
  label: string;
  uploadTipo: ArchiveTipo;
  tipos: ArchiveTipo[];
}

const BUCKETS: Bucket[] = [
  {
    key: 'publicaciones',
    label: 'Publicaciones',
    uploadTipo: 'publicacion_imagen',
    tipos: ['publicacion_imagen'],
  },
  {
    key: 'bases',
    label: 'Bases',
    uploadTipo: 'bases_generadas',
    tipos: ['bases_generadas', 'bases_enviadas'],
  },
  {
    key: 'propuestas',
    label: 'Propuestas',
    uploadTipo: 'propuesta',
    tipos: ['propuesta'],
  },
  {
    key: 'evaluacion',
    label: 'Evaluacion',
    uploadTipo: 'evaluacion_generada',
    tipos: ['evaluacion_generada', 'evaluacion_firmada'],
  },
  {
    key: 'anexos',
    label: 'Anexos',
    uploadTipo: 'anexos',
    tipos: ['anexos'],
  },
];

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCreatedAt(dateStr: string): string {
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

export default function ArchiveView({
  licitacion,
  isAdmin,
  isEncargado,
  onRefresh,
}: ArchiveViewProps) {
  const [documentos, setDocumentos] = useState<LicitacionDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadingBucket, setUploadingBucket] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const canUpload = isAdmin || isEncargado;
  const licitacionId = licitacion.id;

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
      const res = await fetch(
        `/api/licitaciones/${licitacionId}/download-doc?doc_id=${doc.id}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || 'No se pudo generar el enlace de descarga'
        );
      }
      const json = await res.json();
      const signedUrl = json.data?.signedUrl || json.signedUrl;
      if (!signedUrl) {
        throw new Error('Enlace de descarga no disponible');
      }
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

  const handleUpload = async (bucket: Bucket, file: File) => {
    setUploadingBucket(bucket.key);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', bucket.uploadTipo);
      formData.append('nombre', `${bucket.label} - ${file.name}`);

      const res = await fetch(`/api/licitaciones/${licitacionId}/upload`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al subir archivo');
      }
      toast.success('Archivo subido exitosamente');
      await loadDocumentos();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir archivo');
    } finally {
      setUploadingBucket(null);
      const input = fileInputRefs.current[bucket.key];
      if (input) input.value = '';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Archivo historico</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Licitacion importada como registro historico. Solo lectura y gestion de documentos.
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
            Historico
          </span>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-sm text-gray-500 animate-pulse py-6 text-center">
            Cargando documentos...
          </div>
        ) : (
          <div className="space-y-3">
            {BUCKETS.map(bucket => {
              const bucketDocs = documentos.filter(d => bucket.tipos.includes(d.tipo));
              const isUploading = uploadingBucket === bucket.key;

              return (
                <div
                  key={bucket.key}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
                    <Folder size={14} className="text-yellow-500 shrink-0" />
                    <span className="font-medium text-gray-700 text-sm">{bucket.label}</span>
                    <span className="ml-1 text-xs text-gray-400">
                      {bucketDocs.length} archivo{bucketDocs.length !== 1 ? 's' : ''}
                    </span>
                    {canUpload && (
                      <div className="ml-auto flex items-center">
                        <input
                          ref={el => {
                            fileInputRefs.current[bucket.key] = el;
                          }}
                          type="file"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(bucket, file);
                          }}
                        />
                        <button
                          onClick={() => fileInputRefs.current[bucket.key]?.click()}
                          disabled={isUploading}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs hover:bg-white transition-colors disabled:opacity-60"
                        >
                          <Upload size={12} />
                          {isUploading ? 'Subiendo...' : 'Subir'}
                        </button>
                      </div>
                    )}
                  </div>

                  {bucketDocs.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-400">
                      Sin archivos en este bucket.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {bucketDocs.map(doc => (
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
                              {doc.created_at ? ` · ${formatCreatedAt(doc.created_at)}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingId === doc.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-xs hover:bg-gray-50 transition-colors disabled:opacity-60"
                          >
                            <Download size={12} />
                            {downloadingId === doc.id ? 'Descargando...' : 'Descargar'}
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
