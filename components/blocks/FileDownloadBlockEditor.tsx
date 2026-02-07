import React, { useState, useRef } from 'react';
import { DownloadBlock, DownloadFile } from '@/types/blocks';
import { Button } from '@/components/ui/button';
import { Upload, Download, Trash2, File, FileText, Image, Video } from 'lucide-react';
import { uploadFile } from '@/utils/storage';
import BlockEditorWrapper from './BlockEditorWrapper';
import { getBlockConfig } from '@/config/blockTypes';

interface FileDownloadBlockEditorProps {
  block: DownloadBlock;
  onUpdate: (blockId: string, field: keyof DownloadBlock['payload'], value: any) => void;
  onTitleChange: (blockId: string, title: string) => void;
  onSave: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: (blockId: string) => void;
  courseId: string;
}

const FileDownloadBlockEditor: React.FC<FileDownloadBlockEditorProps> = ({
  block,
  onUpdate,
  onTitleChange,
  onSave,
  onDelete,
  isCollapsed,
  onToggleCollapse,
  courseId,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    /* eslint-disable-next-line jsx-a11y/alt-text */
    if (type.startsWith('image/')) return <Image size={20} className="text-green-600" />;
    if (type.startsWith('video/')) return <Video size={20} className="text-blue-600" />;
    if (type.includes('pdf')) return <FileText size={20} className="text-red-600" />;
    if (type.includes('word') || type.includes('document')) return <FileText size={20} className="text-blue-800" />;
    if (type.includes('excel') || type.includes('spreadsheet')) return <FileText size={20} className="text-green-800" />;
    if (type.includes('powerpoint') || type.includes('presentation')) return <FileText size={20} className="text-orange-600" />;
    return <File size={20} className="text-gray-600" />;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const uploadedFiles: DownloadFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Generate a unique filename with course context
        const fileExtension = file.name.split('.').pop();
        const fileName = `downloads/${courseId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
        
        // Upload to Supabase Storage
        const { url, error } = await uploadFile(file, fileName);
        
        if (error) {
          console.error('Error uploading file:', error);
          continue; // Skip this file and continue with others
        }
        
        if (url) {
          const uploadedFile: DownloadFile = {
            id: generateId(),
            name: file.name,
            originalName: file.name,
            url: url,
            size: file.size,
            type: file.type,
            description: '',
            uploadedAt: new Date().toISOString(),
          };

          uploadedFiles.push(uploadedFile);
        }
      }

      if (uploadedFiles.length > 0) {
        const updatedFiles = [...block.payload.files, ...uploadedFiles];
        onUpdate(block.id, 'files', updatedFiles);
      }

    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeFile = (fileId: string) => {
    const updatedFiles = block.payload.files.filter(f => f.id !== fileId);
    onUpdate(block.id, 'files', updatedFiles);
  };

  const updateFileDescription = (fileId: string, description: string) => {
    const updatedFiles = block.payload.files.map(f =>
      f.id === fileId ? { ...f, description } : f
    );
    onUpdate(block.id, 'files', updatedFiles);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const blockConfig = getBlockConfig('download');
  
  return (
    <BlockEditorWrapper
      title={blockConfig.label}
      subtitle={block.payload.title || blockConfig.subtitle}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => onToggleCollapse(block.id)}
      onDelete={() => onDelete(block.id)}
      onSave={() => onSave(block.id)}
    >
      {/* Block Header */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Título del Bloque
        </label>
        <input
          type="text"
          value={block.payload.title || ''}
          onChange={(e) => onTitleChange(block.id, e.target.value)}
          placeholder="Ingrese el título para esta sección de archivos"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Descripción
        </label>
        <textarea
          value={block.payload.description || ''}
          onChange={(e) => onUpdate(block.id, 'description', e.target.value)}
          placeholder="Descripción opcional para los archivos"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
          rows={2}
        />
      </div>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={block.payload.allowBulkDownload}
            onChange={(e) => onUpdate(block.id, 'allowBulkDownload', e.target.checked)}
            className="form-checkbox text-[#0a0a0a]"
          />
          <span className="text-sm">Permitir descarga masiva (ZIP)</span>
        </label>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={block.payload.requireAuth}
            onChange={(e) => onUpdate(block.id, 'requireAuth', e.target.checked)}
            className="form-checkbox text-[#0a0a0a]"
          />
          <span className="text-sm">Requiere autenticación</span>
        </label>
      </div>

      {/* File Upload */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mov,.avi"
        />
        
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {isUploading ? 'Subiendo archivos...' : 'Subir archivos'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Selecciona múltiples archivos para subir (PDF, Word, Excel, PowerPoint, imágenes, videos)
        </p>
        <Button
          onClick={triggerFileUpload}
          disabled={isUploading}
          className="bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] text-white"
        >
          {isUploading ? 'Subiendo...' : 'Seleccionar Archivos'}
        </Button>
      </div>

      {/* Files List */}
      {block.payload.files.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-[#0a0a0a] mb-3">
            Archivos ({block.payload.files.length})
          </h3>
          <div className="space-y-3">
            {block.payload.files.map((file) => (
              <div
                key={file.id}
                className="border rounded-lg p-4 flex items-start gap-3 hover:bg-gray-50"
              >
                <div className="flex-shrink-0">
                  {getFileIcon(file.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)} • {file.type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(file.url, '_blank')}
                      >
                        <Download size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                      >
                        <Trash2 size={14} className="text-[#ef4044]" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-2">
                    <input
                      type="text"
                      value={file.description || ''}
                      onChange={(e) => updateFileDescription(file.id, e.target.value)}
                      placeholder="Descripción del archivo (opcional)"
                      className="w-full text-xs p-2 border border-gray-200 rounded focus:ring-1 focus:ring-[#0a0a0a] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </BlockEditorWrapper>
  );
};

export default FileDownloadBlockEditor;