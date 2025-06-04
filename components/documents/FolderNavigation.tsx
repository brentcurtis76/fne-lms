// =============================================================================
// FNE LMS - Folder Navigation Component
// =============================================================================
// Breadcrumb navigation with folder creation and management

import React, { useState } from 'react';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  Edit2,
  Trash2,
  X,
  Check,
  MoreVertical,
} from 'lucide-react';
import {
  FolderWithBreadcrumb,
  BreadcrumbItem,
  DocumentPermission,
  FolderCreateData,
} from '../../types/documents';

interface FolderNavigationProps {
  currentFolder: FolderWithBreadcrumb | null;
  breadcrumb: BreadcrumbItem[];
  onFolderNavigate: (folderId: string | null) => void;
  onCreateFolder: (folderData: FolderCreateData) => void;
  onEditFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  permissions: DocumentPermission;
  loading?: boolean;
}

export default function FolderNavigation({
  currentFolder,
  breadcrumb,
  onFolderNavigate,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  permissions,
  loading = false,
}: FolderNavigationProps) {
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [showFolderActions, setShowFolderActions] = useState(false);

  // Handle create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    setCreatingFolder(true);
    try {
      await onCreateFolder({
        folder_name: newFolderName.trim(),
        parent_folder_id: currentFolder?.id,
      });
      setNewFolderName('');
      setShowCreateFolder(false);
    } catch (error) {
      console.error('Error creating folder:', error);
    } finally {
      setCreatingFolder(false);
    }
  };

  // Handle edit folder
  const handleEditFolder = async () => {
    if (!editFolderName.trim() || !editingFolder || !onEditFolder) return;

    try {
      await onEditFolder(editingFolder, editFolderName.trim());
      setEditingFolder(null);
      setEditFolderName('');
    } catch (error) {
      console.error('Error editing folder:', error);
    }
  };

  // Handle delete folder
  const handleDeleteFolder = async (folderId: string) => {
    if (!onDeleteFolder) return;
    
    if (window.confirm('¿Estás seguro de que quieres eliminar esta carpeta? Esta acción no se puede deshacer.')) {
      try {
        await onDeleteFolder(folderId);
        setShowFolderActions(false);
      } catch (error) {
        console.error('Error deleting folder:', error);
      }
    }
  };

  // Start editing folder
  const startEditingFolder = () => {
    if (!currentFolder) return;
    setEditingFolder(currentFolder.id);
    setEditFolderName(currentFolder.folder_name);
    setShowFolderActions(false);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingFolder(null);
    setEditFolderName('');
  };

  // Folder actions dropdown
  const FolderActionsDropdown = () => {
    if (!currentFolder || !permissions.can_manage_folders) return null;

    return (
      <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
        <button
          onClick={startEditingFolder}
          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
        >
          <Edit2 className="w-4 h-4" />
          <span>Renombrar Carpeta</span>
        </button>
        
        <div className="border-t border-gray-100 my-1" />
        
        <button
          onClick={() => handleDeleteFolder(currentFolder.id)}
          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>Eliminar Carpeta</span>
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          {/* Home button */}
          <button
            onClick={() => onFolderNavigate(null)}
            disabled={loading}
            className="flex items-center space-x-1 text-gray-600 hover:text-[#00365b] transition-colors disabled:opacity-50"
          >
            <Home className="w-4 h-4" />
            <span className="text-sm">Inicio</span>
          </button>

          {/* Breadcrumb items */}
          {breadcrumb.map((item, index) => (
            <React.Fragment key={item.id}>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => onFolderNavigate(item.id)}
                disabled={loading}
                className="text-sm text-gray-600 hover:text-[#00365b] transition-colors truncate disabled:opacity-50"
              >
                {item.name}
              </button>
            </React.Fragment>
          ))}

          {/* Current folder (if editing) */}
          {currentFolder && editingFolder === currentFolder.id ? (
            <React.Fragment>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') handleEditFolder();
                    if (e.key === 'Escape') cancelEditing();
                  }}
                  className="text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <button
                  onClick={handleEditFolder}
                  className="text-green-600 hover:text-green-800"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={cancelEditing}
                  className="text-gray-600 hover:text-gray-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </React.Fragment>
          ) : (
            currentFolder && (
              <React.Fragment>
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-900 font-medium">
                    {currentFolder.folder_name}
                  </span>
                  {permissions.can_manage_folders && (
                    <div className="relative">
                      <button
                        onClick={() => setShowFolderActions(!showFolderActions)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {showFolderActions && <FolderActionsDropdown />}
                    </div>
                  )}
                </div>
              </React.Fragment>
            )
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3 ml-4">
          {/* Create folder toggle */}
          {permissions.can_create_folder && (
            <button
              onClick={() => setShowCreateFolder(!showCreateFolder)}
              disabled={loading}
              className="flex items-center space-x-2 text-sm text-[#00365b] hover:text-[#004a7c] transition-colors disabled:opacity-50"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Nueva Carpeta</span>
            </button>
          )}
        </div>
      </div>

      {/* Create folder form */}
      {showCreateFolder && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <Folder className="w-5 h-5 text-[#fdb933]" />
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowCreateFolder(false);
              }}
              placeholder="Nombre de la carpeta"
              disabled={creatingFolder}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={creatingFolder || !newFolderName.trim()}
              className="bg-[#00365b] text-white px-4 py-2 text-sm rounded-lg hover:bg-[#004a7c] transition-colors disabled:opacity-50"
            >
              {creatingFolder ? 'Creando...' : 'Crear'}
            </button>
            <button
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName('');
              }}
              disabled={creatingFolder}
              className="text-gray-600 hover:text-gray-800 p-2 rounded disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Current folder info */}
      {currentFolder && (
        <div className="mt-3 flex items-center space-x-6 text-xs text-gray-500">
          <div className="flex items-center space-x-1">
            <Folder className="w-3 h-3" />
            <span>{currentFolder.subfolder_count || 0} subcarpetas</span>
          </div>
          <div className="flex items-center space-x-1">
            <span>{currentFolder.document_count || 0} documentos</span>
          </div>
        </div>
      )}
    </div>
  );
}