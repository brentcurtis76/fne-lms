import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { metadataHasRole } from '@/utils/roleUtils';
import {
  HelpCircle,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  ArrowLeft,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  Lock,
  Shield,
} from 'lucide-react';
import type { ContextGeneralQuestion, ContextQuestionType } from '@/types/assessment-builder';

// ============================================================
// Types
// ============================================================

interface QuestionFormData {
  question_text: string;
  question_type: ContextQuestionType;
  options: string;
  placeholder: string;
  help_text: string;
  is_required: boolean;
  display_order: number;
}

const EMPTY_FORM: QuestionFormData = {
  question_text: '',
  question_type: 'text',
  options: '',
  placeholder: '',
  help_text: '',
  is_required: false,
  display_order: 0,
};

const QUESTION_TYPE_LABELS: Record<ContextQuestionType, string> = {
  text: 'Texto',
  number: 'Número',
  select: 'Selección única',
  multiselect: 'Selección múltiple',
  boolean: 'Sí / No',
  scale: 'Escala',
  textarea: 'Texto largo',
};

const QUESTION_TYPE_COLORS: Record<ContextQuestionType, string> = {
  text: 'bg-blue-100 text-blue-800',
  number: 'bg-purple-100 text-purple-800',
  select: 'bg-green-100 text-green-800',
  multiselect: 'bg-teal-100 text-teal-800',
  boolean: 'bg-yellow-100 text-yellow-800',
  scale: 'bg-orange-100 text-orange-800',
  textarea: 'bg-indigo-100 text-indigo-800',
};

/** Returns true when the question maps to a DB column (structural widget). */
const isStructuralQuestion = (q: ContextGeneralQuestion): boolean =>
  !!q.widget_type && q.widget_type !== 'generic';

// ============================================================
// Component
// ============================================================

const ContextQuestionsPage: React.FC = () => {
  const supabase = useSupabaseClient();
  const router = useRouter();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [questions, setQuestions] = useState<ContextGeneralQuestion[]>([]);
  const [fetchLoading, setFetchLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<QuestionFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Track whether the question being edited is structural
  const [editingIsStructural, setEditingIsStructural] = useState(false);

  // Toggle state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ----------------------------------------------------------
  // Auth check
  // ----------------------------------------------------------
  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      if (!metadataHasRole(session.user.user_metadata, 'admin')) {
        router.push('/dashboard');
        return;
      }
      setUser(session.user);
      setLoading(false);
    };
    check();
  }, [supabase, router]);

  // ----------------------------------------------------------
  // Fetch questions
  // ----------------------------------------------------------
  const fetchQuestions = useCallback(async () => {
    setFetchLoading(true);
    try {
      const res = await fetch('/api/admin/context-questions');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al cargar preguntas');
      }
      const data = await res.json();
      setQuestions(data.questions ?? []);
    } catch (err: any) {
      console.error('Error fetching context questions:', err);
      toast.error(err.message || 'Error al cargar preguntas');
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchQuestions();
    }
  }, [user, fetchQuestions]);

  // ----------------------------------------------------------
  // Handlers
  // ----------------------------------------------------------

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  const openAddForm = () => {
    setEditingId(null);
    setEditingIsStructural(false);
    const nextOrder =
      questions.length > 0
        ? Math.max(...questions.map((q) => q.display_order)) + 1
        : 1;
    setFormData({ ...EMPTY_FORM, display_order: nextOrder });
    setShowForm(true);
  };

  const openEditForm = (question: ContextGeneralQuestion) => {
    setEditingId(question.id);
    setEditingIsStructural(isStructuralQuestion(question));
    setFormData({
      question_text: question.question_text,
      question_type: question.question_type,
      options: question.options ? question.options.join(', ') : '',
      placeholder: question.placeholder ?? '',
      help_text: question.help_text ?? '',
      is_required: question.is_required,
      display_order: question.display_order,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingIsStructural(false);
    setFormData(EMPTY_FORM);
  };

  const handleFormChange = (
    field: keyof QuestionFormData,
    value: string | boolean | number,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    // Validation
    if (!formData.question_text.trim()) {
      toast.error('El texto de la pregunta es obligatorio');
      return;
    }

    const needsOptions =
      formData.question_type === 'select' || formData.question_type === 'multiselect';
    const optionsArray = formData.options
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (needsOptions && optionsArray.length < 2) {
      toast.error('Ingresa al menos 2 opciones separadas por comas');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        question_text: formData.question_text.trim(),
        // Don't send question_type for structural questions — it's tied to a DB column
        ...(editingIsStructural ? {} : { question_type: formData.question_type }),
        options: needsOptions ? optionsArray : null,
        placeholder: formData.placeholder.trim() || null,
        help_text: formData.help_text.trim() || null,
        is_required: formData.is_required,
        display_order: formData.display_order,
      };

      let res: Response;

      if (editingId) {
        // PUT update
        res = await fetch(`/api/admin/context-questions/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // POST create
        res = await fetch('/api/admin/context-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar pregunta');
      }

      toast.success(
        editingId ? 'Pregunta actualizada correctamente' : 'Pregunta creada correctamente',
      );
      closeForm();
      fetchQuestions();
    } catch (err: any) {
      console.error('Error saving context question:', err);
      toast.error(err.message || 'Error al guardar pregunta');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (question: ContextGeneralQuestion) => {
    setTogglingId(question.id);
    try {
      if (question.is_active) {
        // Deactivate via DELETE (soft-delete)
        const res = await fetch(`/api/admin/context-questions/${question.id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al desactivar pregunta');
        toast.success('Pregunta desactivada');
      } else {
        // Activate via PUT
        const res = await fetch(`/api/admin/context-questions/${question.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al activar pregunta');
        toast.success('Pregunta activada');
      }
      fetchQuestions();
    } catch (err: any) {
      console.error('Error toggling question active state:', err);
      toast.error(err.message || 'Error al cambiar estado');
    } finally {
      setTogglingId(null);
    }
  };

  // ----------------------------------------------------------
  // Render helpers
  // ----------------------------------------------------------

  const showOptionsField =
    formData.question_type === 'select' || formData.question_type === 'multiselect';

  // ----------------------------------------------------------
  // Loading / auth guard
  // ----------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand_primary" />
      </div>
    );
  }

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------
  return (
    <MainLayout
      user={user}
      currentPage="context-questions"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl=""
    >
      <ResponsiveFunctionalPageHeader
        icon={<HelpCircle />}
        title="Preguntas de Contexto Transversal"
        subtitle={`${questions.length} pregunta${questions.length !== 1 ? 's' : ''}`}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top bar with Add button */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/admin/configuration')}
            className="inline-flex items-center text-sm text-brand_primary/60 hover:text-brand_primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a configuración
          </button>

          {!showForm && (
            <button
              onClick={openAddForm}
              className="inline-flex items-center px-4 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-brand_primary/90 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Pregunta
            </button>
          )}
        </div>

        {/* ====================================================== */}
        {/* Inline Form (Add / Edit)                               */}
        {/* ====================================================== */}
        {showForm && (
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-brand_primary">
                  {editingId ? 'Editar Pregunta' : 'Nueva Pregunta'}
                </h2>
                {editingIsStructural && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    <Shield className="w-3.5 h-3.5" />
                    Pregunta Estructural
                  </span>
                )}
              </div>
              <button
                onClick={closeForm}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Question Text */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Texto de la pregunta <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.question_text}
                  onChange={(e) => handleFormChange('question_text', e.target.value)}
                  rows={3}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_primary focus:border-brand_primary text-sm"
                  placeholder="Ej: ¿Cuántos estudiantes tiene el establecimiento?"
                />
              </div>

              {/* Question Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de pregunta <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.question_type}
                  onChange={(e) =>
                    handleFormChange('question_type', e.target.value as ContextQuestionType)
                  }
                  disabled={editingIsStructural}
                  className={`block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_primary focus:border-brand_primary text-sm bg-white ${
                    editingIsStructural ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''
                  }`}
                >
                  {(Object.keys(QUESTION_TYPE_LABELS) as ContextQuestionType[]).map((type) => (
                    <option key={type} value={type}>
                      {QUESTION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                {editingIsStructural && (
                  <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    El tipo no se puede cambiar en preguntas estructurales
                  </p>
                )}
              </div>

              {/* Display Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Orden de visualización
                </label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) =>
                    handleFormChange('display_order', parseInt(e.target.value, 10) || 0)
                  }
                  min={0}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_primary focus:border-brand_primary text-sm"
                />
              </div>

              {/* Options (conditional) */}
              {showOptionsField && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Opciones <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.options}
                    onChange={(e) => handleFormChange('options', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_primary focus:border-brand_primary text-sm"
                    placeholder="Opción 1, Opción 2, Opción 3"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Separa las opciones con comas
                  </p>
                </div>
              )}

              {/* Placeholder */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Placeholder
                </label>
                <input
                  type="text"
                  value={formData.placeholder}
                  onChange={(e) => handleFormChange('placeholder', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_primary focus:border-brand_primary text-sm"
                  placeholder="Texto de ejemplo para el campo"
                />
              </div>

              {/* Help Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Texto de ayuda
                </label>
                <input
                  type="text"
                  value={formData.help_text}
                  onChange={(e) => handleFormChange('help_text', e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_primary focus:border-brand_primary text-sm"
                  placeholder="Instrucciones adicionales para el usuario"
                />
              </div>

              {/* Is Required */}
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  id="is_required"
                  checked={formData.is_required}
                  onChange={(e) => handleFormChange('is_required', e.target.checked)}
                  className="h-4 w-4 text-brand_primary border-gray-300 rounded focus:ring-brand_primary"
                />
                <label htmlFor="is_required" className="text-sm text-gray-700">
                  Respuesta obligatoria
                </label>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={closeForm}
                disabled={saving}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center px-4 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-brand_primary/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {editingId ? 'Actualizar' : 'Crear Pregunta'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ====================================================== */}
        {/* Questions List                                         */}
        {/* ====================================================== */}
        {fetchLoading ? (
          <div className="flex justify-center items-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-brand_primary" />
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <HelpCircle className="mx-auto h-16 w-16 text-brand_primary/30" />
            <h3 className="mt-4 text-xl font-semibold text-brand_primary">
              No hay preguntas todavía
            </h3>
            <p className="mt-2 text-sm text-brand_primary/60">
              Agrega preguntas personalizadas para la sección de Contexto Transversal de las
              evaluaciones.
            </p>
            {!showForm && (
              <div className="mt-8">
                <button
                  onClick={openAddForm}
                  className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md shadow-sm text-white bg-brand_primary hover:bg-brand_primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Primera Pregunta
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Orden
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Pregunta
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Tipo
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Obligatoria
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Estado
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {questions.map((question) => (
                  <tr
                    key={question.id}
                    className={`hover:bg-gray-50 ${!question.is_active ? 'opacity-50' : ''}`}
                  >
                    {/* Order */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-gray-400">
                        <GripVertical className="w-4 h-4" />
                        <span className="text-sm font-medium text-gray-700">
                          {question.display_order}
                        </span>
                      </div>
                    </td>

                    {/* Question Text */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900 max-w-md">
                          {question.question_text}
                        </div>
                        {isStructuralQuestion(question) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap flex-shrink-0">
                            <Shield className="w-3 h-3" />
                            Estructural
                          </span>
                        )}
                      </div>
                      {question.help_text && (
                        <div className="text-xs text-brand_primary/60 mt-1">
                          {question.help_text}
                        </div>
                      )}
                      {question.options && question.options.length > 0 && (
                        <div className="text-xs text-gray-400 mt-1">
                          Opciones: {question.options.join(', ')}
                        </div>
                      )}
                    </td>

                    {/* Type Badge */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          QUESTION_TYPE_COLORS[question.question_type] ||
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {QUESTION_TYPE_LABELS[question.question_type] || question.question_type}
                      </span>
                    </td>

                    {/* Required Badge */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {question.is_required ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          Obligatoria
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                          Opcional
                        </span>
                      )}
                    </td>

                    {/* Active Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {question.is_active ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Activa
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                          Inactiva
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit */}
                        <button
                          onClick={() => openEditForm(question)}
                          className="p-2 text-brand_primary hover:bg-brand_primary/10 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Toggle Active — hidden for structural questions */}
                        {isStructuralQuestion(question) ? (
                          <span
                            className="p-2 text-amber-400 cursor-not-allowed"
                            title="Las preguntas estructurales no se pueden desactivar"
                          >
                            <Lock className="w-4 h-4" />
                          </span>
                        ) : (
                        <button
                          onClick={() => handleToggleActive(question)}
                          disabled={togglingId === question.id}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            question.is_active
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title={question.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {togglingId === question.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : question.is_active ? (
                            <ToggleRight className="w-5 h-5" />
                          ) : (
                            <ToggleLeft className="w-5 h-5" />
                          )}
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ContextQuestionsPage;
