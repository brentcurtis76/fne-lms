import React, { useState, useEffect } from 'react';
import { XIcon, PencilIcon } from '@heroicons/react/outline';

interface EditModuleModalProps {
  moduleId: string;
  moduleTitle: string;
  moduleDescription: string | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newTitle: string, newDescription: string) => void;
  isUpdating: boolean;
}

const EditModuleModal: React.FC<EditModuleModalProps> = ({
  moduleId,
  moduleTitle,
  moduleDescription,
  isOpen,
  onClose,
  onConfirm,
  isUpdating
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewTitle(moduleTitle);
      setNewDescription(moduleDescription || '');
    }
  }, [isOpen, moduleTitle, moduleDescription]);

  const handleConfirm = () => {
    if (newTitle.trim()) {
      onConfirm(newTitle.trim(), newDescription.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <PencilIcon className="h-6 w-6 text-brand_blue mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">
              Editar Módulo
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="moduleTitle" className="block text-sm font-medium text-gray-700 mb-2">
                Título del Módulo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="moduleTitle"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue"
                placeholder="Ingresa el título del módulo"
                disabled={isUpdating}
                autoFocus
                autoComplete="off"
                spellCheck="true"
                lang="es"
              />
            </div>
            
            <div>
              <label htmlFor="moduleDescription" className="block text-sm font-medium text-gray-700 mb-2">
                Descripción (Opcional)
              </label>
              <textarea
                id="moduleDescription"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-brand_blue"
                placeholder="Describe brevemente el contenido del módulo..."
                disabled={isUpdating}
                autoComplete="off"
                spellCheck="true"
                lang="es"
              />
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mt-4">
            <div className="flex">
              <PencilIcon className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-blue-800 mb-1">
                  Actualizar información del módulo
                </h4>
                <p className="text-sm text-blue-700">
                  Los cambios se aplicarán inmediatamente y serán visibles en toda la plataforma.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isUpdating || !newTitle.trim()}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150 flex items-center"
          >
            {isUpdating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Actualizando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditModuleModal;