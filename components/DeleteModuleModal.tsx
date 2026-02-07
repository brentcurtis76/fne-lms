import React from 'react';
import { XIcon, ExclamationIcon } from '@heroicons/react/outline';

interface DeleteModuleModalProps {
  moduleTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const DeleteModuleModal: React.FC<DeleteModuleModalProps> = ({
  moduleTitle,
  isOpen,
  onClose,
  onConfirm,
  isDeleting
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <ExclamationIcon className="h-6 w-6 text-red-600 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">
              Confirmar Eliminación
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <div className="flex">
              <ExclamationIcon className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-red-800 mb-1">
                  Esta acción no se puede deshacer
                </h4>
                <p className="text-sm text-red-700">
                  Se eliminará permanentemente el módulo <strong>&quot;{moduleTitle}&quot;</strong> y <strong>todas sus lecciones asociadas</strong>, incluyendo todo el contenido de bloques.
                </p>
              </div>
            </div>
          </div>
          
          <p className="text-gray-600 text-sm mb-6">
            ¿Estás seguro de que deseas eliminar este módulo y todas sus lecciones? Esta acción eliminará todo el contenido de forma permanente.
          </p>
        </div>
        
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 transition-colors duration-150 flex items-center"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Eliminando...
              </>
            ) : (
              'Eliminar Módulo y Lecciones'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModuleModal;