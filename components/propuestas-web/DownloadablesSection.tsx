import { useState } from 'react';
import { FileText } from 'lucide-react';
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
  cv_pdf: 3,
  otro: 4,
};

export default function DownloadablesSection({
  documents,
  slug,
  accessCode,
}: DownloadablesSectionProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  return (
    <section className="bg-white py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <FileText size={28} className="text-[#fbbf24]" />
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0a0a0a]">
            Documentos de Respaldo
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
