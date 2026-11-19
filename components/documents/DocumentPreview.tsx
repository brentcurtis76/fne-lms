// =============================================================================
// Genera - Document Preview Modal Component
// =============================================================================
// Professional document preview with support for images, PDFs, and file info

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Eye,
  FileText,
  Calendar,
  User,
  Tag,
  BarChart3,
  Share2,
  Edit2,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { DocumentWithDetails } from '../../types/documents';
import {
  isPreviewSupported,
  getFileTypeIcon,
  getFileTypeColor,
  formatRelativeTime,
  getDocumentLink,
} from '../../utils/documentUtils';
import { formatFileSize } from '../../lib/utils/file-format';

// F12d (EC-S3): the file is shown and opened only through a five-minute link
// signed by /api/community/documents/<id>/link; a link is reused for at most
// four minutes, then asked for again.
const LINK_MAX_AGE_MS = 4 * 60 * 1000;
const LINK_FAILED = 'No se pudo abrir el documento. Inténtalo de nuevo.';

// Send-back 2: how a preview shows its file. Pictures and PDFs are fetched
// ONCE, whole, and shown from an object address (blob:) that never expires;
// videos stream from the signed link, renewed every four minutes.
type PreviewKind = 'fetched' | 'video' | 'none';
const previewKindOf = (mimeType: string): PreviewKind =>
  mimeType.startsWith('image/') || mimeType === 'application/pdf'
    ? 'fetched'
    : mimeType.startsWith('video/')
      ? 'video'
      : 'none';
const loadErrorOf = (mimeType: string): string =>
  mimeType === 'application/pdf'
    ? 'Error al cargar el PDF'
    : mimeType.startsWith('video/')
      ? 'Error al cargar el video'
      : 'Error al cargar la imagen';

interface DocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentWithDetails | null;
  onDownload: (document: DocumentWithDetails) => void;
  onEdit?: (document: DocumentWithDetails) => void;
  onShare?: (document: DocumentWithDetails) => void;
  canEdit?: boolean;
}

export default function DocumentPreview({
  isOpen,
  onClose,
  document,
  onDownload,
  onEdit,
  onShare,
  canEdit = false,
}: DocumentPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(100);
  const [imageRotation, setImageRotation] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  // What the preview shows: the object address (picture, PDF) or the signed
  // link (video), always tied to the document it belongs to.
  const [source, setSource] = useState<{ documentId: string; url: string } | null>(null);
  const linkCache = useRef<{ documentId: string; url: string; at: number } | null>(null);
  // Send-back 2: ONE guard for everything asynchronous. It changes whenever
  // the preview opens, closes, unmounts or shows another document; every
  // completion first checks it still holds the value it started with.
  const generation = useRef(0);

  const freshLink = (documentId: string): string | null => {
    const cached = linkCache.current;
    return cached && cached.documentId === documentId && Date.now() - cached.at < LINK_MAX_AGE_MS ? cached.url : null;
  };
  const requestLink = async (documentId: string): Promise<string> => {
    const url = await getDocumentLink(documentId);
    linkCache.current = { documentId, url, at: Date.now() };
    return url;
  };

  // Reset state when document changes
  useEffect(() => {
    if (document) {
      setLoading(false);
      setPreviewError(null);
      setImageZoom(100);
      setImageRotation(0);
      setCurrentImageIndex(0);
    }
  }, [document]);

  const documentId = document?.id;
  const mimeType = document?.mime_type ?? '';
  const previewable = !!document && isPreviewSupported(document.mime_type);
  const kind: PreviewKind = previewable ? previewKindOf(mimeType) : 'none';

  // The one retry of a video is counted per document shown.
  const retried = useRef(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const gen = ++generation.current;
    const current = () => generation.current === gen;
    retried.current = false;
    setSource(null);
    if (!isOpen || !documentId || !previewable) {
      setLoading(false);
      return () => {
        generation.current++;
      };
    }
    const id = documentId;
    setPreviewError(null);

    // Pictures and PDFs: ask for the link, fetch the whole file once, show it
    // from an object address. If the link or the fetch fails: ONE more try
    // with a fresh link, then the existing error panel. The object address is
    // released when the preview closes or changes document.
    if (kind === 'fetched') {
      let objectUrl: string | null = null;
      const fetchWhole = async (url: string): Promise<Blob> => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // The object address carries the document's own type (an image type
        // or application/pdf), never what the store answered: an object
        // address is of this site's origin.
        return new Blob([await response.blob()], { type: mimeType });
      };
      const attempt = async (fresh: boolean): Promise<Blob> => {
        let url: string;
        try {
          url = (!fresh && freshLink(id)) || (await requestLink(id));
        } catch {
          throw new Error(LINK_FAILED);
        }
        try {
          return await fetchWhole(url);
        } catch {
          throw new Error(loadErrorOf(mimeType));
        }
      };
      setLoading(true);
      attempt(false)
        .catch(() => {
          if (!current()) throw new Error(LINK_FAILED);
          return attempt(true);
        })
        .then(blob => {
          if (!current()) return;
          objectUrl = URL.createObjectURL(blob);
          setSource({ documentId: id, url: objectUrl });
          setLoading(false);
        })
        .catch((failure: Error) => {
          if (!current()) return;
          setLoading(false);
          setPreviewError(failure.message);
        });
      return () => {
        generation.current++;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    // Video: stream from the signed link; while open, a fresh link is asked
    // for every four minutes and swapped in (a failed renewal keeps the
    // current link; a load error then gets its retry below).
    const fresh = freshLink(id);
    if (fresh) {
      setSource({ documentId: id, url: fresh });
      setLoading(false);
    } else {
      setLoading(true);
      requestLink(id)
        .then(url => {
          if (!current()) return;
          setSource({ documentId: id, url });
          setLoading(false);
        })
        .catch(() => {
          if (!current()) return;
          setLoading(false);
          setPreviewError(LINK_FAILED);
        });
    }
    const timer = setInterval(() => {
      requestLink(id)
        .then(url => {
          if (current()) setSource({ documentId: id, url });
        })
        .catch(() => {});
    }, LINK_MAX_AGE_MS);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [isOpen, documentId, previewable, kind, mimeType]);

  const shownUrl = source && source.documentId === documentId ? source.url : null;

  // A video whose link is swapped (or retried) keeps its place: before
  // reloading the element, its position and playing state are read; once the
  // source's metadata arrives, the position is set back and playback resumed
  // if it was playing. A retry reloads even when the new link equals the old.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shownLink = useRef<{ documentId?: string; url: string | null; tick: number }>({ url: null, tick: 0 });
  useEffect(() => {
    const previous = shownLink.current;
    shownLink.current = { documentId, url: shownUrl, tick: reloadTick };
    const video = videoRef.current;
    if (kind !== 'video' || !video || !shownUrl || !previous.url || previous.documentId !== documentId) return;
    if (previous.url === shownUrl && previous.tick === reloadTick) return;
    const position = video.currentTime;
    const playing = !video.paused && !video.ended;
    const resume = () => {
      video.removeEventListener('loadedmetadata', resume);
      if (position > 0) video.currentTime = position;
      if (playing) void video.play()?.catch(() => {});
    };
    video.addEventListener('loadedmetadata', resume);
    const sourceElement = video.querySelector('source');
    if (sourceElement) sourceElement.src = shownUrl;
    video.load();
  }, [shownUrl, reloadTick, kind, documentId]);

  // A video load error: ONE retry per document shown with a fresh link that
  // really restarts the element, then the existing error panel. A picture or
  // PDF is already whole in memory: an error there goes to the panel.
  const handleLoadError = (message: string) => {
    if (kind !== 'video' || retried.current || !documentId) {
      setPreviewError(message);
      return;
    }
    retried.current = true;
    const gen = generation.current;
    const id = documentId;
    requestLink(id)
      .then(url => {
        if (generation.current !== gen) return;
        setSource({ documentId: id, url });
        setReloadTick(tick => tick + 1);
      })
      .catch(() => {
        if (generation.current === gen) setPreviewError(message);
      });
  };
  const handleLoaded = () => {
    setLoading(false);
  };

  if (!isOpen || !document) return null;

  const fileIcon = getFileTypeIcon(document.mime_type);
  const fileColor = getFileTypeColor(document.mime_type);
  const documentUrl = shownUrl;
  const canPreview = previewable;

  // Handle download
  const handleDownload = () => {
    onDownload(document);
  };

  // Handle external link open: the tab is reserved during the click (a
  // browser blocks one opened only after the wait), then sent to the link.
  const handleExternalOpen = async () => {
    const tab = window.open('', '_blank');
    if (!tab) {
      setPreviewError(LINK_FAILED);
      return;
    }
    tab.opener = null;
    try {
      tab.location.href = freshLink(document.id) ?? (await requestLink(document.id));
    } catch {
      tab.close();
      setPreviewError(LINK_FAILED);
    }
  };

  // Image manipulation functions
  const handleZoomIn = () => setImageZoom(prev => Math.min(prev + 25, 300));
  const handleZoomOut = () => setImageZoom(prev => Math.max(prev - 25, 25));
  const handleRotate = () => setImageRotation(prev => (prev + 90) % 360);
  const handleResetView = () => {
    setImageZoom(100);
    setImageRotation(0);
  };

  // Render preview content
  const renderPreviewContent = () => {
    if (!canPreview) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div
              className="w-24 h-24 mx-auto mb-4 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: fileColor }}
            >
              <div className="text-3xl">
                {fileIcon === 'FileText' && <FileText className="w-12 h-12" />}
                {fileIcon === 'Image' && <div>📷</div>}
                {fileIcon === 'Video' && <div>🎥</div>}
                {fileIcon === 'File' && <div>📄</div>}
              </div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Vista previa no disponible
            </h3>
            <p className="text-gray-500 mb-4">
              Este tipo de archivo no se puede previsualizar en el navegador.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleDownload}
                className="bg-[#0a0a0a] text-white px-4 py-2 rounded-lg hover:bg-legacy-004a7c transition-colors flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Descargar</span>
              </button>
              <button
                onClick={handleExternalOpen}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!documentUrl) return null;

    // Image preview
    if (document.mime_type.startsWith('image/')) {
      return (
        <div className="flex-1 flex flex-col bg-gray-900">
          {/* Image controls */}
          <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleZoomOut}
                className="text-white hover:text-gray-300 p-1 rounded"
                disabled={imageZoom <= 25}
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white text-sm font-medium">
                {imageZoom}%
              </span>
              <button
                onClick={handleZoomIn}
                className="text-white hover:text-gray-300 p-1 rounded"
                disabled={imageZoom >= 300}
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <div className="border-l border-gray-600 h-6 mx-2" />
              <button
                onClick={handleRotate}
                className="text-white hover:text-gray-300 p-1 rounded"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                onClick={handleResetView}
                className="text-white hover:text-gray-300 text-sm px-3 py-1 rounded"
              >
                Restablecer
              </button>
            </div>
          </div>

          {/* Image container */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img
              src={documentUrl || undefined}
              alt={document.title}
              className="max-w-none transition-transform duration-200"
              style={{
                transform: `scale(${imageZoom / 100}) rotate(${imageRotation}deg)`,
              }}
              onLoad={handleLoaded}
              onError={() => handleLoadError('Error al cargar la imagen')}
            />
          </div>
        </div>
      );
    }

    // PDF preview
    if (document.mime_type === 'application/pdf') {
      return (
        <div className="flex-1 bg-gray-100">
          <iframe
            src={`${documentUrl}#view=FitH`}
            className="w-full h-full border-0"
            title={document.title}
            onLoad={handleLoaded}
            onError={() => handleLoadError('Error al cargar el PDF')}
          />
        </div>
      );
    }

    // Video preview
    if (document.mime_type.startsWith('video/')) {
      return (
        <div className="flex-1 flex items-center justify-center bg-black">
          <video
            key={document.id}
            ref={videoRef}
            controls
            className="max-w-full max-h-full"
            onLoadedData={handleLoaded}
            onError={() => handleLoadError('Error al cargar el video')}
          >
            <source src={documentUrl || undefined} type={document.mime_type} />
            Tu navegador no soporta la reproducción de videos.
          </video>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white rounded-t-lg">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div style={{ color: fileColor }}>
              {fileIcon === 'FileText' && <FileText className="w-6 h-6" />}
              {fileIcon === 'Image' && <div className="text-2xl">📷</div>}
              {fileIcon === 'Video' && <div className="text-2xl">🎥</div>}
              {fileIcon === 'File' && <div className="text-2xl">📄</div>}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {document.title}
              </h2>
              <p className="text-sm text-gray-500 truncate">
                {document.file_name}
              </p>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center space-x-2">
            {canEdit && onEdit && (
              <button
                onClick={() => onEdit(document)}
                className="text-gray-600 hover:text-[#0a0a0a] p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Editar documento"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            )}

            {onShare && (
              <button
                onClick={() => onShare(document)}
                className="text-gray-600 hover:text-[#0a0a0a] p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Compartir documento"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={handleDownload}
              className="bg-[#0a0a0a] text-white px-4 py-2 rounded-lg hover:bg-legacy-004a7c transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Descargar</span>
            </button>

            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-800 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Preview area */}
          <div className="flex-1 flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a0a0a] mx-auto mb-4" />
                  <p className="text-gray-500">Cargando vista previa...</p>
                </div>
              </div>
            ) : previewError ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-red-500 text-6xl mb-4">⚠️</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Error al cargar
                  </h3>
                  <p className="text-gray-500">{previewError}</p>
                </div>
              </div>
            ) : (
              renderPreviewContent()
            )}
          </div>

          {/* Document info sidebar */}
          <div className="w-80 bg-gray-50 border-l border-gray-200 p-4 overflow-y-auto">
            <div className="space-y-6">
              {/* Document details */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Información del Documento
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Archivo</p>
                      <p className="text-sm text-gray-900 break-all">
                        {document.file_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <BarChart3 className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Tamaño</p>
                      <p className="text-sm text-gray-900">
                        {formatFileSize(document.file_size)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <User className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Subido por</p>
                      <p className="text-sm text-gray-900">
                        {document.uploader_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Fecha de subida</p>
                      <p className="text-sm text-gray-900">
                        {formatRelativeTime(document.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {document.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Descripción
                  </h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {document.description}
                  </p>
                </div>
              )}

              {/* Tags */}
              {document.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Etiquetas
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {document.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800"
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Statistics */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Estadísticas
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Eye className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">Visualizaciones</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {document.view_count}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Download className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">Descargas</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {document.download_count}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">Versión</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {document.current_version}
                    </span>
                  </div>
                </div>
              </div>

              {/* Folder location */}
              {document.folder_name && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Ubicación
                  </h3>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <div className="text-[#fbbf24]">📁</div>
                    <span>{document.folder_name}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}