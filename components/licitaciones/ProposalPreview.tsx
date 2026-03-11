/**
 * ProposalPreview — client-only in-browser PDF preview.
 *
 * Renders the proposal body (Evoluciona or Preparación template) using
 * @react-pdf/renderer's PDFViewer. Supporting documents are excluded —
 * those are merged server-side only.
 *
 * All heavy imports are dynamically loaded with ssr:false so this
 * component has zero impact on server rendering.
 *
 * Config changes are debounced (1 s) to avoid re-rendering on every keystroke.
 */
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { ProposalConfig } from '@/lib/propuestas/generator';

// ── Loading placeholder ────────────────────────────────────────────────────
function PDFLoadingState() {
  return (
    <div className="flex flex-col justify-center items-center h-64 gap-2 text-gray-500">
      <Loader2 size={24} className="animate-spin text-yellow-500" />
      <span className="text-sm">Cargando visor PDF…</span>
    </div>
  );
}

// ── @react-pdf/renderer PDFViewer — browser-only ───────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PDFViewer = dynamic<any>(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFViewer),
  { ssr: false, loading: PDFLoadingState }
);

// ── PreviewDocument — wraps template + Document, also browser-only ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PreviewDocument = dynamic<any>(
  () =>
    import('@/lib/propuestas/PreviewDocument').then(
      (mod) => mod.PreviewDocument
    ),
  { ssr: false, loading: PDFLoadingState }
);

// ── Props ──────────────────────────────────────────────────────────────────
interface ProposalPreviewProps {
  config: ProposalConfig;
}

// ── Component ──────────────────────────────────────────────────────────────
export function ProposalPreview({ config }: ProposalPreviewProps) {
  // Debounce config so we don't re-render the PDF on every keystroke
  const [debouncedConfig, setDebouncedConfig] = useState<ProposalConfig>(config);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedConfig(config);
    }, 1000);
    return () => clearTimeout(timer);
  }, [config]);

  return (
    <div className="border border-yellow-200 rounded-lg overflow-hidden bg-gray-50 mt-4">
      {/* Banner */}
      <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-200 flex items-center justify-between">
        <p className="text-xs font-medium text-yellow-800">
          Vista Previa — solo cuerpo (sin documentos adjuntos)
        </p>
        <p className="text-xs text-gray-500">
          Se actualiza 1 s tras el último cambio
        </p>
      </div>

      {/* PDF Viewer */}
      <PDFViewer
        width="100%"
        height="700"
        showToolbar={false}
        style={{ border: 'none', display: 'block' }}
      >
        <PreviewDocument config={debouncedConfig} />
      </PDFViewer>
    </div>
  );
}
