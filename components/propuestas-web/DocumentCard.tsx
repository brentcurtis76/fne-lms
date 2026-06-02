import { FileText, Download, Loader2 } from 'lucide-react';
import type { SnapshotDocument } from '@/lib/propuestas-web/snapshot';

const TIPO_LABELS: Record<string, string> = {
  certificado_pertenencia: 'Certificado',
  carta_recomendacion: 'Carta de Recomendación',
  evaluaciones_clientes: 'Evaluaciones de Clientes',
  ficha_servicio: 'Ficha de Servicio',
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
    <article className="pw-doc-card">
      <div className="flex items-start gap-4">
        <div className="pw-doc-card__icon flex-shrink-0">
          <FileText size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-black text-[#0a0a0a] leading-tight">{document.nombre}</h4>
          <p className="text-gray-500 text-xs uppercase tracking-[0.16em] mt-2 font-bold">{typeLabel}</p>
          {document.descripcion && (
            <p className="text-gray-600 text-sm mt-4 leading-relaxed">{document.descripcion}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => onDownload(document.id)}
        disabled={downloading}
        className="pw-btn pw-btn--ink mt-6 w-full"
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
    </article>
  );
}
