import React, { useState, useEffect } from 'react';
import { XIcon, ArrowRightIcon } from '@heroicons/react/outline';
import { supabase } from '../lib/supabase';

interface Module {
  id: string;
  title: string;
  order_number: number;
}

interface MoveLessonModalProps {
  lessonTitle: string;
  lessonId: string;
  currentModuleId: string;
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (targetModuleId: string) => void;
  isMoving: boolean;
}

const MoveLessonModal: React.FC<MoveLessonModalProps> = ({
  lessonTitle,
  lessonId,
  currentModuleId,
  courseId,
  isOpen,
  onClose,
  onConfirm,
  isMoving
}) => {
  const [availableModules, setAvailableModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchAvailableModules();
    }
  }, [isOpen, courseId, currentModuleId]);

  const fetchAvailableModules = async () => {
    setLoading(true);
    try {
      const { data: modules, error } = await supabase
        .from('modules')
        .select('id, title, order_number')
        .eq('course_id', courseId)
        .neq('id', currentModuleId) // Exclude current module
        .order('order_number', { ascending: true });

      if (error) throw error;
      setAvailableModules(modules || []);
    } catch (error) {
      console.error('Error fetching modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedModuleId) {
      onConfirm(selectedModuleId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <ArrowRightIcon className="h-6 w-6 text-brand_blue mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">
              Mover Lección
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isMoving}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <XIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <div className="flex">
              <ArrowRightIcon className="h-5 w-5 text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-blue-800 mb-1">
                  Mover lección a otro módulo
                </h4>
                <p className="text-sm text-blue-700">
                  La lección <strong>"{lessonTitle}"</strong> se moverá al módulo seleccionado y se reorganizará automáticamente.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin h-6 w-6 border-2 border-brand_blue border-t-transparent rounded-full mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Cargando módulos...</p>
            </div>
          ) : availableModules.length > 0 ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Selecciona el módulo de destino:
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableModules.map((module) => (
                  <label
                    key={module.id}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedModuleId === module.id
                        ? 'border-brand_blue bg-brand_blue/10'
                        : 'border-gray-300 hover:border-brand_blue/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetModule"
                      value={module.id}
                      checked={selectedModuleId === module.id}
                      onChange={(e) => setSelectedModuleId(e.target.value)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                      selectedModuleId === module.id
                        ? 'border-brand_blue bg-brand_blue'
                        : 'border-gray-300'
                    }`}>
                      {selectedModuleId === module.id && (
                        <div className="w-2 h-2 rounded-full bg-white"></div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {module.order_number}. {module.title}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600">
                No hay otros módulos disponibles en este curso.
              </p>
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            disabled={isMoving}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isMoving || !selectedModuleId || availableModules.length === 0}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150 flex items-center"
          >
            {isMoving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Moviendo...
              </>
            ) : (
              'Mover Lección'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MoveLessonModal;