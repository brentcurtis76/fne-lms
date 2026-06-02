import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { SnapshotDocument } from '@/lib/propuestas-web/snapshot';
import DocumentCard from './DocumentCard';

interface DownloadablesSectionProps {
  documents: SnapshotDocument[];
  slug: string;
  accessCode: string;
}

const TIPO_ORDER: Record<string, number> = {
  certificado_pertenencia: 1,
  carta_recomendacion: 2,
  evaluaciones_clientes: 3,
  ficha_servicio: 4,
  otro: 99,
};

export default function DownloadablesSection({
  documents,
  slug,
  accessCode,
}: DownloadablesSectionProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  if (documents.length === 0) return null;

  // Sort by tipo order
  const sorted = [...documents].sort(
    (a, b) => (TIPO_ORDER[a.tipo] ?? 99) - (TIPO_ORDER[b.tipo] ?? 99)
  );

  const handleDownload = async (docId: string) => {
    setDownloadingId(docId);
    try {
      const res = await fetch(`/api/propuestas/web/${slug}/download-doc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, sessionCode: accessCode }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Error al descargar');
      }

      // Open signed URL in new tab
      window.open(json.data.url, '_blank');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descargar el documento');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const res = await fetch(`/api/propuestas/web/${slug}/download-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCode: accessCode }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Error al descargar ZIP');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] || `${slug}.zip`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('ZIP descargado');

      // The endpoint reports any documents it could not include via headers so
      // the user isn't handed a silently-short ZIP.
      const skippedCount = Number(res.headers.get('X-Skipped-Count') || '0');
      if (skippedCount > 0) {
        const rawNames = res.headers.get('X-Skipped-Files');
        const names = rawNames ? decodeURIComponent(rawNames).split(' | ') : [];
        const detail = names.length > 0 ? `: ${names.join(', ')}` : '';
        toast(
          `No se pudieron incluir ${skippedCount} documento${skippedCount === 1 ? '' : 's'}${detail}`,
          { icon: '⚠️', duration: 8000 }
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al descargar ZIP');
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <section id="documentos" className="pw-section">
      <div className="pw-wrap">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between mb-12">
          <div>
            <p className="pw-kicker mb-4">Anexos</p>
            <h2 className="pw-h2 flex items-center gap-3">
              <FileText size={30} className="text-[#fbbf24]" />
              <span>Documentos de Respaldo</span>
            </h2>
          </div>
          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            className="pw-btn pw-btn--accent w-full sm:w-auto"
          >
            {downloadingZip ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generando ZIP...
              </>
            ) : (
              <>
                <Download size={16} />
                Descargar propuesta y documentos (.zip)
              </>
            )}
          </button>
        </div>

        <div className="pw-docs-grid">
          {sorted.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onDownload={handleDownload}
              downloading={downloadingId === doc.id}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
