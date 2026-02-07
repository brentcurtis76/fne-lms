// =============================================================================
// Genera - Document Grid Component
// =============================================================================
// Professional document grid/list view with thumbnails, actions, and selection

import React, { useState } from 'react';
import {
  File,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  Video,
  Download,
  Eye,
  Edit2,
  Trash2,
  Move,
  Share2,
  MoreVertical,
  Folder,
  FolderOpen,
  Calendar,
  User,
  TrendingDown,
  TrendingUp,
  Grid,
  List,
} from 'lucide-react';
import {
  DocumentWithDetails,
  FolderWithBreadcrumb,
  DocumentViewMode,
  DocumentAction,
  DocumentPermission,
} from '../../types/documents';
import {
  getFileTypeIcon,
  getFileTypeColor,
  formatFileSize,
  formatRelativeTime,
  canUserEditDocument,
  canUserDeleteDocument,
} from '../../utils/documentUtils';

interface DocumentGridProps {
  documents: DocumentWithDetails[];
  folders: FolderWithBreadcrumb[];
  viewMode: DocumentViewMode;
  onDocumentClick: (document: DocumentWithDetails) => void;
  onFolderClick: (folder: FolderWithBreadcrumb) => void;
  onDocumentAction: (action: DocumentAction, document: DocumentWithDetails) => void;
  selectedDocuments: string[];
  onSelectionChange: (documentIds: string[]) => void;
  permissions: DocumentPermission;
  loading?: boolean;
  userId: string;
}

export default function DocumentGrid({
  documents,
  folders,
  viewMode,
  onDocumentClick,
  onFolderClick,
  onDocumentAction,
  selectedDocuments,
  onSelectionChange,
  permissions,
  loading = false,
  userId,
}: DocumentGridProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Icon mapping for file types
  const getFileIcon = (mimeType: string) => {
    const iconName = getFileTypeIcon(mimeType);
    const iconMap: { [key: string]: React.ReactNode } = {
      FileText: <FileText className="w-5 h-5" />,
      FileSpreadsheet: <FileSpreadsheet className="w-5 h-5" />,
      Presentation: <Presentation className="w-5 h-5" />,
      /* eslint-disable-next-line jsx-a11y/alt-text */
      Image: <Image className="w-5 h-5" />,
      Video: <Video className="w-5 h-5" />,
      File: <File className="w-5 h-5" />,
    };
    return iconMap[iconName] || <File className="w-5 h-5" />;
  };

  // Handle document selection
  const handleDocumentSelect = (documentId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedDocuments, documentId]);
    } else {
      onSelectionChange(selectedDocuments.filter(id => id !== documentId));
    }
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(documents.map(doc => doc.id));
    } else {
      onSelectionChange([]);
    }
  };

  // Document actions dropdown
  const DocumentActionsDropdown = ({ document }: { document: DocumentWithDetails }) => {
    const canEdit = canUserEditDocument(document, userId, permissions);
    const canDelete = canUserDeleteDocument(document, userId, permissions);

    return (
      <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
        <button
          onClick={() => {
            onDocumentAction('view', document);
            setActiveDropdown(null);
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
        >
          <Eye className="w-4 h-4" />
          <span>Ver</span>
        </button>
        
        <button
          onClick={() => {
            onDocumentAction('download', document);
            setActiveDropdown(null);
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
        >
          <Download className="w-4 h-4" />
          <span>Descargar</span>
        </button>

        {permissions.can_share && (
          <button
            onClick={() => {
              onDocumentAction('share', document);
              setActiveDropdown(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir</span>
          </button>
        )}

        {canEdit && (
          <button
            onClick={() => {
              onDocumentAction('edit', document);
              setActiveDropdown(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
          >
            <Edit2 className="w-4 h-4" />
            <span>Editar</span>
          </button>
        )}

        <button
          onClick={() => {
            onDocumentAction('move', document);
            setActiveDropdown(null);
          }}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
        >
          <Move className="w-4 h-4" />
          <span>Mover</span>
        </button>

        {canDelete && (
          <>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => {
                onDocumentAction('delete', document);
                setActiveDropdown(null);
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar</span>
            </button>
          </>
        )}
      </div>
    );
  };

  // Folder card component
  const FolderCard = ({ folder }: { folder: FolderWithBreadcrumb }) => (
    <div
      onClick={() => onFolderClick(folder)}
      className="group cursor-pointer bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 p-4"
    >
      <div className="flex items-center space-x-3">
        <div className="text-[#fbbf24]">
          <Folder className="w-8 h-8" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate group-hover:text-[#0a0a0a]">
            {folder.folder_name}
          </h3>
          <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
            <span>{folder.document_count || 0} documentos</span>
            <span>{folder.subfolder_count || 0} subcarpetas</span>
          </div>
        </div>
        <FolderOpen className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );

  // Document card component (Grid view)
  const DocumentCard = ({ document }: { document: DocumentWithDetails }) => {
    const fileColor = getFileTypeColor(document.mime_type);
    const isSelected = selectedDocuments.includes(document.id);

    return (
      <div
        className={`group relative bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 ${
          isSelected ? 'ring-2 ring-[#0a0a0a] border-[#0a0a0a]' : ''
        }`}
      >
        {/* Selection checkbox */}
        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => handleDocumentSelect(document.id, e.target.checked)}
            className="w-4 h-4 text-[#0a0a0a] border-gray-300 rounded focus:ring-[#0a0a0a]"
          />
        </div>

        {/* Actions dropdown */}
        <div className="absolute top-3 right-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveDropdown(activeDropdown === document.id ? null : document.id);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {activeDropdown === document.id && <DocumentActionsDropdown document={document} />}
        </div>

        {/* Document content */}
        <div
          onClick={() => onDocumentClick(document)}
          className="cursor-pointer p-4"
        >
          {/* File icon/thumbnail */}
          <div className="flex justify-center mb-3">
            {document.thumbnail_url ? (
              <img
                src={document.thumbnail_url}
                alt={document.title}
                className="w-16 h-16 object-cover rounded"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${fileColor}20` }}
              >
                <div style={{ color: fileColor }}>
                  {getFileIcon(document.mime_type)}
                </div>
              </div>
            )}
          </div>

          {/* Document info */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-900 truncate group-hover:text-[#0a0a0a]">
              {document.title}
            </h3>
            <p className="text-xs text-gray-500 line-clamp-2">
              {document.description || 'Sin descripción'}
            </p>
            
            {/* Tags */}
            {document.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {document.tags.slice(0, 2).map(tag => (
                  <span
                    key={tag}
                    className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                  >
                    {tag}
                  </span>
                ))}
                {document.tags.length > 2 && (
                  <span className="text-xs text-gray-500">+{document.tags.length - 2}</span>
                )}
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{document.formatted_size}</span>
              <span>{document.relative_time}</span>
            </div>

            {/* Stats */}
            <div className="flex items-center space-x-3 text-xs text-gray-500">
              <div className="flex items-center space-x-1">
                <Eye className="w-3 h-3" />
                <span>{document.view_count}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Download className="w-3 h-3" />
                <span>{document.download_count}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Document row component (List view)
  const DocumentRow = ({ document }: { document: DocumentWithDetails }) => {
    const fileColor = getFileTypeColor(document.mime_type);
    const isSelected = selectedDocuments.includes(document.id);

    return (
      <tr
        className={`group hover:bg-gray-50 ${
          isSelected ? 'bg-blue-50' : ''
        }`}
      >
        {/* Selection */}
        <td className="px-6 py-4">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => handleDocumentSelect(document.id, e.target.checked)}
            className="w-4 h-4 text-[#0a0a0a] border-gray-300 rounded focus:ring-[#0a0a0a]"
          />
        </td>

        {/* Document */}
        <td className="px-6 py-4">
          <div
            onClick={() => onDocumentClick(document)}
            className="flex items-center space-x-3 cursor-pointer"
          >
            <div style={{ color: fileColor }}>
              {getFileIcon(document.mime_type)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate group-hover:text-[#0a0a0a]">
                {document.title}
              </p>
              <p className="text-sm text-gray-500 truncate">
                {document.file_name}
              </p>
            </div>
          </div>
        </td>

        {/* Size */}
        <td className="px-6 py-4 text-sm text-gray-500">
          {document.formatted_size}
        </td>

        {/* Uploader */}
        <td className="px-6 py-4 text-sm text-gray-500">
          <div className="flex items-center space-x-1">
            <User className="w-4 h-4" />
            <span>{document.uploader_name}</span>
          </div>
        </td>

        {/* Date */}
        <td className="px-6 py-4 text-sm text-gray-500">
          <div className="flex items-center space-x-1">
            <Calendar className="w-4 h-4" />
            <span>{document.relative_time}</span>
          </div>
        </td>

        {/* Stats */}
        <td className="px-6 py-4 text-sm text-gray-500">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <Eye className="w-4 h-4" />
              <span>{document.view_count}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Download className="w-4 h-4" />
              <span>{document.download_count}</span>
            </div>
          </div>
        </td>

        {/* Actions */}
        <td className="px-6 py-4">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveDropdown(activeDropdown === document.id ? null : document.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {activeDropdown === document.id && <DocumentActionsDropdown document={document} />}
          </div>
        </td>
      </tr>
    );
  };

  // Loading skeleton
  if (loading) {
    const skeletonItems = Array.from({ length: 8 }, (_, i) => i);
    
    if (viewMode === 'grid') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {skeletonItems.map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="flex justify-center mb-3">
                <div className="w-16 h-16 bg-gray-200 rounded-lg" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Documento
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tamaño
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subido por
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estadísticas
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {skeletonItems.map(i => (
              <tr key={i} className="animate-pulse">
                <td className="px-6 py-4">
                  <div className="w-4 h-4 bg-gray-200 rounded" />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 bg-gray-200 rounded" />
                    <div className="space-y-1">
                      <div className="h-4 bg-gray-200 rounded w-32" />
                      <div className="h-3 bg-gray-200 rounded w-24" />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-16" />
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-20" />
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 rounded w-24" />
                </td>
                <td className="px-6 py-4">
                  <div className="flex space-x-3">
                    <div className="h-4 bg-gray-200 rounded w-8" />
                    <div className="h-4 bg-gray-200 rounded w-8" />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="w-4 h-4 bg-gray-200 rounded" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (folders.length === 0 && documents.length === 0) {
    return (
      <div className="text-center py-12">
        <Folder className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay documentos
        </h3>
        <p className="text-gray-500 mb-6">
          Comienza subiendo tu primer documento o creando una carpeta.
        </p>
      </div>
    );
  }

  // Grid view
  if (viewMode === 'grid') {
    return (
      <div className="space-y-6">
        {/* Folders */}
        {folders.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-900">Carpetas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {folders.map(folder => (
                <FolderCard key={folder.id} folder={folder} />
              ))}
            </div>
          </div>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">
                Documentos ({documents.length})
              </h3>
              {selectedDocuments.length > 0 && (
                <div className="text-sm text-gray-500">
                  {selectedDocuments.length} seleccionados
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {documents.map(document => (
                <DocumentCard key={document.id} document={document} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Folders */}
      {folders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Carpetas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {folders.map(folder => (
              <FolderCard key={folder.id} folder={folder} />
            ))}
          </div>
        </div>
      )}

      {/* Documents Table */}
      {documents.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">
              Documentos ({documents.length})
            </h3>
            {selectedDocuments.length > 0 && (
              <div className="text-sm text-gray-500">
                {selectedDocuments.length} seleccionados
              </div>
            )}
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={documents.length > 0 && selectedDocuments.length === documents.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 text-[#0a0a0a] border-gray-300 rounded focus:ring-[#0a0a0a]"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Documento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tamaño
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subido por
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estadísticas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {documents.map(document => (
                  <DocumentRow key={document.id} document={document} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}