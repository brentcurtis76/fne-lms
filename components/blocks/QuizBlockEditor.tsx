import React, { useState } from 'react';
import { QuizBlock, QuizQuestion } from '@/types/blocks';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Trash2, GripVertical } from 'lucide-react';

interface QuizBlockEditorProps {
  block: QuizBlock;
  onUpdate: (blockId: string, field: keyof QuizBlock['payload'], value: any) => void;
  onTitleChange: (blockId: string, title: string) => void;
  onSave: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: (blockId: string) => void;
}

const QuizBlockEditor: React.FC<QuizBlockEditorProps> = ({
  block,
  onUpdate,
  onTitleChange,
  onSave,
  onDelete,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addQuestion = () => {
    const newQuestion: QuizQuestion = {
      id: generateId(),
      question: '',
      type: 'multiple-choice',
      options: [
        { id: generateId(), text: '', isCorrect: false },
        { id: generateId(), text: '', isCorrect: false },
        { id: generateId(), text: '', isCorrect: false },
        { id: generateId(), text: '', isCorrect: false },
      ],
      points: 1,
      explanation: '',
    };

    const updatedQuestions = [...block.payload.questions, newQuestion];
    onUpdate(block.id, 'questions', updatedQuestions);
    updateTotalPoints(updatedQuestions);
    setActiveQuestionId(newQuestion.id);
  };

  const removeQuestion = (questionId: string) => {
    const updatedQuestions = block.payload.questions.filter(q => q.id !== questionId);
    onUpdate(block.id, 'questions', updatedQuestions);
    updateTotalPoints(updatedQuestions);
    if (activeQuestionId === questionId) {
      setActiveQuestionId(null);
    }
  };

  const updateQuestion = (questionId: string, field: keyof QuizQuestion, value: any) => {
    const updatedQuestions = block.payload.questions.map(q => {
      if (q.id === questionId) {
        const updated = { ...q, [field]: value };
        
        // Handle type changes
        if (field === 'type') {
          if (value === 'true-false') {
            // Set up true/false options
            updated.options = [
              { id: generateId(), text: 'Verdadero', isCorrect: false },
              { id: generateId(), text: 'Falso', isCorrect: false }
            ];
          } else if (value === 'multiple-choice' && q.type !== 'multiple-choice') {
            // Set up default multiple choice options
            updated.options = [
              { id: generateId(), text: '', isCorrect: false },
              { id: generateId(), text: '', isCorrect: false },
              { id: generateId(), text: '', isCorrect: false },
              { id: generateId(), text: '', isCorrect: false }
            ];
          } else if (value === 'open-ended') {
            // Clear options for open-ended questions
            updated.options = [];
          }
        }
        
        return updated;
      }
      return q;
    });
    
    onUpdate(block.id, 'questions', updatedQuestions);
    if (field === 'points') {
      updateTotalPoints(updatedQuestions);
    }
  };

  const updateTotalPoints = (questions: QuizQuestion[]) => {
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
    onUpdate(block.id, 'totalPoints', totalPoints);
  };

  const addOption = (questionId: string) => {
    const updatedQuestions = block.payload.questions.map(q =>
      q.id === questionId
        ? {
            ...q,
            options: [...q.options, { id: generateId(), text: '', isCorrect: false }]
          }
        : q
    );
    onUpdate(block.id, 'questions', updatedQuestions);
  };

  const removeOption = (questionId: string, optionId: string) => {
    const updatedQuestions = block.payload.questions.map(q =>
      q.id === questionId
        ? { ...q, options: q.options.filter(o => o.id !== optionId) }
        : q
    );
    onUpdate(block.id, 'questions', updatedQuestions);
  };

  const updateOption = (questionId: string, optionId: string, field: string, value: any) => {
    const updatedQuestions = block.payload.questions.map(q =>
      q.id === questionId
        ? {
            ...q,
            options: q.options.map(o =>
              o.id === optionId ? { ...o, [field]: value } : o
            )
          }
        : q
    );
    onUpdate(block.id, 'questions', updatedQuestions);
  };

  const setCorrectAnswer = (questionId: string, optionId: string) => {
    const updatedQuestions = block.payload.questions.map(q =>
      q.id === questionId
        ? {
            ...q,
            options: q.options.map(o => ({
              ...o,
              isCorrect: o.id === optionId
            }))
          }
        : q
    );
    onUpdate(block.id, 'questions', updatedQuestions);
  };

  return (
    <div className="border rounded-lg p-6 shadow-sm mb-6 bg-white">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <GripVertical className="text-gray-400" size={20} />
          <h2 className="text-lg font-semibold text-[#00365b]">
            Quiz: {block.payload.title || 'Sin título'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onToggleCollapse(block.id)}>
            {isCollapsed ? <ChevronDown /> : <ChevronUp />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(block.id)}>
            <Trash2 className="text-[#ef4044]" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-6">
          {/* Quiz Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título del Quiz
              </label>
              <input
                type="text"
                value={block.payload.title || ''}
                onChange={(e) => onTitleChange(block.id, e.target.value)}
                placeholder="Ingrese el título del quiz"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Puntos Totales
              </label>
              <input
                type="number"
                value={block.payload.totalPoints || 0}
                readOnly
                className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={block.payload.description || ''}
              onChange={(e) => onUpdate(block.id, 'description', e.target.value)}
              placeholder="Descripción del quiz (opcional)"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instrucciones
            </label>
            <textarea
              value={block.payload.instructions || ''}
              onChange={(e) => onUpdate(block.id, 'instructions', e.target.value)}
              placeholder="Instrucciones para los estudiantes (opcional)"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              rows={2}
            />
          </div>

          {/* Quiz Settings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={block.payload.allowRetries}
                onChange={(e) => onUpdate(block.id, 'allowRetries', e.target.checked)}
                className="form-checkbox text-[#00365b]"
              />
              <span className="text-sm">Permitir reintentos</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={block.payload.showResults}
                onChange={(e) => onUpdate(block.id, 'showResults', e.target.checked)}
                className="form-checkbox text-[#00365b]"
              />
              <span className="text-sm">Mostrar resultados</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={block.payload.randomizeQuestions}
                onChange={(e) => onUpdate(block.id, 'randomizeQuestions', e.target.checked)}
                className="form-checkbox text-[#00365b]"
              />
              <span className="text-sm">Preguntas aleatorias</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={block.payload.randomizeAnswers}
                onChange={(e) => onUpdate(block.id, 'randomizeAnswers', e.target.checked)}
                className="form-checkbox text-[#00365b]"
              />
              <span className="text-sm">Respuestas aleatorias</span>
            </label>
          </div>

          {/* Questions */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-semibold text-[#00365b]">
                Preguntas ({block.payload.questions.length})
              </h3>
              <Button
                onClick={addQuestion}
                className="bg-[#00365b] hover:bg-[#fdb933] hover:text-[#00365b] text-white"
                size="sm"
              >
                <Plus size={16} className="mr-1" />
                Agregar Pregunta
              </Button>
            </div>

            <div className="space-y-4">
              {block.payload.questions.map((question, questionIndex) => (
                <div
                  key={question.id}
                  className={`border rounded-lg p-4 ${
                    activeQuestionId === question.id ? 'border-[#00365b] bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-medium text-gray-700">
                      Pregunta {questionIndex + 1}
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setActiveQuestionId(
                            activeQuestionId === question.id ? null : question.id
                          )
                        }
                        className="text-[#00365b] hover:text-[#fdb933] text-sm"
                      >
                        {activeQuestionId === question.id ? 'Colapsar' : 'Expandir'}
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(question.id)}
                      >
                        <Trash2 size={16} className="text-[#ef4044]" />
                      </Button>
                    </div>
                  </div>

                  {activeQuestionId === question.id && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Pregunta
                        </label>
                        <textarea
                          value={question.question}
                          onChange={(e) => updateQuestion(question.id, 'question', e.target.value)}
                          placeholder="Escriba la pregunta aquí..."
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                          rows={2}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Tipo de pregunta
                          </label>
                          <select
                            value={question.type}
                            onChange={(e) => updateQuestion(question.id, 'type', e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                          >
                            <option value="multiple-choice">Opción múltiple</option>
                            <option value="true-false">Verdadero/Falso</option>
                            <option value="open-ended">Pregunta abierta</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Puntos
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={question.points}
                            onChange={(e) => updateQuestion(question.id, 'points', parseInt(e.target.value) || 1)}
                            onFocus={(e) => e.target.select()}
                            className="w-full p-3 text-center border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent font-medium"
                          />
                        </div>
                      </div>

                      {/* Options for multiple choice and true/false */}
                      {question.type !== 'open-ended' && (
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Opciones de respuesta
                            </label>
                            {question.type === 'multiple-choice' && question.options.length < 6 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => addOption(question.id)}
                              >
                                <Plus size={14} className="mr-1" />
                                Agregar opción
                              </Button>
                            )}
                          </div>
                          <div className="space-y-2">
                            {question.options.map((option, optionIndex) => (
                              <div key={option.id} className="flex items-center gap-2">
                                <span className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium">
                                  {String.fromCharCode(65 + optionIndex)}
                                </span>
                                <input
                                  type="text"
                                  value={option.text}
                                  onChange={(e) => updateOption(question.id, option.id, 'text', e.target.value)}
                                  placeholder={`Opción ${String.fromCharCode(65 + optionIndex)}`}
                                  className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                                />
                                <input
                                  type="radio"
                                  name={`correct-${question.id}`}
                                  checked={option.isCorrect}
                                  onChange={() => setCorrectAnswer(question.id, option.id)}
                                  className="form-radio text-[#00365b]"
                                />
                                <label className="text-xs text-gray-500">Correcta</label>
                                {question.options.length > 2 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeOption(question.id, option.id)}
                                  >
                                    <Trash2 size={14} className="text-[#ef4044]" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Open-ended specific fields */}
                      {question.type === 'open-ended' && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Límite de caracteres (opcional)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              value={question.characterLimit || ''}
                              onChange={(e) => updateQuestion(question.id, 'characterLimit', e.target.value ? parseInt(e.target.value) : undefined)}
                              placeholder="Sin límite"
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Respuesta esperada (referencia para el consultor)
                            </label>
                            <textarea
                              value={question.expectedAnswer || ''}
                              onChange={(e) => updateQuestion(question.id, 'expectedAnswer', e.target.value)}
                              placeholder="Escriba aquí la respuesta modelo o puntos clave esperados..."
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                              rows={3}
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Guía de calificación (instrucciones para el consultor)
                            </label>
                            <textarea
                              value={question.gradingGuidelines || ''}
                              onChange={(e) => updateQuestion(question.id, 'gradingGuidelines', e.target.value)}
                              placeholder="Ej: Asignar puntos completos si menciona X, Y y Z. Deducir 50% si falta algún elemento clave..."
                              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                              rows={2}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Explicación (opcional)
                        </label>
                        <textarea
                          value={question.explanation || ''}
                          onChange={(e) => updateQuestion(question.id, 'explanation', e.target.value)}
                          placeholder="Explique por qué esta es la respuesta correcta..."
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => onDelete(block.id)}
              className="text-[#ef4044] hover:text-red-700"
            >
              Eliminar Quiz
            </Button>
            <Button
              onClick={() => onSave(block.id)}
              className="bg-[#00365b] hover:bg-[#fdb933] hover:text-[#00365b] text-white"
            >
              Guardar Quiz
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizBlockEditor;