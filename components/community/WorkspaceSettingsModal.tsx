import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Camera, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { communityWorkspaceService } from '../../lib/services/communityWorkspace';

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentName: string;
  currentImageUrl?: string;
  onUpdate: (updates: { customName?: string; imageUrl?: string }) => void;
}

export default function WorkspaceSettingsModal({
  isOpen,
  onClose,
  workspaceId,
  currentName,
  currentImageUrl,
  onUpdate
}: WorkspaceSettingsModalProps) {
  const [customName, setCustomName] = useState('');
  const [imageUrl, setImageUrl] = useState(currentImageUrl || '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomName(currentName || '');
    setImageUrl(currentImageUrl || '');
    setImagePreview(currentImageUrl || '');
  }, [currentName, currentImageUrl]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen debe ser menor a 5MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Solo se permiten imágenes (JPEG, PNG, WebP)');
      return;
    }

    setImageFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsLoading(true);

    try {
      let newImageUrl = imageUrl;
      let newImagePath = undefined;

      // Upload image if a new one was selected
      if (imageFile) {
        const uploadResult = await communityWorkspaceService.uploadCommunityImage(
          workspaceId,
          imageFile
        );

        if (uploadResult.error) {
          throw new Error(uploadResult.error);
        }

        newImageUrl = uploadResult.url!;
        newImagePath = uploadResult.path;
      }

      // Update workspace settings
      const { error } = await communityWorkspaceService.updateWorkspaceSettings(
        workspaceId,
        {
          customName: customName.trim(),
          imageUrl: newImageUrl,
          imageStoragePath: newImagePath
        }
      );

      if (error) {
        throw error;
      }

      toast.success('Configuración actualizada exitosamente');
      onUpdate({
        customName: customName.trim(),
        imageUrl: newImageUrl
      });
      onClose();
    } catch (error: any) {
      console.error('Error saving workspace settings:', error);
      toast.error(error.message || 'Error al guardar la configuración');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    setImageUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Configuración de la Comunidad
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Community Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la Comunidad
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Ingresa un nombre personalizado"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#0a0a0a] focus:border-[#0a0a0a]"
              maxLength={100}
            />
            <p className="mt-1 text-xs text-gray-500">
              Cualquier miembro puede cambiar el nombre del grupo
            </p>
          </div>

          {/* Community Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Imagen de la Comunidad
            </label>
            
            <div className="flex items-center space-x-4">
              {/* Image Preview */}
              <div className="relative">
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Vista previa"
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                    />
                    <button
                      onClick={handleRemoveImage}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      type="button"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                    <Camera className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="community-image-upload"
                />
                <label
                  htmlFor="community-image-upload"
                  className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Subir imagen
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  Máx. 5MB (JPEG, PNG, WebP)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-2 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || (!customName.trim() && !imageFile && !imageUrl)}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] rounded-md hover:bg-[#00293f] disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}