/**
 * Modal for selecting transformation assessment área
 * Shows when creating a NEW assessment (not when resuming)
 */

import { useEffect, useState } from 'react';

interface AreaSelectionModalProps {
  onSelect: (area: 'personalizacion' | 'aprendizaje') => void;
  initialArea?: 'personalizacion' | 'aprendizaje' | null;
  onCancel?: () => void;
}

const AREAS = [
  {
    id: 'personalizacion' as const,
    title: 'Personalización',
    description: 'Foco en individualización del aprendizaje, planes personales, tutorías y acompañamiento.',
    icon: '👤',
    features: [
      'Plan Personal de Aprendizaje',
      'Tutorías y mentoría',
      'Autoconocimiento del estudiante',
      'Trayectorias diferenciadas',
    ],
  },
  {
    id: 'aprendizaje' as const,
    title: 'Aprendizaje',
    description: 'Foco en metodologías activas, Aprendizaje Basado en Proyectos y aprendizaje cooperativo.',
    icon: '🚀',
    features: [
      'Aprendizaje Basado en Proyectos (ABP)',
      'Proyectos interdisciplinarios',
      'Aprendizaje cooperativo',
      'Ambientes de aprendizaje',
    ],
  },
];

export function AreaSelectionModal({ onSelect, initialArea, onCancel }: AreaSelectionModalProps) {
  const [selectedArea, setSelectedArea] = useState<'personalizacion' | 'aprendizaje' | null>(initialArea ?? null);

  useEffect(() => {
    setSelectedArea(initialArea ?? null);
  }, [initialArea]);

  const selectedAreaData = selectedArea ? AREAS.find(area => area.id === selectedArea) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-2xl font-bold">Selecciona la vía de transformación</h2>
          <p className="text-blue-100 mt-1">
            Elige el enfoque que mejor representa el trabajo de tu comunidad educativa
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-4">
            {AREAS.map((area) => (
              <button
                key={area.id}
                onClick={() => setSelectedArea(area.id)}
                className={`
                  relative text-left p-6 rounded-lg border-2 transition-all
                  ${
                    selectedArea === area.id
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-300 bg-white hover:border-blue-400 hover:shadow-sm'
                  }
                `}
              >
                {/* Selected indicator */}
                {selectedArea === area.id && (
                  <div className="absolute top-4 right-4">
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Icon */}
                <div className="text-4xl mb-3">{area.icon}</div>

                {/* Title */}
                <h3 className="text-xl font-bold text-gray-900 mb-2">{area.title}</h3>

                {/* Description */}
                <p className="text-gray-600 text-sm mb-4">{area.description}</p>

                {/* Features */}
                <ul className="space-y-2">
                  {area.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start text-sm text-gray-700">
                      <svg
                        className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {/* Info box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg
                className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="text-sm text-blue-900">
                  <strong>Nota:</strong> La vía seleccionada determinará las preguntas y criterios de evaluación específicos para tu comunidad.
                  Podrás completar autoevaluaciones para ambas vías creando evaluaciones separadas.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={() => {
              onCancel?.();
            }}
            className="px-6 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => selectedArea && onSelect(selectedArea)}
            disabled={!selectedArea}
            className={`
              px-6 py-2 rounded-lg font-medium transition-colors
              ${
                selectedArea
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            {selectedAreaData
              ? `Continuar con ${selectedAreaData.title}`
              : 'Selecciona una vía'}
          </button>
        </div>
      </div>
    </div>
  );
}
