import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { Building2, ArrowLeft, Save, Info, HelpCircle } from 'lucide-react';
import ChangeHistorySection from '@/components/school/ChangeHistorySection';
import { TRANSVERSAL_CONTEXT_FIELD_LABELS } from '@/lib/constants/transversal-context';
import type { GradeLevel, PeriodSystem, SaveTransversalContextRequest, ContextGeneralQuestion } from '@/types/assessment-builder';
import { GRADE_LEVEL_LABELS, GRADE_LEVEL_CATEGORIES } from '@/types/assessment-builder';

// Known widget types that have specialized rendering
const KNOWN_WIDGET_TYPES = new Set([
  'total_students',
  'grade_levels',
  'courses_per_level',
  'implementation_year',
  'programa_inicia',
  'period_system',
  'generic',
]);

const TransversalContextEdit: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');

  // All questions from DB (structural + generic)
  const [allQuestions, setAllQuestions] = useState<ContextGeneralQuestion[]>([]);

  // Form state for structural questions
  const [formData, setFormData] = useState<{
    total_students: number;
    grade_levels: GradeLevel[];
    courses_per_level: Record<string, number>;
    implementation_year_2026: 1 | 2 | 3 | 4 | 5;
    period_system: PeriodSystem;
    programa_inicia_completed: boolean;
    programa_inicia_hours?: 20 | 40 | 80;
    programa_inicia_year?: number;
  }>({
    total_students: 0,
    grade_levels: [],
    courses_per_level: {},
    implementation_year_2026: 1,
    period_system: 'semestral',
    programa_inicia_completed: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Custom responses for generic questions
  const [customResponses, setCustomResponses] = useState<Record<string, unknown>>({});

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Check permissions and get school_id
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (!roles || roles.length === 0) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      const isAdmin = roles.some(r => ['admin', 'consultor'].includes(r.role_type));
      const directivoRole = roles.find(r => r.role_type === 'equipo_directivo');

      if (!isAdmin && !directivoRole) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      setHasPermission(true);

      // Get school_id
      let effectiveSchoolId: number | null = null;
      if (directivoRole?.school_id) {
        effectiveSchoolId = directivoRole.school_id;
      } else if (isAdmin) {
        const querySchoolId = router.query.school_id;
        if (querySchoolId && typeof querySchoolId === 'string') {
          effectiveSchoolId = parseInt(querySchoolId);
        }
      }

      if (effectiveSchoolId) {
        setSchoolId(effectiveSchoolId);

        const { data: school } = await supabase
          .from('schools')
          .select('name')
          .eq('id', effectiveSchoolId)
          .single();

        if (school) {
          setSchoolName(school.name);
        }
      }
    };

    checkAuth();
  }, [supabase, router.query.school_id]);

  // Fetch existing context
  const fetchContext = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/school/transversal-context?school_id=${schoolId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.context) {
          setFormData({
            total_students: data.context.total_students || 0,
            grade_levels: data.context.grade_levels || [],
            courses_per_level: data.context.courses_per_level || {},
            implementation_year_2026: data.context.implementation_year_2026 || 1,
            period_system: data.context.period_system || 'semestral',
            programa_inicia_completed: data.context.programa_inicia_completed || false,
            programa_inicia_hours: data.context.programa_inicia_hours,
            programa_inicia_year: data.context.programa_inicia_year,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching context:', error);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId && hasPermission) {
      fetchContext();
    }
  }, [schoolId, hasPermission, fetchContext]);

  // Fetch all questions (structural + generic) and existing custom responses
  const fetchQuestions = useCallback(async () => {
    try {
      // Fetch active questions
      const qRes = await fetch('/api/school/transversal-context/questions');
      if (qRes.ok) {
        const qData = await qRes.json();
        setAllQuestions((qData.questions || []).filter((q: ContextGeneralQuestion) => q.is_active));
      }

      // Fetch existing custom responses for this school
      if (schoolId) {
        const rRes = await fetch(`/api/school/transversal-context/custom-responses?school_id=${schoolId}`);
        if (rRes.ok) {
          const rData = await rRes.json();
          const responseMap: Record<string, unknown> = {};
          (rData.responses || []).forEach((r: any) => {
            responseMap[r.question_id] = r.response;
          });
          setCustomResponses(responseMap);
        }
      }
    } catch (err) {
      console.error('Error fetching questions:', err);
      toast.error('Error al cargar las preguntas del cuestionario');
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId && hasPermission) {
      fetchQuestions();
    }
  }, [schoolId, hasPermission, fetchQuestions]);

  // Toggle grade level selection
  const toggleGradeLevel = (level: GradeLevel) => {
    setFormData(prev => {
      const isSelected = prev.grade_levels.includes(level);
      let newLevels: GradeLevel[];
      let newCoursesPerLevel = { ...prev.courses_per_level };

      if (isSelected) {
        newLevels = prev.grade_levels.filter(l => l !== level);
        delete newCoursesPerLevel[level];
      } else {
        newLevels = [...prev.grade_levels, level];
        newCoursesPerLevel[level] = 1; // Default to 1 course
      }

      return {
        ...prev,
        grade_levels: newLevels,
        courses_per_level: newCoursesPerLevel,
      };
    });
  };

  // Update courses per level
  const updateCoursesPerLevel = (level: GradeLevel, count: number) => {
    setFormData(prev => ({
      ...prev,
      courses_per_level: {
        ...prev.courses_per_level,
        [level]: Math.max(1, Math.min(10, count)), // Limit 1-10
      },
    }));
  };

  const updateCustomResponse = (questionId: string, value: unknown) => {
    setCustomResponses(prev => ({ ...prev, [questionId]: value }));
  };

  // Validate form — check structural required fields + generic required questions
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate structural questions based on what's present in allQuestions
    for (const q of allQuestions) {
      if (!q.is_required) continue;

      switch (q.widget_type) {
        case 'total_students':
          if (!formData.total_students || formData.total_students < 1) {
            newErrors.total_students = 'Ingrese el número total de estudiantes';
          }
          break;
        case 'grade_levels':
          if (formData.grade_levels.length === 0) {
            newErrors.grade_levels = 'Seleccione al menos un nivel';
          }
          break;
        case 'implementation_year':
          if (!formData.implementation_year_2026) {
            newErrors.implementation_year_2026 = 'Seleccione el año de implementación';
          }
          break;
        case 'period_system':
          if (!formData.period_system) {
            newErrors.period_system = 'Seleccione el sistema de períodos';
          }
          break;
        case 'generic': {
          const val = customResponses[q.id];
          if (val === undefined || val === null || val === '') {
            newErrors[`custom_${q.id}`] = `Este campo es obligatorio`;
          }
          break;
        }
        // courses_per_level, programa_inicia — no required validation needed
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !schoolId) return;

    setSaving(true);
    try {
      const response = await fetch('/api/school/transversal-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          ...formData,
        } as SaveTransversalContextRequest),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar');
      }

      // Show success message
      toast.success(data.message || 'Contexto guardado exitosamente');

      // Show warning if courses failed to generate
      if (data.warning) {
        toast.error(data.warning, { duration: 6000 });
      } else if (data.coursesGenerated !== undefined) {
        toast.success(`${data.coursesGenerated} cursos generados`, { duration: 3000 });
      }

      // Save custom responses before redirecting
      const genericQuestions = allQuestions.filter(q => q.widget_type === 'generic');
      const genericQuestionIds = new Set(genericQuestions.map(q => q.id));
      let customSaveOk = true;
      const filteredResponses = Object.entries(customResponses)
        .filter(([qId, v]) => genericQuestionIds.has(qId) && v !== undefined && v !== null && v !== '')
        .map(([question_id, response]) => ({ question_id, response }));

      if (filteredResponses.length > 0) {
        try {
          const customRes = await fetch('/api/school/transversal-context/custom-responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ school_id: schoolId, responses: filteredResponses }),
          });
          if (!customRes.ok) {
            customSaveOk = false;
            const errData = await customRes.json();
            console.error('Error saving custom responses:', errData);
            toast.error('Error al guardar respuestas personalizadas. Intente de nuevo.');
          }
        } catch (err) {
          customSaveOk = false;
          console.error('Error saving custom responses:', err);
          toast.error('Error al guardar respuestas personalizadas. Intente de nuevo.');
        }
      }

      // Only redirect if both saves succeeded
      if (customSaveOk) {
        router.push(`/school/transversal-context?school_id=${schoolId}`);
      }
    } catch (error: any) {
      console.error('Error saving context:', error);
      toast.error(error.message || 'Error al guardar el contexto');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ====================================================================
  // Widget renderers — each returns JSX for one question card
  // ====================================================================

  const renderTotalStudents = (q: ContextGeneralQuestion) => (
    <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
      <h3 className="text-lg font-semibold text-brand_blue mb-2">
        {q.question_text}
      </h3>
      {q.help_text && (
        <p className="text-sm text-gray-500 mb-4">{q.help_text}</p>
      )}
      <input
        type="number"
        value={formData.total_students || ''}
        onChange={(e) => setFormData(prev => ({
          ...prev,
          total_students: parseInt(e.target.value) || 0
        }))}
        min={1}
        className={`w-full max-w-xs px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
          errors.total_students ? 'border-red-500' : 'border-gray-300'
        }`}
        placeholder="Ej: 500"
      />
      {errors.total_students && (
        <p className="mt-2 text-sm text-red-500">{errors.total_students}</p>
      )}
    </div>
  );

  const renderGradeLevels = (q: ContextGeneralQuestion) => (
    <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
      <h3 className="text-lg font-semibold text-brand_blue mb-2">
        {q.question_text}
      </h3>
      {q.help_text && (
        <p className="text-sm text-gray-500 mb-4">{q.help_text}</p>
      )}

      {/* Preescolar */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Preescolar</h4>
        <div className="flex flex-wrap gap-2">
          {GRADE_LEVEL_CATEGORIES.preescolar.map(level => (
            <button
              key={level}
              type="button"
              onClick={() => toggleGradeLevel(level)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                formData.grade_levels.includes(level)
                  ? 'bg-brand_blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {GRADE_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </div>

      {/* Basica */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Educación Básica</h4>
        <div className="flex flex-wrap gap-2">
          {GRADE_LEVEL_CATEGORIES.basica.map(level => (
            <button
              key={level}
              type="button"
              onClick={() => toggleGradeLevel(level)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                formData.grade_levels.includes(level)
                  ? 'bg-brand_blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {GRADE_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </div>

      {/* Media */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Educación Media</h4>
        <div className="flex flex-wrap gap-2">
          {GRADE_LEVEL_CATEGORIES.media.map(level => (
            <button
              key={level}
              type="button"
              onClick={() => toggleGradeLevel(level)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                formData.grade_levels.includes(level)
                  ? 'bg-brand_blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {GRADE_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </div>

      {errors.grade_levels && (
        <p className="mt-2 text-sm text-red-500">{errors.grade_levels}</p>
      )}
    </div>
  );

  const renderCoursesPerLevel = (q: ContextGeneralQuestion) => {
    if (formData.grade_levels.length === 0) return null;
    return (
      <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
        <h3 className="text-lg font-semibold text-brand_blue mb-2">
          {q.question_text}
        </h3>
        {q.help_text && (
          <p className="text-sm text-gray-500 mb-4">{q.help_text}</p>
        )}

        <div className="space-y-3">
          {formData.grade_levels
            .sort((a, b) => {
              const order = [...GRADE_LEVEL_CATEGORIES.preescolar, ...GRADE_LEVEL_CATEGORIES.basica, ...GRADE_LEVEL_CATEGORIES.media];
              return order.indexOf(a) - order.indexOf(b);
            })
            .map(level => (
              <div key={level} className="flex items-center gap-4">
                <span className="w-32 text-sm font-medium text-gray-700">
                  {GRADE_LEVEL_LABELS[level]}
                </span>
                <input
                  type="number"
                  value={formData.courses_per_level[level] || 1}
                  onChange={(e) => updateCoursesPerLevel(level, parseInt(e.target.value) || 1)}
                  min={1}
                  max={10}
                  className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-brand_blue"
                />
                <span className="text-sm text-gray-500">
                  {(formData.courses_per_level[level] || 1) === 1 ? 'curso' : 'cursos'}
                </span>
              </div>
            ))}
        </div>
      </div>
    );
  };

  const renderImplementationYear = (q: ContextGeneralQuestion) => (
    <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
      <h3 className="text-lg font-semibold text-brand_blue mb-2">
        {q.question_text}
      </h3>
      {q.help_text && (
        <p className="text-sm text-gray-500 mb-4">{q.help_text}</p>
      )}

      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4, 5].map(year => (
          <button
            key={year}
            type="button"
            onClick={() => setFormData(prev => ({
              ...prev,
              implementation_year_2026: year as 1 | 2 | 3 | 4 | 5
            }))}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              formData.implementation_year_2026 === year
                ? 'bg-brand_blue text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Año {year}
          </button>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-700">
          El año de implementación determina el nivel de madurez esperado para las evaluaciones.
          Año 1 = Incipiente, Año 5 = Consolidado.
        </p>
      </div>

      {errors.implementation_year_2026 && (
        <p className="mt-2 text-sm text-red-500">{errors.implementation_year_2026}</p>
      )}
    </div>
  );

  const renderProgramaInicia = (q: ContextGeneralQuestion) => (
    <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
      <h3 className="text-lg font-semibold text-brand_blue mb-2">
        {q.question_text}
      </h3>
      {q.help_text && (
        <p className="text-sm text-gray-500 mb-4">{q.help_text}</p>
      )}

      <div className="flex gap-3 mb-4">
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, programa_inicia_completed: true }))}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            formData.programa_inicia_completed
              ? 'bg-brand_blue text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => setFormData(prev => ({
            ...prev,
            programa_inicia_completed: false,
            programa_inicia_hours: undefined,
            programa_inicia_year: undefined,
          }))}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !formData.programa_inicia_completed
              ? 'bg-brand_blue text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          No
        </button>
      </div>

      {formData.programa_inicia_completed && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Horas completadas
            </label>
            <div className="flex gap-3">
              {([20, 40, 80] as const).map(hours => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, programa_inicia_hours: hours }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.programa_inicia_hours === hours
                      ? 'bg-brand_blue text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {hours} horas
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Año en que se completó
            </label>
            <input
              type="number"
              value={formData.programa_inicia_year || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                programa_inicia_year: parseInt(e.target.value) || undefined
              }))}
              min={2015}
              max={2030}
              placeholder="Ej: 2024"
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue"
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderPeriodSystem = (q: ContextGeneralQuestion) => (
    <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
      <h3 className="text-lg font-semibold text-brand_blue mb-2">
        {q.question_text}
      </h3>
      {q.help_text && (
        <p className="text-sm text-gray-500 mb-4">{q.help_text}</p>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, period_system: 'semestral' }))}
          className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            formData.period_system === 'semestral'
              ? 'bg-brand_blue text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Semestral
          <span className="block text-xs opacity-80 mt-1">2 períodos por año</span>
        </button>
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, period_system: 'trimestral' }))}
          className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            formData.period_system === 'trimestral'
              ? 'bg-brand_blue text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Trimestral
          <span className="block text-xs opacity-80 mt-1">3 períodos por año</span>
        </button>
      </div>

      {errors.period_system && (
        <p className="mt-2 text-sm text-red-500">{errors.period_system}</p>
      )}
    </div>
  );

  const renderGenericQuestion = (q: ContextGeneralQuestion) => {
    const errorKey = `custom_${q.id}`;
    return (
      <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
        <label className="block text-lg font-semibold text-brand_blue mb-1">
          {q.question_text}
          {q.is_required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {q.help_text && (
          <p className="text-sm text-gray-500 mb-4 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            {q.help_text}
          </p>
        )}

        {q.question_type === 'text' && (
          <input
            type="text"
            value={(customResponses[q.id] as string) || ''}
            onChange={(e) => updateCustomResponse(q.id, e.target.value)}
            placeholder={q.placeholder || ''}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
              errors[errorKey] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        )}

        {q.question_type === 'textarea' && (
          <textarea
            value={(customResponses[q.id] as string) || ''}
            onChange={(e) => updateCustomResponse(q.id, e.target.value)}
            placeholder={q.placeholder || ''}
            rows={3}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
              errors[errorKey] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        )}

        {q.question_type === 'number' && (
          <input
            type="number"
            value={(customResponses[q.id] as number) ?? ''}
            onChange={(e) => updateCustomResponse(q.id, e.target.value ? Number(e.target.value) : '')}
            placeholder={q.placeholder || ''}
            className={`w-full max-w-xs px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
              errors[errorKey] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        )}

        {q.question_type === 'scale' && (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => updateCustomResponse(q.id, n)}
                className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                  customResponses[q.id] === n
                    ? 'bg-brand_blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {q.question_type === 'boolean' && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => updateCustomResponse(q.id, true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                customResponses[q.id] === true
                  ? 'bg-brand_blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => updateCustomResponse(q.id, false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                customResponses[q.id] === false
                  ? 'bg-brand_blue text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              No
            </button>
          </div>
        )}

        {q.question_type === 'select' && (
          <select
            value={(customResponses[q.id] as string) || ''}
            onChange={(e) => updateCustomResponse(q.id, e.target.value)}
            className={`w-full max-w-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
              errors[errorKey] ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">{q.placeholder || '-- Seleccionar --'}</option>
            {(q.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}

        {q.question_type === 'multiselect' && (
          <div className="flex flex-wrap gap-2">
            {(q.options || []).map(opt => {
              const selected = Array.isArray(customResponses[q.id])
                ? (customResponses[q.id] as string[]).includes(opt)
                : false;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const current = Array.isArray(customResponses[q.id])
                      ? (customResponses[q.id] as string[])
                      : [];
                    updateCustomResponse(
                      q.id,
                      selected ? current.filter(v => v !== opt) : [...current, opt]
                    );
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-brand_blue text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {errors[errorKey] && (
          <p className="mt-2 text-sm text-red-500">{errors[errorKey]}</p>
        )}
      </div>
    );
  };

  // Main render dispatcher — maps widget_type to renderer
  const renderQuestion = (q: ContextGeneralQuestion) => {
    const wt = q.widget_type || 'generic';

    // Skip unknown/unimplemented widget types (e.g. deferred P6, P8, P9)
    if (!KNOWN_WIDGET_TYPES.has(wt)) return null;

    switch (wt) {
      case 'total_students':
        return renderTotalStudents(q);
      case 'grade_levels':
        return renderGradeLevels(q);
      case 'courses_per_level':
        return renderCoursesPerLevel(q);
      case 'implementation_year':
        return renderImplementationYear(q);
      case 'programa_inicia':
        return renderProgramaInicia(q);
      case 'period_system':
        return renderPeriodSystem(q);
      case 'generic':
        return renderGenericQuestion(q);
      default:
        return null;
    }
  };

  // Loading state
  if (loading || hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false || !schoolId) {
    return (
      <MainLayout
        user={user}
        currentPage="transversal-context"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Acceso Denegado</h1>
            <p className="text-gray-700 mb-6">
              No tiene permiso para editar el contexto transversal.
            </p>
            <Link href="/dashboard" legacyBehavior>
              <a className="px-6 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
                Ir al Panel
              </a>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="transversal-context"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={hasPermission}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Building2 />}
        title="Cuestionario Transversal"
        subtitle={schoolName || 'Mi Escuela'}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link
          href={`/school/transversal-context?school_id=${schoolId}`}
          legacyBehavior
        >
          <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver al dashboard
          </a>
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Render all questions in display_order from DB */}
          {allQuestions.map(q => renderQuestion(q))}

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link
              href={`/school/transversal-context?school_id=${schoolId}`}
              legacyBehavior
            >
              <a className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                Cancelar
              </a>
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-6 py-2 bg-brand_blue text-white rounded-lg font-medium hover:bg-brand_blue/90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2">&#9696;</span>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </>
              )}
            </button>
          </div>
        </form>

        {/* Change History */}
        <ChangeHistorySection
          schoolId={schoolId}
          feature="transversal_context"
          fieldLabels={TRANSVERSAL_CONTEXT_FIELD_LABELS}
        />
        <ChangeHistorySection
          schoolId={schoolId}
          feature="context_responses"
          fieldLabels={Object.fromEntries(
            allQuestions
              .filter(q => q.widget_type === 'generic')
              .map(q => [q.id, q.question_text])
          )}
        />
      </div>
    </MainLayout>
  );
};

export default TransversalContextEdit;
