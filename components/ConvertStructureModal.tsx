import React, { useState } from 'react';
import { X, AlertTriangle, ArrowRight } from 'lucide-react';

interface ConvertStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  courseTitle: string;
  currentStructure: 'simple' | 'structured';
  targetStructure: 'simple' | 'structured';
  moduleCount: number;
  lessonCount: number;
  isConverting: boolean;
}

const ConvertStructureModal: React.FC<ConvertStructureModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  courseTitle,
  currentStructure,
  targetStructure,
  moduleCount,
  lessonCount,
  isConverting
}) => {
  if (!isOpen) return null;

  const getConversionWarning = () => {
    if (targetStructure === 'simple') {
      if (moduleCount > 1) {
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <AlertTriangle className="text-yellow-600 mt-0.5 mr-3" size={20} />
              <div>
                <h4 className="text-yellow-800 font-semibold mb-1">Advertencia: Múltiples Módulos</h4>
                <p className="text-yellow-700 text-sm">
                  Este curso tiene {moduleCount} módulos. Al convertir a estructura simple, 
                  todas las lecciones se moverán directamente al curso y se eliminarán los módulos.
                  La organización modular se perderá.
                </p>
              </div>
            </div>
          </div>
        );
      }
    }
    return null;
  };

  const getConversionDescription = () => {
    if (targetStructure === 'simple') {
      return (
        <div className="space-y-3">
          <p className="text-gray-600">
            La conversión a estructura <strong>simple</strong> realizará los siguientes cambios:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
            <li>Todas las lecciones se moverán directamente al curso</li>
            <li>Se eliminarán todos los módulos ({moduleCount} módulo{moduleCount !== 1 ? 's' : ''})</li>
            <li>Las lecciones mantendrán su orden secuencial</li>
            <li>Los estudiantes verán las lecciones en una lista única</li>
          </ul>
        </div>
      );
    } else {
      return (
        <div className="space-y-3">
          <p className="text-gray-600">
            La conversión a estructura <strong>modular</strong> realizará los siguientes cambios:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
            <li>Se creará un módulo principal para organizar las lecciones</li>
            <li>Todas las lecciones ({lessonCount} lección{lessonCount !== 1 ? 'es' : ''}) se moverán al nuevo módulo</li>
            <li>Podrás crear módulos adicionales después de la conversión</li>
            <li>Los estudiantes verán las lecciones organizadas por módulos</li>
          </ul>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Convertir Estructura del Curso
                  </h3>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500"
                    disabled={isConverting}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mt-4">
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="font-semibold text-gray-800 mb-2">{courseTitle}</h4>
                    <div className="flex items-center text-sm text-gray-600">
                      <span className={`px-2 py-1 rounded-full font-medium ${
                        currentStructure === 'simple' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {currentStructure === 'simple' ? 'Simple' : 'Modular'}
                      </span>
                      <ArrowRight className="mx-3 text-gray-400" size={16} />
                      <span className={`px-2 py-1 rounded-full font-medium ${
                        targetStructure === 'simple' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {targetStructure === 'simple' ? 'Simple' : 'Modular'}
                      </span>
                    </div>
                  </div>

                  {getConversionWarning()}
                  {getConversionDescription()}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <p className="text-blue-700 text-sm">
                      <strong>Nota:</strong> Esta acción puede ser revertida convirtiendo 
                      el curso de vuelta a su estructura original.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isConverting}
              className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm ${
                isConverting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-brand_blue hover:bg-brand_blue/90 focus:ring-brand_blue'
              }`}
            >
              {isConverting ? 'Convirtiendo...' : 'Convertir Estructura'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isConverting}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConvertStructureModal;