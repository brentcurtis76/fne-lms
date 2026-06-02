/**
 * ProposalPreview — client-only in-browser PDF preview.
 *
 * Generates the proposal PDF in the browser via jsPDF and renders the
 * resulting Blob in an <iframe>. This reflects exactly what users will
 * download — the preview and the downloaded artifact share one code path.
 *
 * Snapshot changes are debounced (1 s) to avoid regenerating on every
 * keystroke. The jsPDF generator is dynamically imported so it stays out
 * of the SSR build and the initial client bundle.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ProposalSnapshot } from '@/lib/propuestas-web/snapshot';

interface ProposalPreviewProps {
  snapshot: ProposalSnapshot;
}

export function ProposalPreview({ snapshot }: ProposalPreviewProps) {
  const [debouncedSnapshot, setDebouncedSnapshot] = useState<ProposalSnapshot>(snapshot);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  // Debounce snapshot changes by 1 s.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSnapshot(snapshot), 1000);
    return () => clearTimeout(timer);
  }, [snapshot]);

  // Regenerate the PDF whenever the debounced snapshot changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { generateProposalPDFBlob } = await import('@/lib/propuestas-web/pdf-generator');
        if (cancelled) return;
        const blob = generateProposalPDFBlob(debouncedSnapshot);
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = url;
        setPdfUrl(url);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error al generar la vista previa');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSnapshot]);

  // Revoke the active object URL on unmount.
  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
    };
  }, []);

  return (
    <div className="border border-yellow-200 rounded-lg overflow-hidden bg-gray-50 mt-4">
      <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center justify-between">
        <p className="text-xs font-medium text-yellow-800">
          Vista Previa — refleja el PDF que se generará y descargará
        </p>
        <p className="text-xs text-gray-500">Se actualiza 1 s tras el último cambio</p>
      </div>

      <div className="relative bg-white" style={{ height: 700 }}>
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-red-600 px-4 text-center">
            <span className="text-sm font-medium">No se pudo generar la vista previa</span>
            <span className="text-xs text-red-500">{error}</span>
          </div>
        ) : (
          <>
            {pdfUrl && (
              <iframe
                src={pdfUrl}
                title="Vista previa de la propuesta"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              />
            )}
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/80">
                <Loader2 size={24} className="animate-spin text-yellow-500" />
                <span className="text-sm">Generando vista previa…</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
