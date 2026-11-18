import React from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { Button, Dialog, Field, Input } from '../ui/kit';
import type { useWorkspaceSettings } from './useWorkspaceSettings';

/**
 * The new look's community settings pop-up (redesign 6C), on the kit's `Dialog`. Everything it shows
 * and does comes from `useWorkspaceSettings`, the hook today's markup reads too: the same field with
 * its placeholder and limit, the same hidden file input (`community-image-upload`, the same types),
 * the same remove handler, the same save and the same rule for «Guardar cambios». Escape and the veil
 * close it, except while it saves.
 */
export function WorkspaceSettingsNuevo({
  isOpen,
  onClose,
  settings,
}: {
  isOpen: boolean;
  onClose: () => void;
  settings: ReturnType<typeof useWorkspaceSettings>;
}) {
  const {
    customName,
    setCustomName,
    imagePreview,
    isLoading,
    fileInputRef,
    handleImageSelect,
    handleSave,
    handleRemoveImage,
    saveDisabled,
    canChangePicture,
  } = settings;
  const imageLabelId = React.useId();
  const imageHelpId = React.useId();
  const imageNoteId = React.useId();

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      eyebrow="Mi Comunidad de Crecimiento"
      title="Configuración de la Comunidad"
      dismissable={!isLoading}
      data-testid="workspace-settings-dialog"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading} data-testid="workspace-settings-cancel">
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={isLoading} disabled={saveDisabled} data-testid="workspace-settings-save">
            {isLoading ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <Field label="Nombre de la Comunidad" help="Cualquier miembro puede cambiar el nombre del grupo">
        <Input
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Ingresa un nombre personalizado"
          maxLength={100}
          data-testid="workspace-settings-name"
        />
      </Field>

      {canChangePicture && (
      <div role="group" aria-labelledby={imageLabelId} aria-describedby={`${imageHelpId} ${imageNoteId}`} className="grid gap-[6px]">
        <span id={imageLabelId} className="text-[0.8125rem] font-semibold text-brand_primary">
          Imagen de la Comunidad
        </span>
        <div className="flex items-center gap-4">
          {imagePreview ? (
            <span className="relative inline-flex flex-none">
              <img src={imagePreview} alt="Vista previa" className="h-[72px] w-[72px] rounded-full border border-brand_primary/[0.12] object-cover" />
              <button
                type="button"
                onClick={handleRemoveImage}
                aria-label="Quitar imagen"
                title="Quitar imagen"
                className="absolute -right-1 -top-1 grid h-6 w-6 place-content-center rounded-full bg-red-600 text-white transition-colors duration-150 hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_primary focus-visible:ring-offset-2 motion-reduce:transition-none"
                data-testid="workspace-settings-remove-image"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <span className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-full bg-gray-100 text-gray-600">
              <Camera aria-hidden="true" className="h-6 w-6" />
            </span>
          )}
          <div className="grid justify-items-start gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleImageSelect}
              className="hidden"
              id="community-image-upload"
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} data-testid="workspace-settings-upload">
              <Upload aria-hidden="true" />
              Subir imagen
            </Button>
            <span id={imageHelpId} className="text-xs text-gray-600">
              Máx. 5MB (JPEG, PNG, WebP)
            </span>
          </div>
        </div>
        <span id={imageNoteId} className="text-xs text-gray-600">
          La imagen la cambian los administradores y el gestor de la comunidad.
        </span>
      </div>
      )}
    </Dialog>
  );
}

export default WorkspaceSettingsNuevo;
