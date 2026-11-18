import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { communityWorkspaceService } from '../../lib/services/communityWorkspace';

/**
 * The community settings pop-up's state, effect, handlers and the rule that disables «Guardar cambios»,
 * one copy for both looks (redesign 6C). Moved word for word out of `WorkspaceSettingsModal.tsx` (the
 * same states in the same order, the same effect with the same dependency list, the same handlers);
 * today's markup and the new look's markup both read it. The GENERA fixes (EC-V1b, ported onto this
 * hook) then changed the save: a changed name goes through `renameWorkspace`, the picture only when one
 * was chosen or removed, and «Guardar cambios» waits for a change.
 */
export interface WorkspaceSettingsInput {
  onClose: () => void;
  workspaceId: string;
  currentName: string;
  currentImageUrl?: string;
  onUpdate: (updates: { customName?: string; imageUrl?: string }) => void;
  /** Whether the picture section is shown (admins and the community's manager). Default true. */
  canChangePicture?: boolean;
}

export function useWorkspaceSettings({
  onClose,
  workspaceId,
  currentName,
  currentImageUrl,
  onUpdate,
  canChangePicture = true
}: WorkspaceSettingsInput) {
  const [customName, setCustomName] = useState('');
  // The name the window was opened with: a save renames only when the field differs from it (N92).
  const [initialName, setInitialName] = useState('');
  const [imageUrl, setImageUrl] = useState(currentImageUrl || '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomName(currentName || '');
    setInitialName(currentName || '');
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

  const trimmedName = customName.trim();
  const nameChanged = trimmedName !== initialName;
  const pictureChanged = canChangePicture && (imageFile !== null || imageUrl !== (currentImageUrl || ''));

  // After the writes, report to the caller what is really stored (send-back 1):
  // the stored custom_name (undefined when empty, so the caller falls back to the
  // community's own name) and the stored picture (undefined when none). If the
  // read-back fails: what was just saved, undefined for a name not saved, and
  // the picture the window was opened with when the picture was not saved.
  const reportStored = async (saved: { name?: string; imageUrl?: string; pictureSaved: boolean }) => {
    const { data, error } = await communityWorkspaceService.getWorkspaceSettings(workspaceId);
    if (!error && data) {
      onUpdate({
        customName: data.custom_name || undefined,
        imageUrl: data.image_url || undefined
      });
      return;
    }
    onUpdate({
      customName: saved.name || undefined,
      imageUrl: (saved.pictureSaved ? saved.imageUrl : currentImageUrl) || undefined
    });
  };

  const handleSave = async () => {
    setIsLoading(true);
    let savedImageUrl = '';
    let pictureSaved = false;

    try {
      if (pictureChanged) {
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

        // The picture keeps its direct update; it never carries the name (N92)
        const { error } = await communityWorkspaceService.updateWorkspaceSettings(
          workspaceId,
          {
            imageUrl: newImageUrl,
            imageStoragePath: newImagePath
          }
        );

        if (error) {
          throw error;
        }
        savedImageUrl = newImageUrl;
        pictureSaved = true;
      }

      if (nameChanged) {
        const { error: renameError } = await communityWorkspaceService.renameWorkspace(workspaceId, trimmedName);
        if (renameError) {
          toast.error(renameError);
          if (pictureSaved) {
            await reportStored({ imageUrl: savedImageUrl, pictureSaved });
          }
          return;
        }
      }

      toast.success('Configuración actualizada exitosamente');
      await reportStored({ name: nameChanged ? trimmedName : undefined, imageUrl: savedImageUrl, pictureSaved });
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

  // «Guardar cambios» is disabled while saving, when the name is blank, and when neither the name nor
  // the picture changed (EC-V1b)
  const saveDisabled = isLoading || !trimmedName || (!nameChanged && !pictureChanged);

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
    canChangePicture,
  };
}
