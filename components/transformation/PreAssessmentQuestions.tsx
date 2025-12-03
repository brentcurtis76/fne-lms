import { useState, useEffect } from 'react';

export interface PreAssessmentAnswers {
  q1_num_estudiantes: string;
  q2_niveles_personalizacion: string[];  // 15 individual levels
  q3_generacion_tractor: string;  // "Sí" | "No"
  q3_tractor_niveles: string[];  // Conditional 8 levels
  q4_generacion_innova: string;  // "Sí" | "No"
  q4_innova_niveles: string[];  // Conditional 10 levels
  q5_tiempo_trabajando: string;  // Was q3
  q6_num_docentes: string;  // Was q4
  q7_plan_personal: string;  // Was q5, now has 7 options
  q8_entrevistas_individuales: string;  // Was q6
  q9_oportunidades_eleccion: string;  // Was q7
  q10_docentes_dua: string;  // Was q8
  q11_proyectos_autoconocimiento: string;  // Was q9
  q12_aspecto_fortalecer: string;  // Was q10
  q13_resistencias: string[];  // Was q11
  q14_percepcion_familias: string;  // Was q12
  q15_apoyo_directivo: string;  // Was q13
  q16_sistemas_seguimiento: string;  // Was q14
  q17_preparacion_docentes: string;  // Was q15
  q18_autorregulacion_estudiantes: string;  // Was q16
}

interface PreAssessmentQuestionsProps {
  onComplete: (answers: PreAssessmentAnswers) => void;
  onSave: (answers: PreAssessmentAnswers) => void;
  initialAnswers?: PreAssessmentAnswers;
  readOnly?: boolean;
}

const INITIAL_STATE: PreAssessmentAnswers = {
  q1_num_estudiantes: '',
  q2_niveles_personalizacion: [],
  q3_generacion_tractor: '',
  q3_tractor_niveles: [],
  q4_generacion_innova: '',
  q4_innova_niveles: [],
  q5_tiempo_trabajando: '',
  q6_num_docentes: '',
  q7_plan_personal: '',
  q8_entrevistas_individuales: '',
  q9_oportunidades_eleccion: '',
  q10_docentes_dua: '',
  q11_proyectos_autoconocimiento: '',
  q12_aspecto_fortalecer: '',
  q13_resistencias: [],
  q14_percepcion_familias: '',
  q15_apoyo_directivo: '',
  q16_sistemas_seguimiento: '',
  q17_preparacion_docentes: '',
  q18_autorregulacion_estudiantes: '',
};

export function PreAssessmentQuestions({
  onComplete,
  onSave,
  initialAnswers,
  readOnly = false,
}: PreAssessmentQuestionsProps) {
  const [answers, setAnswers] = useState<PreAssessmentAnswers>(
    initialAnswers ? { ...INITIAL_STATE, ...initialAnswers } : INITIAL_STATE
  );
  const [validationError, setValidationError] = useState<string>('');

  // Update parent when answers change (for auto-save)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (getAnsweredCount() > 0) {
        onSave(answers);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [answers, onSave]);

  const handleRadioChange = (questionKey: keyof PreAssessmentAnswers, value: string) => {
    if (readOnly) return;
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
    setValidationError('');
  };

  const handleCheckboxChange = (
    questionKey: 'q2_niveles_personalizacion' | 'q3_tractor_niveles' | 'q4_innova_niveles' | 'q13_resistencias',
    value: string,
    checked: boolean
  ) => {
    if (readOnly) return;
    setAnswers((prev) => {
      const currentValues = prev[questionKey] as string[];
      const newValues = checked
        ? [...currentValues, value]
        : currentValues.filter((v) => v !== value);
      return { ...prev, [questionKey]: newValues };
    });
    setValidationError('');
  };

  const getAnsweredCount = (): number => {
    let count = 0;

    // Single-select radio questions
    const singleSelectKeys: (keyof PreAssessmentAnswers)[] = [
      'q1_num_estudiantes',
      'q3_generacion_tractor',
      'q4_generacion_innova',
      'q5_tiempo_trabajando',
      'q6_num_docentes',
      'q7_plan_personal',
      'q8_entrevistas_individuales',
      'q9_oportunidades_eleccion',
      'q10_docentes_dua',
      'q11_proyectos_autoconocimiento',
      'q12_aspecto_fortalecer',
      'q14_percepcion_familias',
      'q15_apoyo_directivo',
      'q16_sistemas_seguimiento',
      'q17_preparacion_docentes',
      'q18_autorregulacion_estudiantes',
    ];

    singleSelectKeys.forEach((key) => {
      if (answers[key] && answers[key] !== '') count++;
    });

    // Multi-select checkbox questions
    if (answers.q2_niveles_personalizacion?.length > 0) count++;
    if (answers.q13_resistencias?.length > 0) count++;

    // Conditional checkbox questions (only count if parent question is "Sí")
    if (answers.q3_generacion_tractor === 'Sí' && answers.q3_tractor_niveles?.length > 0) {
      // Already counted parent question, this is just validation
    }
    if (answers.q4_generacion_innova === 'Sí' && answers.q4_innova_niveles?.length > 0) {
      // Already counted parent question, this is just validation
    }

    return count;
  };

  const isComplete = (): boolean => {
    // Must answer all 18 questions
    // If Q3 or Q4 is "Sí", must also select at least one level
    const baseComplete = getAnsweredCount() === 18;

    // Additional validation for conditional questions
    if (answers.q3_generacion_tractor === 'Sí' && (!answers.q3_tractor_niveles || answers.q3_tractor_niveles.length === 0)) {
      return false;
    }
    if (answers.q4_generacion_innova === 'Sí' && (!answers.q4_innova_niveles || answers.q4_innova_niveles.length === 0)) {
      return false;
    }

    return baseComplete;
  };

  const handleContinue = () => {
    if (!isComplete()) {
      setValidationError('Por favor responde todas las preguntas antes de continuar');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    onComplete(answers);
  };

  const handleSaveDraft = () => {
    onSave(answers);
  };

  const answeredCount = getAnsweredCount();
  const progressPercent = Math.round((answeredCount / 18) * 100);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Read-only banner */}
      {readOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-amber-800 text-sm font-medium">
            Vista de solo lectura - No puedes modificar estas respuestas
          </p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Preguntas de Contexto
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {readOnly
            ? 'Respuestas del contexto institucional proporcionadas para esta evaluación.'
            : 'Antes de comenzar la evaluación, necesitamos conocer el contexto de tu colegio. Estas preguntas nos ayudarán a personalizar la conversación.'}
        </p>

        {/* Progress Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              {answeredCount} de 18 preguntas respondidas
            </span>
            <span className="text-slate-500">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-sky-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="mt-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{validationError}</span>
          </div>
        )}
      </div>

      {/* SECCIÓN A */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">
            SECCIÓN A: Contexto Institucional
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Información general sobre tu colegio
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Q1 */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-900">
              1. ¿Cuántos estudiantes tiene aproximadamente tu colegio?
              {!readOnly && <span className="text-rose-500 ml-1">*</span>}
            </label>
            <div className="space-y-2">
              {['300-600', '600-900', '900-1200', '1200-1500', 'Más de 1500'].map(
                (option) => (
                  <label
                    key={option}
                    className={`flex items-center gap-3 p-3 border border-slate-200 rounded-lg transition ${
                      readOnly ? 'cursor-default' : 'hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="q1_num_estudiantes"
                      value={option}
                      checked={answers.q1_num_estudiantes === option}
                      onChange={(e) =>
                        handleRadioChange('q1_num_estudiantes', e.target.value)
                      }
                      disabled={readOnly}
                      className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-sm text-slate-700">{option}</span>
                  </label>
                )
              )}
            </div>
          </div>

          {/* Q2 */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              2. ¿En qué niveles educativos están trabajando actualmente en prácticas
              de personalización del aprendizaje?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <p className="text-xs text-slate-500">Selecciona todos los que apliquen</p>
            <div className="space-y-1.5">
              {[
                'Pre-Kínder',
                'Kínder',
                '1º Básico',
                '2º Básico',
                '3º Básico',
                '4º Básico',
                '5º Básico',
                '6º Básico',
                '7º Básico',
                '8º Básico',
                'Iº Medio',
                'IIº Medio',
                'IIIº Medio',
                'IVº Medio',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    value={option}
                    checked={answers.q2_niveles_personalizacion.includes(option)}
                    onChange={(e) =>
                      handleCheckboxChange(
                        'q2_niveles_personalizacion',
                        option,
                        e.target.checked
                      )
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q3 - NEW */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              3. ¿Tienen una Generación Tractor implementada?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {['Sí', 'No'].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q3_generacion_tractor"
                    value={option}
                    checked={answers.q3_generacion_tractor === option}
                    onChange={(e) => {
                      handleRadioChange('q3_generacion_tractor', e.target.value);
                      // Clear conditional checkboxes if "No" is selected
                      if (e.target.value === 'No') {
                        setAnswers(prev => ({ ...prev, q3_tractor_niveles: [] }));
                      }
                    }}
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>

            {/* Conditional checkboxes - only show if "Sí" */}
            {answers.q3_generacion_tractor === 'Sí' && (
              <div className="ml-6 mt-2 space-y-2 border-l-2 border-sky-200 pl-4">
                <p className="text-xs text-slate-600 font-medium">
                  ¿En qué cursos está implementada la Generación Tractor? <span className="text-rose-500">*</span>
                </p>
                <div className="space-y-1.5">
                  {[
                    'Pre-Kínder',
                    'Kínder',
                    '1º Básico',
                    '2º Básico',
                    '3º Básico',
                    '4º Básico',
                    '5º Básico',
                    '6º Básico',
                  ].map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        value={option}
                        checked={answers.q3_tractor_niveles.includes(option)}
                        onChange={(e) =>
                          handleCheckboxChange(
                            'q3_tractor_niveles',
                            option,
                            e.target.checked
                          )
                        }
                        className="w-4 h-4 text-sky-600 focus:ring-sky-500 rounded"
                      />
                      <span className="text-sm text-slate-700">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Q4 - NEW */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              4. ¿Tienen una Generación Innova implementada?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {['Sí', 'No'].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q4_generacion_innova"
                    value={option}
                    checked={answers.q4_generacion_innova === option}
                    onChange={(e) => {
                      handleRadioChange('q4_generacion_innova', e.target.value);
                      // Clear conditional checkboxes if "No" is selected
                      if (e.target.value === 'No') {
                        setAnswers(prev => ({ ...prev, q4_innova_niveles: [] }));
                      }
                    }}
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>

            {/* Conditional checkboxes - only show if "Sí" */}
            {answers.q4_generacion_innova === 'Sí' && (
              <div className="ml-6 mt-2 space-y-2 border-l-2 border-sky-200 pl-4">
                <p className="text-xs text-slate-600 font-medium">
                  ¿En qué cursos está implementada la Generación Innova? <span className="text-rose-500">*</span>
                </p>
                <div className="space-y-1.5">
                  {[
                    '3º Básico',
                    '4º Básico',
                    '5º Básico',
                    '6º Básico',
                    '7º Básico',
                    '8º Básico',
                    'Iº Medio',
                    'IIº Medio',
                    'IIIº Medio',
                    'IVº Medio',
                  ].map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        value={option}
                        checked={answers.q4_innova_niveles.includes(option)}
                        onChange={(e) =>
                          handleCheckboxChange(
                            'q4_innova_niveles',
                            option,
                            e.target.checked
                          )
                        }
                        className="w-4 h-4 text-sky-600 focus:ring-sky-500 rounded"
                      />
                      <span className="text-sm text-slate-700">{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Q5 (was Q3) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              5. ¿Cuánto tiempo lleva tu colegio trabajando en personalización del
              aprendizaje?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'Recién comenzamos (este año)',
                '1-2 años',
                '3-5 años',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q5_tiempo_trabajando"
                    value={option}
                    checked={answers.q5_tiempo_trabajando === option}
                    onChange={(e) =>
                      handleRadioChange('q5_tiempo_trabajando', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q6 (was Q4) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              6. ¿Cuántos docentes trabajan en tu colegio aproximadamente?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'Menos de 20',
                '20-40',
                '40-60',
                '60-80',
                'Más de 80',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q6_num_docentes"
                    value={option}
                    checked={answers.q6_num_docentes === option}
                    onChange={(e) =>
                      handleRadioChange('q6_num_docentes', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN B */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">
            SECCIÓN B: Estado Actual de Personalización
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Prácticas actuales en tu colegio
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Q7 (was Q5) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              7. ¿Tu colegio cuenta actualmente con algún modelo de plan personal
              implementado para los estudiantes?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'No, no existe',
                'Está en fase de diseño o piloto',
                'Sí, en algunos niveles (generación tractor)',
                'Sí, en algunos niveles (generación innova)',
                'Sí, en toda la escuela pero sin articulación',
                'Sí, en toda la escuela de manera articulada',
                'Sí, en generación tractor y generación innova',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q7_plan_personal"
                    value={option}
                    checked={answers.q7_plan_personal === option}
                    onChange={(e) =>
                      handleRadioChange('q7_plan_personal', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q8 (was Q6) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              8. ¿Los tutores realizan entrevistas individuales periódicas con
              estudiantes?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'No, no se realizan',
                'Solo cuando hay problemas',
                'Sí, al menos una vez al año',
                'Sí, 2-3 veces al año de manera planificada',
                'Sí, con periodicidad sistemática a lo largo del curso',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q8_entrevistas_individuales"
                    value={option}
                    checked={answers.q8_entrevistas_individuales === option}
                    onChange={(e) =>
                      handleRadioChange('q8_entrevistas_individuales', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q9 (was Q7) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              9. ¿Los estudiantes tienen oportunidades reales de elegir cómo, qué o
              con quién aprenden? (ambientes, cajas, proyectos)
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'No, todo está predefinido por el docente',
                'Ocasionalmente en actividades puntuales',
                'En algunos niveles o asignaturas específicas',
                'En la mayoría de los niveles con cierta regularidad',
                'Sí, la elección es parte central del modelo pedagógico',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q9_oportunidades_eleccion"
                    value={option}
                    checked={answers.q9_oportunidades_eleccion === option}
                    onChange={(e) =>
                      handleRadioChange('q9_oportunidades_eleccion', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q10 (was Q8) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              10. ¿Qué porcentaje de docentes conoce y aplica principios del Diseño
              Universal para el Aprendizaje (DUA)?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'Menos del 25% (o no conocen el concepto)',
                '25-50% conocen, pocos aplican',
                '50-75% conocen y algunos aplican',
                'Más del 75% aplican sistemáticamente',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q10_docentes_dua"
                    value={option}
                    checked={answers.q10_docentes_dua === option}
                    onChange={(e) =>
                      handleRadioChange('q10_docentes_dua', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q11 (was Q9) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              11. ¿Los estudiantes realizan proyectos de autoconocimiento estructurados?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'No realizamos proyectos de autoconocimiento',
                'Actividades aisladas o puntuales',
                'Sí, en algunos niveles o cursos',
                'Sí, con progresión diseñada entre cursos',
                'Sí, integrados transversalmente en asignaturas y conectados al plan personal',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q11_proyectos_autoconocimiento"
                    value={option}
                    checked={answers.q11_proyectos_autoconocimiento === option}
                    onChange={(e) =>
                      handleRadioChange('q11_proyectos_autoconocimiento', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN C */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">
            SECCIÓN C: Resistencias y Barreras
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Desafíos en la implementación
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Q12 (was Q10) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              12. Si pudieras fortalecer un aspecto para avanzar más rápido en
              personalización del aprendizaje, ¿cuál tendría mayor impacto?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'Aumentar tiempos de planificación colaborativa docente',
                'Acceso a formación específica en herramientas de personalización',
                'Fortalecer la cultura de innovación y experimentación en la escuela',
                'Contar con más espacios físicos y materiales diversos',
                'Tener más flexibilidad curricular para priorizar la personalización',
                'Mejor comunicación y alineamiento con las familias',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q12_aspecto_fortalecer"
                    value={option}
                    checked={answers.q12_aspecto_fortalecer === option}
                    onChange={(e) =>
                      handleRadioChange('q12_aspecto_fortalecer', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q13 (was Q11) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              13. ¿Dónde encuentran las mayores resistencias a dar mayor autonomía y
              elección a los estudiantes?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <p className="text-xs text-slate-500">Selecciona todas las que apliquen</p>
            <div className="space-y-1.5">
              {[
                'Docentes de básica',
                'Docentes de media',
                'Equipo directivo',
                'Familias (temen "pérdida de control")',
                'Los propios estudiantes (no están acostumbrados a elegir)',
                'No encontramos resistencias significativas',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    value={option}
                    checked={answers.q13_resistencias.includes(option)}
                    onChange={(e) =>
                      handleCheckboxChange(
                        'q13_resistencias',
                        option,
                        e.target.checked
                      )
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500 rounded"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q14 (was Q12) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              14. Las familias de tu colegio, ¿cómo perciben el enfoque de
              personalización del aprendizaje?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'Lo desconocen / no se les ha comunicado',
                'Lo entienden y valoran',
                'Lo aceptan con dudas (¿mi hijo aprenderá lo necesario?)',
                'Lo rechazan o cuestionan activamente',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q14_percepcion_familias"
                    value={option}
                    checked={answers.q14_percepcion_familias === option}
                    onChange={(e) =>
                      handleRadioChange('q14_percepcion_familias', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q15 (was Q13) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              15. ¿El equipo directivo prioriza y apoya activamente la personalización
              del aprendizaje?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'No es una prioridad institucional',
                'Se menciona pero sin recursos o seguimiento',
                'Sí, hay apoyo y algunos recursos',
                'Sí, es un pilar estratégico con liderazgo claro',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q15_apoyo_directivo"
                    value={option}
                    checked={answers.q15_apoyo_directivo === option}
                    onChange={(e) =>
                      handleRadioChange('q15_apoyo_directivo', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN D */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-brand_beige to-brand_beige/70 px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">
            SECCIÓN D: Capacidad y Percepción
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Capacidades actuales del equipo y estudiantes
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Q16 (was Q14) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              16. ¿La escuela cuenta con sistemas o herramientas para hacer seguimiento
              individual de cada estudiante?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'No tenemos sistemas de seguimiento individual',
                'Cada docente lo hace a su manera sin sistema común',
                'Tenemos herramientas pero se usan de forma inconsistente',
                'Sí, hay un sistema institucional implementado',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q16_sistemas_seguimiento"
                    value={option}
                    checked={answers.q16_sistemas_seguimiento === option}
                    onChange={(e) =>
                      handleRadioChange('q16_sistemas_seguimiento', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q17 (was Q15) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              17. En tu percepción, ¿qué tan preparados están los docentes para
              acompañar trayectorias personalizadas de aprendizaje?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'Bajo - es un desafío muy grande para la mayoría',
                'Medio - entienden la idea pero les cuesta la práctica',
                'Alto - están implementando gradualmente con buenos resultados',
                'Experto - dominan el acompañamiento personalizado',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q17_preparacion_docentes"
                    value={option}
                    checked={answers.q17_preparacion_docentes === option}
                    onChange={(e) =>
                      handleRadioChange('q17_preparacion_docentes', e.target.value)
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Q18 (was Q16) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900">
              18. ¿Los estudiantes de tu colegio demuestran capacidad de
              autorregulación, planificación y reflexión sobre su propio aprendizaje?
              <span className="text-rose-500 ml-1">*</span>
            </label>
            <div className="space-y-1.5">
              {[
                'Muy bajo - dependen totalmente del docente',
                'Bajo - algunos estudiantes en ciertos momentos',
                'Medio - está en desarrollo pero aún inconsistente',
                'Alto - la mayoría de estudiantes muestra autonomía creciente',
              ].map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                >
                  <input
                    type="radio"
                    name="q18_autorregulacion_estudiantes"
                    value={option}
                    checked={answers.q18_autorregulacion_estudiantes === option}
                    onChange={(e) =>
                      handleRadioChange(
                        'q18_autorregulacion_estudiantes',
                        e.target.value
                      )
                    }
                    className="w-4 h-4 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-slate-700">{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons - Hidden in read-only mode */}
      {!readOnly && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <button
              onClick={handleSaveDraft}
              className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 transition"
            >
              Guardar Borrador
            </button>
            <button
              onClick={handleContinue}
              disabled={!isComplete()}
              className={`px-6 py-3 rounded-lg font-semibold transition ${
                isComplete()
                  ? 'bg-sky-600 text-white hover:bg-sky-700'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              Continuar a la Evaluación
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
