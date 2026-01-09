import React, { useState, useEffect } from 'react';
import { X, Users, GraduationCap, Zap, ArrowRight, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import CollaboratorSelector from './CollaboratorSelector';
import GradeSelector from './GradeSelector';
import { AREA_LABELS, AREA_ICONS, AREA_DESCRIPTIONS } from '@/types/transformation';
import type { ChileanGrade } from '@/types/grades';

type TransformationArea = 'personalizacion' | 'aprendizaje' | 'evaluacion';

interface AssessmentSetupModalProps {
  schoolId: number;
  schoolName: string;
  onClose: () => void;
  onSuccess: (assessmentId: string) => void;
}

export default function AssessmentSetupModal({
  schoolId,
  schoolName,
  onClose,
  onSuccess,
}: AssessmentSetupModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedArea, setSelectedArea] = useState<TransformationArea | null>(null);
  const [selectedGrades, setSelectedGrades] = useState<ChileanGrade[]>([]);
  const [selectedCollaborators, setSelectedCollaborators] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get available areas (personalizacion, aprendizaje, and evaluacion are available)
  const availableAreas: TransformationArea[] = ['personalizacion', 'aprendizaje', 'evaluacion'];

  const getAreaInfo = (area: TransformationArea) => {
    return {
      label: AREA_LABELS[area] || area,
      emoji: AREA_ICONS[area] || '📋',
      description: AREA_DESCRIPTIONS[area] || '',
    };
  };

  const handleNext = () => {
    if (step === 1 && !selectedArea) {
      toast.error('Selecciona un área de transformación');
      return;
    }
    if (step === 2 && selectedGrades.length === 0) {
      toast.error('Selecciona al menos un grado');
      return;
    }
    if (step < 3) {
      setStep((step + 1) as 1 | 2 | 3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3);
    }
  };

  const handleSubmit = async () => {
    if (!selectedArea || selectedGrades.length === 0) {
      toast.error('Completa todos los campos requeridos');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/vias-transformacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          area: selectedArea,
          grades: selectedGrades,
          collaboratorIds: selectedCollaborators,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Evaluación creada correctamente');
        onSuccess(data.assessment.id);
      } else {
        toast.error(data.error || 'Error al crear la evaluación');
      }
    } catch (error) {
      console.error('[AssessmentSetupModal] Error:', error);
      toast.error('Error al crear la evaluación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return !!selectedArea;
    if (step === 2) return selectedGrades.length > 0;
    return true; // Step 3 collaborators are optional
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Nueva Evaluación</h2>
              <p className="text-sm text-gray-500">{schoolName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress indicator */}
          <div className="px-6 pt-4">
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`flex items-center ${s < 3 ? 'flex-1' : ''}`}
                >
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                      step >= s
                        ? 'bg-yellow-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {step > s ? <CheckCircle className="h-5 w-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div
                      className={`flex-1 h-1 mx-2 ${
                        step > s ? 'bg-yellow-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mb-4">
              <span>Área</span>
              <span>Grados</span>
              <span>Colaboradores</span>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-4">
            {/* Step 1: Select Area */}
            {step === 1 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Selecciona el área de transformación a evaluar:
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {availableAreas.map(area => {
                    const info = getAreaInfo(area);
                    const isSelected = selectedArea === area;

                    return (
                      <button
                        key={area}
                        onClick={() => setSelectedArea(area)}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          isSelected
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{info.emoji}</span>
                          <span className="font-medium text-gray-900">{info.label}</span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {info.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Select Grades */}
            {step === 2 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  <GraduationCap className="inline h-4 w-4 mr-1" />
                  Selecciona los grados que incluirá esta evaluación:
                </h3>
                <GradeSelector
                  selectedGrades={selectedGrades}
                  onSelectionChange={setSelectedGrades}
                />
              </div>
            )}

            {/* Step 3: Select Collaborators */}
            {step === 3 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">
                  <Users className="inline h-4 w-4 mr-1" />
                  Invita colaboradores de tu escuela (opcional):
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Todos los colaboradores podrán editar esta evaluación.
                  Puedes agregar o remover colaboradores después.
                </p>
                <CollaboratorSelector
                  schoolId={schoolId}
                  selectedIds={selectedCollaborators}
                  onSelectionChange={setSelectedCollaborators}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              onClick={step === 1 ? onClose : handleBack}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {step === 1 ? 'Cancelar' : 'Atrás'}
            </button>

            {step < 3 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-yellow-500 rounded-lg hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-yellow-500 rounded-lg hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Iniciar Evaluación
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
