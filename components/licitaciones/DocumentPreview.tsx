import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Eye, X } from 'lucide-react';
import type { LicitacionDocumento } from '@/types/licitaciones';
import { extractDocxText, getPreviewType } from '@/lib/licitaciones/documentPreview';

interface Props {
  licitacionId: string;
  documento: LicitacionDocumento;
  onDownload: () => void;
  downloading?: boolean;
}

const MAX_PREVIEW_SIZE = 25 * 1024 * 1024;

export default function DocumentPreview({ licitacionId, documento, onDownload, downloading }: Props) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const { kind, mime } = getPreviewType(documento);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setError(null);
    setUrl(null);
    setText(null);
    setLoading(kind !== 'unsupported');

    async function load() {
      if (kind === 'unsupported') return;
      try {
        if ((documento.file_size || 0) > MAX_PREVIEW_SIZE) {
          throw new Error('El archivo supera los 25 MB permitidos para la vista previa.');
        }
        const response = await fetch(`/api/licitaciones/${encodeURIComponent(licitacionId)}/download-doc?doc_id=${encodeURIComponent(documento.id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 || response.status === 401
          ? 'No tienes permiso para ver este documento.' : 'No se pudo cargar la vista previa.');
        const json = await response.json();
        const signedUrl = json.data?.signedUrl || json.signedUrl;
        if (!signedUrl) throw new Error('El enlace del documento no está disponible.');
        const file = await fetch(signedUrl, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!file.ok) throw new Error('No se pudo cargar el archivo. Intenta nuevamente.');
        if (Number(file.headers.get('content-length')) > MAX_PREVIEW_SIZE) {
          throw new Error('El archivo supera los 25 MB permitidos para la vista previa.');
        }
        const blob = await file.blob();
        if (controller.signal.aborted) return;
        if (blob.size > MAX_PREVIEW_SIZE) throw new Error('El archivo supera los 25 MB permitidos para la vista previa.');
        if (kind === 'docx') {
          const content = await extractDocxText(await blob.arrayBuffer());
          if (!controller.signal.aborted) setText(content || 'Este documento no contiene texto para mostrar.');
        } else {
          objectUrl = URL.createObjectURL(new Blob([blob], { type: mime }));
          setUrl(objectUrl);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'No se pudo cargar la vista previa.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, attempt, licitacionId, documento.id, documento.file_size, kind, mime]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" data-testid={`preview-document-${documento.id}`} aria-label={`Vista previa de ${documento.nombre}`}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
          <Eye size={14} aria-hidden="true" /><span className="hidden sm:inline">Vista previa</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[90dvh] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg bg-white p-4 shadow-xl" data-testid="document-preview-dialog">
          <Dialog.Title className="break-words pr-10 text-lg font-semibold">{documento.nombre}</Dialog.Title>
          <Dialog.Description className="break-words text-sm text-gray-500">
            {documento.file_name}{kind === 'docx' ? ' · Vista de texto: no incluye imágenes ni formato original.' : ''}
          </Dialog.Description>
          <Dialog.Close asChild>
            <button type="button" data-testid="close-document-preview" aria-label="Cerrar vista previa" className="absolute right-4 top-4 rounded p-1 hover:bg-gray-100"><X size={20} /></button>
          </Dialog.Close>
          <div className="min-h-0 flex-1 overflow-auto rounded border bg-gray-50 p-2" aria-busy={loading}>
            {loading && <p role="status" className="p-6 text-center">Cargando vista previa...</p>}
            {error && <div role="alert" className="p-6 text-center"><p>{error}</p><button type="button" data-testid="retry-document-preview" className="mt-3 rounded border px-3 py-2" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></div>}
            {kind === 'unsupported' && <p className="p-6 text-center">Este formato no admite vista previa. Puedes descargar el documento para abrirlo.</p>}
            {!loading && !error && url && kind === 'pdf' && <iframe src={url} title={`Vista previa de ${documento.nombre}`} className="h-full min-h-64 w-full border-0" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {!loading && !error && url && kind === 'image' && <img src={url} alt={documento.nombre} className="mx-auto max-w-full" onError={() => setError('No se pudo mostrar la imagen.')} />}
            {!loading && !error && text !== null && <div className="whitespace-pre-wrap break-words bg-white p-4 text-sm text-gray-900">{text}</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {kind === 'pdf' && <p className="text-xs text-gray-500">Si tu navegador no muestra el PDF, puedes descargarlo.</p>}
            <button type="button" data-testid="download-preview-document" onClick={onDownload} disabled={downloading} className="ml-auto rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{downloading ? 'Generando...' : 'Descargar documento'}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
