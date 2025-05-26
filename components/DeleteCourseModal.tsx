import { useState, useEffect } from 'react';

interface DeleteCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  courseTitle: string;
  isDeleting?: boolean;
}

const DeleteCourseModal: React.FC<DeleteCourseModalProps> = ({ isOpen, onClose, onConfirm, courseTitle, isDeleting }) => {
  const [confirmationText, setConfirmationText] = useState('');
  const isConfirmationMatch = confirmationText === 'Eliminar';

  useEffect(() => {
    // Reset confirmation text when modal is opened/closed
    if (isOpen) {
      setConfirmationText('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] font-mont">
      <div className="bg-white rounded-lg shadow-xl p-6 md:p-8 w-full max-w-md transform transition-all">
        <h2 className="text-xl md:text-2xl font-bold text-brand_blue mb-4">
          Confirmar Eliminación
        </h2>
        <p className="text-sm md:text-base text-gray-700 mb-1">
          ¿Estás seguro de que quieres eliminar el curso "<span className="font-bold">{courseTitle}</span>"?
        </p>
        <p className="text-sm text-gray-600 mb-6">
          Esta acción no se puede deshacer directamente. El curso y todo su contenido asociado se moverán a tablas de respaldo.
        </p>
        
        <div className="mb-6">
          <label htmlFor="confirmationInput" className="block text-sm font-medium text-gray-700 mb-1">
            Para confirmar, escribe "<span className="font-bold text-red-600">Eliminar</span>" en el campo de abajo:
          </label>
          <input
            type="text"
            id="confirmationInput"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Eliminar"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand_blue focus:border-brand_blue sm:text-sm font-mont"
          />
        </div>

        <div className="flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={onConfirm}
            disabled={!isConfirmationMatch || isDeleting}
            className={`w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-base font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 font-mont ${isConfirmationMatch && !isDeleting ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-red-300 cursor-not-allowed'}`}
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar Curso'}
          </button>
          <button
            onClick={onClose}
            disabled={isDeleting}
            type="button"
            className="w-full sm:w-auto inline-flex justify-center rounded-md border border-gray-300 px-4 py-2 bg-white text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_yellow transition-colors duration-150 font-mont disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteCourseModal;
