/**
 * Meeting Deletion Modal
 * Provides a safe, user-friendly interface for deleting meetings
 * with proper warnings and confirmation steps
 */

import React, { useState, useEffect } from 'react';
import { 
  XIcon,
  ExclamationIcon,
  TrashIcon,
  DocumentIcon,
  UserGroupIcon,
  ClipboardListIcon,
  CheckCircleIcon
} from '@heroicons/react/outline';
import { deleteMeeting, softDeleteMeeting, canDeleteMeeting } from '../../utils/meetingDeletion';
import { getMeetingDetails } from '../../utils/meetingUtils';
import { MeetingWithDetails } from '../../types/meetings';
import { toast } from 'react-hot-toast';

interface MeetingDeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  meetingTitle: string;
  userId: string;
  onSuccess: () => void;
  preferSoftDelete?: boolean;
}

const MeetingDeletionModal: React.FC<MeetingDeletionModalProps> = ({
  isOpen,
  onClose,
  meetingId,
  meetingTitle,
  userId,
  onSuccess,
  preferSoftDelete = true
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deletionType, setDeletionType] = useState<'soft' | 'hard'>(preferSoftDelete ? 'soft' : 'hard');
  const [meetingDetails, setMeetingDetails] = useState<MeetingWithDetails | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  const CONFIRM_PHRASE = 'eliminar reunión';

  useEffect(() => {
    if (isOpen && meetingId) {
      checkPermissionAndLoadDetails();
    }
  }, [isOpen, meetingId]);

  const checkPermissionAndLoadDetails = async () => {
    setCheckingPermission(true);
    try {
      // Check permission
      const canDelete = await canDeleteMeeting(userId, meetingId);
      setHasPermission(canDelete);

      if (canDelete) {
        // Load meeting details to show what will be deleted
        const details = await getMeetingDetails(meetingId);
        setMeetingDetails(details);
      }
    } catch (error) {
      console.error('Error checking permission:', error);
      toast.error('Error al verificar permisos');
    } finally {
      setCheckingPermission(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText.toLowerCase() !== CONFIRM_PHRASE) {
      toast.error('Por favor escribe la frase de confirmación correctamente');
      return;
    }

    setIsDeleting(true);

    try {
      if (deletionType === 'soft') {
        // Soft delete (archive)
        const result = await softDeleteMeeting(meetingId, userId);
        if (result.success) {
          toast.success('Reunión archivada exitosamente');
          onSuccess();
          handleClose();
        } else {
          toast.error(result.error || 'Error al archivar la reunión');
        }
      } else {
        // Hard delete (permanent)
        const result = await deleteMeeting(meetingId, { userId });
        if (result.success) {
          let message = 'Reunión eliminada permanentemente';
          if (result.deletedFiles > 0) {
            message += ` (${result.deletedFiles} archivo${result.deletedFiles !== 1 ? 's' : ''} eliminado${result.deletedFiles !== 1 ? 's' : ''})`;
          }
          toast.success(message);
          
          // Show any warnings
          if (result.errors.length > 0) {
            result.errors.forEach(error => toast.error(error));
          }
          
          onSuccess();
          handleClose();
        } else {
          toast.error('Error al eliminar la reunión');
          result.errors.forEach(error => toast.error(error));
        }
      }
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error('Error inesperado al eliminar la reunión');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmText('');
      setDeletionType(preferSoftDelete ? 'soft' : 'hard');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={handleClose}></div>
        </div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {checkingPermission ? (
            <div className="p-8">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ) : !hasPermission ? (
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <ExclamationIcon className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
                Sin permisos para eliminar
              </h3>
              <p className="text-sm text-gray-500 text-center mb-4">
                No tienes permisos para eliminar esta reunión. Solo el creador, administradores, o líderes de la comunidad pueden eliminar reuniones.
              </p>
              <button
                onClick={handleClose}
                className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-red-50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
                      <ExclamationIcon className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="ml-3 text-lg font-medium text-gray-900">
                      Eliminar Reunión
                    </h3>
                  </div>
                  <button
                    onClick={handleClose}
                    disabled={isDeleting}
                    className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                <p className="text-sm text-gray-700 mb-4">
                  Estás a punto de eliminar la reunión: <span className="font-semibold">"{meetingTitle}"</span>
                </p>

                {/* Deletion Type Selection */}
                <div className="mb-6 space-y-3">
                  <label className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="deletionType"
                      value="soft"
                      checked={deletionType === 'soft'}
                      onChange={() => setDeletionType('soft')}
                      className="mt-1"
                      disabled={isDeleting}
                    />
                    <div>
                      <p className="font-medium text-gray-900">Archivar reunión</p>
                      <p className="text-sm text-gray-500">La reunión se ocultará pero podrá ser recuperada posteriormente</p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="deletionType"
                      value="hard"
                      checked={deletionType === 'hard'}
                      onChange={() => setDeletionType('hard')}
                      className="mt-1"
                      disabled={isDeleting}
                    />
                    <div>
                      <p className="font-medium text-gray-900">Eliminar permanentemente</p>
                      <p className="text-sm text-gray-500">La reunión y todos sus datos serán eliminados de forma irreversible</p>
                    </div>
                  </label>
                </div>

                {/* What will be deleted */}
                {deletionType === 'hard' && meetingDetails && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900 mb-3">Se eliminarán permanentemente:</p>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <DocumentIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <span>{meetingDetails.agreements?.length || 0} acuerdos</span>
                      </div>
                      <div className="flex items-center">
                        <ClipboardListIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <span>{meetingDetails.commitments?.length || 0} compromisos</span>
                      </div>
                      <div className="flex items-center">
                        <CheckCircleIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <span>{meetingDetails.tasks?.length || 0} tareas</span>
                      </div>
                      <div className="flex items-center">
                        <UserGroupIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <span>{meetingDetails.attendees?.length || 0} registros de participantes</span>
                      </div>
                      <div className="flex items-center">
                        <DocumentIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <span>Todos los archivos adjuntos</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Confirmation input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Para confirmar, escribe <span className="font-semibold">"{CONFIRM_PHRASE}"</span>
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Escribe aquí para confirmar"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    disabled={isDeleting}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-between">
                <button
                  onClick={handleClose}
                  disabled={isDeleting}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleDelete}
                  disabled={isDeleting || confirmText.toLowerCase() !== CONFIRM_PHRASE}
                  className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      {deletionType === 'soft' ? 'Archivando...' : 'Eliminando...'}
                    </>
                  ) : (
                    <>
                      <TrashIcon className="h-4 w-4 mr-2" />
                      {deletionType === 'soft' ? 'Archivar reunión' : 'Eliminar permanentemente'}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingDeletionModal;