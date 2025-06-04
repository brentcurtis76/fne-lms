// =============================================================================
// FNE LMS - Attachment Preview Modal Component
// =============================================================================
// Professional attachment preview for messaging system
// Phase 4 of Collaborative Workspace System

import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Eye,
  FileText,
  Calendar,
  User,
  MessageCircle,
  BarChart3,
  Share2,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Hash,
  Reply,
} from 'lucide-react';
import { MessageAttachment, MessageWithDetails } from '../../types/messaging';
import {
  getFileTypeIcon,
  getFileTypeColor,
  formatFileSize,
  formatRelativeTime,
  isPreviewSupported,
} from '../../utils/documentUtils';

interface AttachmentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: MessageAttachment | null;
  message?: MessageWithDetails;
  onDownload: (attachment: MessageAttachment) => void;
  onReply?: (message: MessageWithDetails) => void;
  onShare?: (attachment: MessageAttachment) => void;
  canReply?: boolean;
}

export default function AttachmentPreview({
  isOpen,
  onClose,
  attachment,
  message,
  onDownload,
  onReply,
  onShare,
  canReply = false,
}: AttachmentPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(100);
  const [imageRotation, setImageRotation] = useState(0);

  // Reset state when attachment changes
  useEffect(() => {
    if (attachment) {
      setLoading(false);
      setPreviewError(null);
      setImageZoom(100);
      setImageRotation(0);
    }
  }, [attachment]);

  if (!isOpen || !attachment) return null;

  const fileIcon = getFileTypeIcon(attachment.mime_type);
  const fileColor = getFileTypeColor(attachment.mime_type);
  const canPreview = isPreviewSupported(attachment.mime_type);

  // Handle download
  const handleDownload = () => {
    onDownload(attachment);
  };

  // Handle external link open
  const handleExternalOpen = () => {
    if (attachment.storage_path) {
      window.open(attachment.storage_path, '_blank');
    }
  };

  // Handle reply to message
  const handleReply = () => {
    if (message && onReply) {
      onReply(message);
      onClose();
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
                className="bg-[#00365b] text-white px-4 py-2 rounded-lg hover:bg-[#004a7c] transition-colors flex items-center space-x-2"
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

    // Image preview
    if (attachment.mime_type.startsWith('image/')) {
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
              src={attachment.storage_path}
              alt={attachment.file_name}
              className="max-w-none transition-transform duration-200"
              style={{
                transform: `scale(${imageZoom / 100}) rotate(${imageRotation}deg)`,
              }}
              onLoad={() => setLoading(false)}
              onError={() => setPreviewError('Error al cargar la imagen')}
            />
          </div>
        </div>
      );
    }

    // PDF preview
    if (attachment.mime_type === 'application/pdf') {
      return (
        <div className="flex-1 bg-gray-100">
          <iframe
            src={`${attachment.storage_path}#view=FitH`}
            className="w-full h-full border-0"
            title={attachment.file_name}
            onLoad={() => setLoading(false)}
            onError={() => setPreviewError('Error al cargar el PDF')}
          />
        </div>
      );
    }

    // Video preview
    if (attachment.mime_type.startsWith('video/')) {
      return (
        <div className="flex-1 flex items-center justify-center bg-black">
          <video
            controls
            className="max-w-full max-h-full"
            onLoadedData={() => setLoading(false)}
            onError={() => setPreviewError('Error al cargar el video')}
          >
            <source src={attachment.storage_path} type={attachment.mime_type} />
            Tu navegador no soporta la reproducción de videos.
          </video>
        </div>
      );
    }

    // Audio preview
    if (attachment.mime_type.startsWith('audio/')) {
      return (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-lg bg-[#00365b] flex items-center justify-center">
              <div className="text-white text-3xl">🎵</div>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {attachment.file_name}
            </h3>
            <audio
              controls
              className="mb-4"
              onLoadedData={() => setLoading(false)}
              onError={() => setPreviewError('Error al cargar el audio')}
            >
              <source src={attachment.storage_path} type={attachment.mime_type} />
              Tu navegador no soporta la reproducción de audio.
            </audio>
          </div>
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
                {attachment.file_name}
              </h2>
              {message && (
                <p className="text-sm text-gray-500 truncate">
                  Adjunto en mensaje de {message.author_name}
                </p>
              )}
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center space-x-2">
            {canReply && message && onReply && (
              <button
                onClick={handleReply}
                className="text-gray-600 hover:text-[#00365b] p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Responder mensaje"
              >
                <Reply className="w-5 h-5" />
              </button>
            )}

            {onShare && (
              <button
                onClick={() => onShare(attachment)}
                className="text-gray-600 hover:text-[#00365b] p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Compartir archivo"
              >
                <Share2 className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={handleDownload}
              className="bg-[#00365b] text-white px-4 py-2 rounded-lg hover:bg-[#004a7c] transition-colors flex items-center space-x-2"
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
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00365b] mx-auto mb-4" />
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

          {/* Attachment info sidebar */}
          <div className="w-80 bg-gray-50 border-l border-gray-200 p-4 overflow-y-auto">
            <div className="space-y-6">
              {/* File details */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Información del Archivo
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500">Nombre del archivo</p>
                      <p className="text-sm text-gray-900 break-all">
                        {attachment.file_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <BarChart3 className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Tamaño</p>
                      <p className="text-sm text-gray-900">
                        {formatFileSize(attachment.file_size)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Subido</p>
                      <p className="text-sm text-gray-900">
                        {formatRelativeTime(attachment.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Message context */}
              {message && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    Contexto del Mensaje
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-2">
                      <User className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Autor</p>
                        <p className="text-sm text-gray-900">
                          {message.author_name}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-2">
                      <MessageCircle className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Mensaje</p>
                        <p className="text-sm text-gray-900 line-clamp-3">
                          {message.content}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-2">
                      <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Fecha del mensaje</p>
                        <p className="text-sm text-gray-900">
                          {formatRelativeTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* File description if available */}
              {attachment.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Descripción
                  </h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {attachment.description}
                  </p>
                </div>
              )}

              {/* Download statistics */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Estadísticas
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Download className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">Descargas</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {attachment.download_count || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Eye className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">Visualizaciones</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {attachment.view_count || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex flex-col space-y-2">
                  <button
                    onClick={handleDownload}
                    className="w-full bg-[#00365b] text-white px-4 py-2 rounded-lg hover:bg-[#004a7c] transition-colors flex items-center justify-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descargar Archivo</span>
                  </button>
                  
                  {canReply && message && onReply && (
                    <button
                      onClick={handleReply}
                      className="w-full bg-[#fdb933] text-white px-4 py-2 rounded-lg hover:bg-[#e6a42d] transition-colors flex items-center justify-center space-x-2"
                    >
                      <Reply className="w-4 h-4" />
                      <span>Responder Mensaje</span>
                    </button>
                  )}
                  
                  <button
                    onClick={handleExternalOpen}
                    className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Abrir en Nueva Ventana</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}