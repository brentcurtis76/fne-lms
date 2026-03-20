import { FileText, Download, Loader2 } from 'lucide-react';
import type { SnapshotDocument } from '@/lib/propuestas-web/snapshot';

const TIPO_LABELS: Record<string, string> = {
  certificado_pertenencia: 'Certificado',
  carta_recomendacion: 'Carta de Recomendación',
  cv_pdf: 'Currículum Vitae',
  otro: 'Documento',
};

interface DocumentCardProps {
  document: SnapshotDocument;
  onDownload: (docId: string) => Promise<void>;
  downloading: boolean;
}

export default function DocumentCard({ document, onDownload, downloading }: DocumentCardProps) {
  const typeLabel = TIPO_LABELS[document.tipo] || document.tipo;

  return (
    <div className="border-2 border-[#0a0a0a] rounded-2xl p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <FileText size={32} className="text-[#fbbf24]" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-[#0a0a0a] truncate">{document.nombre}</h4>
          <p className="text-gray-500 text-sm uppercase tracking-wider mt-1">{typeLabel}</p>
          {document.descripcion && (
            <p className="text-gray-600 text-sm mt-2">{document.descripcion}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => onDownload(document.id)}
        disabled={downloading}
        className="mt-4 w-full flex items-center justify-center gap-2 bg-[#0a0a0a] text-white rounded-full px-4 py-2.5 text-sm font-medium hover:bg-[#1f1f1f] transition-colors disabled:opacity-50"
      >
        {downloading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Descargando...
          </>
        ) : (
          <>
            <Download size={16} />
            Descargar
          </>
        )}
      </button>
    </div>
  );
}
