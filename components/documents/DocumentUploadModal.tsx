// =============================================================================
// FNE LMS - Document Upload Modal Component
// =============================================================================
// Professional document upload interface with metadata, drag & drop, and validation

import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, File, Tag, FolderPlus, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  DocumentUploadData,
  DocumentFolder,
  CommunityDocument,
  FileUploadProgress,
  SUPPORTED_FILE_TYPES,
} from '../../types/documents';
import {
  uploadDocument,
  createFolder,
  getFileTypeConfig,
  formatFileSize,
} from '../../utils/documentUtils';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentFolderId?: string;
  folders: DocumentFolder[];
  onUploadComplete: (documents: CommunityDocument[]) => void;
  userId: string;
}

export default function DocumentUploadModal({
  isOpen,
  onClose,
  workspaceId,
  currentFolderId,
  folders,
  onUploadComplete,
  userId,
}: DocumentUploadModalProps) {
  // Form state
  const [formData, setFormData] = useState<DocumentUploadData>({
    title: '',
    description: '',
    tags: [],
    folder_id: currentFolderId || '',
    files: [],
  });

  // UI state
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        title: '',
        description: '',
        tags: [],
        folder_id: currentFolderId || '',
        files: [],
      });
      setErrors([]);
      setUploadProgress([]);
      setTagInput('');
      setShowCreateFolder(false);
      setNewFolderName('');
    }
  }, [isOpen, currentFolderId]);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  // File selection handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (selectedFiles: File[]) => {
    const newErrors: string[] = [];
    const validFiles: File[] = [];

    selectedFiles.forEach(file => {
      // Check file type
      const fileTypeConfig = getFileTypeConfig(file.type);
      if (!fileTypeConfig) {
        newErrors.push(`Tipo de archivo no soportado: ${file.name}`);
        return;
      }

      // Check file size
      if (file.size > fileTypeConfig.max_size) {
        newErrors.push(
          `Archivo demasiado grande: ${file.name}. Máximo: ${formatFileSize(
            fileTypeConfig.max_size
          )}`
        );
        return;
      }

      validFiles.push(file);
    });

    setErrors(newErrors);
    setFormData(prev => ({
      ...prev,
      files: [...prev.files, ...validFiles],
      title: prev.title || (validFiles.length === 1 ? validFiles[0].name.split('.')[0] : ''),
    }));

    // Initialize upload progress for new files
    const newProgress: FileUploadProgress[] = validFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending',
    }));
    setUploadProgress(prev => [...prev, ...newProgress]);
  };

  // Remove file from selection
  const removeFile = (index: number) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index),
    }));
    setUploadProgress(prev => prev.filter((_, i) => i !== index));
  };

  // Tag management
  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (!formData.tags.includes(newTag)) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, newTag],
        }));
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    setCreatingFolder(true);
    try {
      const newFolder = await createFolder(
        workspaceId,
        {
          folder_name: newFolderName.trim(),
          parent_folder_id: currentFolderId || undefined,
        },
        userId
      );

      // Update form to select the new folder
      setFormData(prev => ({ ...prev, folder_id: newFolder.id }));
      setShowCreateFolder(false);
      setNewFolderName('');
    } catch (error) {
      console.error('Error creating folder:', error);
      setErrors(['Error al crear la carpeta. Inténtalo de nuevo.']);
    } finally {
      setCreatingFolder(false);
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (formData.files.length === 0) {
      setErrors(['Selecciona al menos un archivo para subir.']);
      return;
    }

    if (!formData.title.trim()) {
      setErrors(['El título es requerido.']);
      return;
    }

    setUploading(true);
    setErrors([]);

    try {
      // Update progress for all files
      setUploadProgress(prev =>
        prev.map(progress => ({ ...progress, status: 'uploading' as const }))
      );

      // Upload documents
      const uploadedDocuments = await uploadDocument(workspaceId, formData, userId);

      // Update progress to success
      setUploadProgress(prev =>
        prev.map((progress, index) => ({
          ...progress,
          progress: 100,
          status: 'success' as const,
          document_id: uploadedDocuments[index]?.id,
        }))
      );

      // Notify parent component
      onUploadComplete(uploadedDocuments);

      // Close modal after brief delay to show success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error uploading documents:', error);
      setErrors([error instanceof Error ? error.message : 'Error al subir los documentos.']);
      setUploadProgress(prev =>
        prev.map(progress => ({ ...progress, status: 'error' as const }))
      );
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const availableFolders = folders.filter(folder => 
    currentFolderId ? folder.parent_folder_id === currentFolderId : !folder.parent_folder_id
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Subir Documentos</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* File Upload Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              accept={SUPPORTED_FILE_TYPES.map(type => type.extension).join(',')}
              className="hidden"
            />
            
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              Arrastra archivos aquí o haz clic para seleccionar
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Formatos soportados: PDF, DOC, XLS, PPT, imágenes, videos
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-[#00365b] text-white px-6 py-2 rounded-lg hover:bg-[#004a7c] transition-colors disabled:opacity-50"
            >
              Seleccionar Archivos
            </button>
          </div>

          {/* Selected Files */}
          {formData.files.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Archivos Seleccionados</h3>
              {formData.files.map((file, index) => {
                const progress = uploadProgress[index];
                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <File className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {progress?.status === 'uploading' && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                      {progress?.status === 'success' && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                      {progress?.status === 'error' && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      {!uploading && (
                        <button
                          onClick={() => removeFile(index)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                disabled={uploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder="Título del documento"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                disabled={uploading}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                placeholder="Descripción opcional del documento"
              />
            </div>

            {/* Folder Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Carpeta
                </label>
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(!showCreateFolder)}
                  disabled={uploading}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1 disabled:opacity-50"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Nueva Carpeta</span>
                </button>
              </div>
              
              {showCreateFolder && (
                <div className="flex space-x-2 mb-2">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    disabled={creatingFolder}
                    placeholder="Nombre de la carpeta"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                  <button
                    onClick={handleCreateFolder}
                    disabled={creatingFolder || !newFolderName.trim()}
                    className="bg-[#fdb933] text-white px-4 py-2 rounded-lg hover:bg-[#e6a429] transition-colors disabled:opacity-50"
                  >
                    {creatingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
                  </button>
                </div>
              )}
              
              <select
                value={formData.folder_id}
                onChange={(e) => setFormData(prev => ({ ...prev, folder_id: e.target.value }))}
                disabled={uploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">Carpeta raíz</option>
                {availableFolders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.folder_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Etiquetas
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={handleTagKeyPress}
                  disabled={uploading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  placeholder="Escribe una etiqueta y presiona Enter"
                />
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                        {!uploading && (
                          <button
                            onClick={() => removeTag(tag)}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Se encontraron errores:
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <ul className="list-disc pl-5 space-y-1">
                      {errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || formData.files.length === 0 || !formData.title.trim()}
              className="bg-[#00365b] text-white px-6 py-2 rounded-lg hover:bg-[#004a7c] transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Subiendo...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Subir Documentos</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}