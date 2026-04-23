import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon } from '@heroicons/react/outline';
import { MeetingFormStep } from '../../types/meetings';
import { MEETING_STATUS } from '../../lib/utils/meeting-policy';

interface MeetingModalFooterProps {
  /** Current wizard step. Drives the Prev-disabled rule and the
   *  Next-vs-Submit split at the Agreements step. */
  currentStep: MeetingFormStep;
  /** Outer "is saving the main submit" flag — disables every action. */
  isSubmitting: boolean;
  /** Parallel flag for the borrador Guardar-borrador button. */
  isSavingDraft: boolean;
  /** True while the create-meeting flow is streaming attachments up to
   *  storage; the Submit button label switches to show progress. */
  uploadingFiles: boolean;
  /** For the Submit-button upload label. */
  selectedFileCount: number;
  /** 'create' hides the Finalizar reunión button. */
  mode: 'create' | 'edit';
  /** The meeting status that controls whether the Finalizar button shows. */
  meetingStatus: string;
  /** The loaded meeting id — Finalizar only makes sense in edit mode with
   *  a persisted draft. */
  meetingId: string | null | undefined;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onOpenFinalize: () => void;
}

/**
 * Bottom bar of MeetingDocumentationModal. Extracted so the modal's
 * render function is ~60 lines shorter and the 5 different buttons
 * (Prev / Cancel / Save draft / Next|Submit / Finalize) are visible
 * as a group rather than scattered around the end of a 2000-line file.
 */
export const MeetingModalFooter: React.FC<MeetingModalFooterProps> = ({
  currentStep,
  isSubmitting,
  isSavingDraft,
  uploadingFiles,
  selectedFileCount,
  mode,
  meetingStatus,
  meetingId,
  onPrevious,
  onNext,
  onSubmit,
  onClose,
  onSaveDraft,
  onOpenFinalize,
}) => {
  const showFinalize =
    mode === 'edit' &&
    meetingStatus === MEETING_STATUS.BORRADOR &&
    !!meetingId;

  return (
    <div className="flex items-center justify-between p-6 border-t border-gray-200">
      <button
        onClick={onPrevious}
        disabled={currentStep === MeetingFormStep.INFORMATION || isSubmitting}
        className="inline-flex items-center px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
      >
        <ChevronLeftIcon className="h-4 w-4 mr-1" />
        Anterior
      </button>

      <div className="flex items-center space-x-3">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
        >
          Cancelar
        </button>

        <button
          onClick={onSaveDraft}
          disabled={isSubmitting || isSavingDraft}
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors duration-200"
          title="Guarda el estado actual como borrador sin validar el resumen"
        >
          {isSavingDraft ? 'Guardando…' : 'Guardar borrador'}
        </button>

        {currentStep < MeetingFormStep.AGREEMENTS ? (
          <button
            onClick={onNext}
            disabled={isSubmitting}
            className="inline-flex items-center px-4 py-2 bg-brand_accent text-brand_primary text-sm rounded-lg hover:bg-brand_accent/90 disabled:opacity-50 transition-colors duration-200"
          >
            Siguiente
            <ChevronRightIcon className="h-4 w-4 ml-1" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center px-4 py-2 bg-brand_primary text-white text-sm rounded-lg hover:bg-brand_primary/90 disabled:opacity-50 transition-colors duration-200"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                {uploadingFiles
                  ? `Subiendo ${selectedFileCount} archivo${selectedFileCount !== 1 ? 's' : ''}…`
                  : 'Guardando…'}
              </>
            ) : (
              <>
                <CheckIcon className="h-4 w-4 mr-1" />
                {mode === 'edit' ? 'Guardar Cambios' : 'Crear Reunión'}
              </>
            )}
          </button>
        )}

        {showFinalize && (
          <button
            type="button"
            onClick={onOpenFinalize}
            disabled={isSubmitting || isSavingDraft}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors duration-200"
          >
            <CheckIcon className="h-4 w-4 mr-1" />
            Finalizar reunión
          </button>
        )}
      </div>
    </div>
  );
};
