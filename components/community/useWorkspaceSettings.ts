import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { communityWorkspaceService } from '../../lib/services/communityWorkspace';

/**
 * The community settings pop-up's state, effect, handlers and the rule that disables «Guardar cambios»,
 * one copy for both looks (redesign 6C). Moved word for word out of `WorkspaceSettingsModal.tsx` (the
 * same states in the same order, the same effect with the same dependency list, the same handlers);
 * today's markup and the new look's markup both read it.
 */
export interface WorkspaceSettingsInput {
  onClose: () => void;
  workspaceId: string;
  currentName: string;
  currentImageUrl?: string;
  onUpdate: (updates: { customName?: string; imageUrl?: string }) => void;
}

export function useWorkspaceSettings({
  onClose,
  workspaceId,
  currentName,
  currentImageUrl,
  onUpdate
}: WorkspaceSettingsInput) {
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

  // «Guardar cambios» is disabled while saving, and when the name is blank and there is no image
  const saveDisabled = isLoading || (!customName.trim() && !imageFile && !imageUrl);

  return {
    customName,
    setCustomName,
    imageUrl,
    imageFile,
    imagePreview,
    isLoading,
    fileInputRef,
    handleImageSelect,
    handleSave,
    handleRemoveImage,
    saveDisabled,
  };
}
