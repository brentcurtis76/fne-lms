import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { Calendar, Save, Send, Plus, X, AlertTriangle } from 'lucide-react';
import { RecurrencePattern, RecurrenceFrequency } from '../../../lib/types/consultor-sessions.types';
import { generateRecurrenceDates } from '../../../lib/utils/recurrence';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface School {
  id: number;
  name: string;
}

interface GrowthCommunity {
  id: string;
  name: string;
  school_id: number;
}

interface Consultant {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Facilitator {
  user_id: string;
  facilitator_role: 'consultor_externo' | 'equipo_interno';
  is_lead: boolean;
}

const SessionCreatePage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [schools, setSchools] = useState<School[]>([]);
  const [communities, setCommunities] = useState<GrowthCommunity[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [consultantsLoading, setConsultantsLoading] = useState(false);
  const [consultantsError, setConsultantsError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    school_id: 0,
    growth_community_id: '',
    title: '',
    description: '',
    objectives: '',
    session_date: '',
    start_time: '09:00',
    end_time: '10:00',
    modality: 'presencial' as 'presencial' | 'online' | 'hibrida',
    meeting_link: '',
    meeting_provider: '' as '' | 'zoom' | 'google_meet' | 'teams' | 'otro',
    location: '',
  });

  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Recurrence state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly');
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [customDates, setCustomDates] = useState<string[]>(['']);
  const [previewDates, setPreviewDates] = useState<string[]>([]);

  useEffect(() => {
    initializeAuth();
  }, [router]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchSchools();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (formData.school_id > 0) {
      fetchCommunities(formData.school_id);
      fetchConsultants(formData.school_id);
    } else {
      setCommunities([]);
      setConsultants([]);
      setConsultantsLoading(false);
      setConsultantsError(null);
    }
    // Clear selected facilitators when school changes — old facilitator IDs
    // may not exist in the new school's consultant list
    setFacilitators([]);
  }, [formData.school_id]);

  useEffect(() => {
    if (formData.meeting_link && !formData.meeting_provider) {
      const provider = detectMeetingProvider(formData.meeting_link);
      setFormData((prev) => ({ ...prev, meeting_provider: provider }));
    }
  }, [formData.meeting_link]);

  // Update preview dates when recurrence parameters change
  useEffect(() => {
    if (!isRecurring || !formData.session_date) {
      setPreviewDates([]);
      return;
    }

    try {
      const pattern: RecurrencePattern = {
        frequency: recurrenceFrequency,
        count: recurrenceFrequency === 'custom' ? undefined : recurrenceCount,
        dates: recurrenceFrequency === 'custom' ? customDates.filter(d => d) : undefined,
      };

      const dates = generateRecurrenceDates(formData.session_date, pattern);
      setPreviewDates(dates);
    } catch (error) {
      setPreviewDates([]);
    }
  }, [isRecurring, formData.session_date, recurrenceFrequency, recurrenceCount, customDates]);

  const initializeAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const userRole = await getUserPrimaryRole(session.user.id);
      const isAdminUser = userRole === 'admin';
      setIsAdmin(isAdminUser);

      if (!isAdminUser) {
        router.push('/dashboard');
        return;
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchools = async () => {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setSchools(data || []);
    } catch (error) {
      console.error('Error fetching schools:', error);
      toast.error('Error al cargar colegios');
    }
  };

  const fetchCommunities = async (schoolId: number) => {
    try {
      const { data, error } = await supabase
        .from('growth_communities')
        .select('id, name, school_id')
        .eq('school_id', schoolId)
        .order('name');

      if (error) throw error;
      setCommunities(data || []);
    } catch (error) {
      console.error('Error fetching communities:', error);
      toast.error('Error al cargar comunidades');
    }
  };

  const fetchConsultants = async (schoolId: number) => {
    setConsultantsLoading(true);
    setConsultantsError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const errorMsg = 'Error de autenticación';
        setConsultantsError(errorMsg);
        toast.error(errorMsg);
        setConsultantsLoading(false);
        return;
      }

      const response = await fetch(`/api/admin/consultants?school_id=${schoolId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.error || 'Error al cargar consultores';
        setConsultantsError(errorMsg);
        toast.error(errorMsg);
        setConsultantsLoading(false);
        return;
      }

      const result = await response.json();
      setConsultants(result.data?.consultants || []);
      setConsultantsError(null);
    } catch (error) {
      console.error('Error fetching consultants:', error);
      const errorMsg = 'Error al cargar consultores';
      setConsultantsError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setConsultantsLoading(false);
    }
  };

  const detectMeetingProvider = (
    url: string
  ): 'zoom' | 'google_meet' | 'teams' | 'otro' => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('zoom.us')) return 'zoom';
    if (lowerUrl.includes('meet.google.com')) return 'google_meet';
    if (lowerUrl.includes('teams.microsoft.com')) return 'teams';
    return 'otro';
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    const parsedValue = name === 'school_id' ? (value ? parseInt(value, 10) : 0) : value;
    setFormData((prev) => ({ ...prev, [name]: parsedValue }));
  };

  const handleModalityChange = (modality: 'presencial' | 'online' | 'hibrida') => {
    setFormData((prev) => {
      const updates: Record<string, string> = { modality };

      // Clear conditional fields based on modality
      if (modality === 'presencial') {
        updates.meeting_link = '';
        updates.meeting_provider = '' as '';
      } else if (modality === 'online') {
        updates.location = '';
      }
      // hibrida keeps all fields

      return { ...prev, ...updates };
    });
  };

  const handleAddFacilitator = (consultantId: string) => {
    if (facilitators.find((f) => f.user_id === consultantId)) {
      toast.error('Este consultor ya está asignado');
      return;
    }

    setFacilitators((prev) => [
      ...prev,
      {
        user_id: consultantId,
        facilitator_role: 'consultor_externo',
        is_lead: prev.length === 0, // First one is lead by default
      },
    ]);
    toast.success('Facilitador agregado');
  };

  const handleRemoveFacilitator = (consultantId: string) => {
    setFacilitators((prev) => prev.filter((f) => f.user_id !== consultantId));
  };

  const handleToggleLead = (consultantId: string) => {
    setFacilitators((prev) =>
      prev.map((f) => ({
        ...f,
        is_lead: f.user_id === consultantId,
      }))
    );
  };

  const handleToggleRole = (consultantId: string) => {
    setFacilitators((prev) =>
      prev.map((f) =>
        f.user_id === consultantId
          ? {
              ...f,
              facilitator_role:
                f.facilitator_role === 'consultor_externo'
                  ? 'equipo_interno'
                  : 'consultor_externo',
            }
          : f
      )
    );
  };

  const handleAddCustomDate = () => {
    setCustomDates((prev) => [...prev, '']);
  };

  const handleRemoveCustomDate = (index: number) => {
    setCustomDates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCustomDateChange = (index: number, value: string) => {
    setCustomDates((prev) => prev.map((d, i) => (i === index ? value : d)));
  };

  const validateForm = (): boolean => {
    if (formData.school_id <= 0) {
      toast.error('Debe seleccionar un colegio');
      return false;
    }

    if (!formData.growth_community_id) {
      toast.error('Debe seleccionar una comunidad de crecimiento');
      return false;
    }

    if (!formData.title.trim()) {
      toast.error('Debe ingresar un título');
      return false;
    }

    if (!formData.session_date) {
      toast.error('Debe seleccionar una fecha');
      return false;
    }

    if (!formData.start_time || !formData.end_time) {
      toast.error('Debe ingresar hora de inicio y término');
      return false;
    }

    const [startHour, startMin] = formData.start_time.split(':').map(Number);
    const [endHour, endMin] = formData.end_time.split(':').map(Number);
    if (endHour * 60 + endMin <= startHour * 60 + startMin) {
      toast.error('La hora de término debe ser posterior a la hora de inicio');
      return false;
    }

    if (
      (formData.modality === 'online' || formData.modality === 'hibrida') &&
      !formData.meeting_link
    ) {
      toast.error('Debe ingresar un enlace de reunión para modalidad online o híbrida');
      return false;
    }

    if (
      (formData.modality === 'presencial' || formData.modality === 'hibrida') &&
      !formData.location
    ) {
      toast.error('Debe ingresar una ubicación para modalidad presencial o híbrida');
      return false;
    }

    // Facilitators are required
    if (facilitators.length === 0) {
      toast.error('Debe asignar al menos un facilitador a la sesión');
      return false;
    }

    // Exactly one lead facilitator
    const leadCount = facilitators.filter((f) => f.is_lead).length;
    if (leadCount !== 1) {
      toast.error('Debe haber exactamente un facilitador principal');
      return false;
    }

    // Validate recurrence if enabled
    if (isRecurring) {
      if (recurrenceFrequency === 'custom') {
        const validDates = customDates.filter(d => d);
        if (validDates.length < 2) {
          toast.error('Debe ingresar al menos 2 fechas personalizadas');
          return false;
        }
      } else {
        if (recurrenceCount < 2 || recurrenceCount > 52) {
          toast.error('El número de sesiones debe estar entre 2 y 52');
          return false;
        }
      }
    }

    return true;
  };

  const handleSaveDraft = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      const payload: Record<string, unknown> = {
        school_id: formData.school_id,
        growth_community_id: formData.growth_community_id,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        objectives: formData.objectives.trim() || null,
        session_date: formData.session_date,
        start_time: formData.start_time + ':00',
        end_time: formData.end_time + ':00',
        modality: formData.modality,
        meeting_link: formData.meeting_link || null,
        meeting_provider: formData.meeting_provider || null,
        location: formData.location || null,
        facilitators,
      };

      // Add recurrence if enabled
      if (isRecurring) {
        payload.recurrence = {
          frequency: recurrenceFrequency,
          count: recurrenceFrequency === 'custom' ? undefined : recurrenceCount,
          dates: recurrenceFrequency === 'custom' ? customDates.filter(d => d) : undefined,
        };
      }

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear sesión');
      }

      const result = await response.json();
      const sessionCount = result.data.sessions ? result.data.sessions.length : 1;
      toast.success(
        isRecurring
          ? `${sessionCount} sesiones guardadas como borrador`
          : 'Sesión guardada como borrador'
      );
      // For series, redirect to list page; for single session, redirect to detail page
      if (isRecurring) {
        router.push('/admin/sessions');
      } else {
        const sessionId = result.data.sessions ? result.data.sessions[0].id : result.data.session.id;
        router.push(`/admin/sessions/${sessionId}`);
      }
    } catch (error: unknown) {
      console.error('Error saving draft:', error);
      toast.error(error instanceof Error ? error.message : 'Error al guardar borrador');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleSession = async () => {
    if (!validateForm()) return;

    const sessionCount = isRecurring ? previewDates.length : 1;
    const confirmed = window.confirm(
      isRecurring
        ? `¿Está seguro de que desea programar estas ${sessionCount} sesiones? Se notificará a los participantes.`
        : '¿Está seguro de que desea programar esta sesión? Se notificará a los participantes.'
    );

    if (!confirmed) return;

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Error de autenticación');
        return;
      }

      // Create session(s)
      const payload: Record<string, unknown> = {
        school_id: formData.school_id,
        growth_community_id: formData.growth_community_id,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        objectives: formData.objectives.trim() || null,
        session_date: formData.session_date,
        start_time: formData.start_time + ':00',
        end_time: formData.end_time + ':00',
        modality: formData.modality,
        meeting_link: formData.meeting_link || null,
        meeting_provider: formData.meeting_provider || null,
        location: formData.location || null,
        facilitators,
      };

      // Add recurrence if enabled
      if (isRecurring) {
        payload.recurrence = {
          frequency: recurrenceFrequency,
          count: recurrenceFrequency === 'custom' ? undefined : recurrenceCount,
          dates: recurrenceFrequency === 'custom' ? customDates.filter(d => d) : undefined,
        };
      }

      const createResponse = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Error al crear sesión');
      }

      const createResult = await createResponse.json();

      // For recurring series, use bulk approve; for single session, use single approve
      if (isRecurring && createResult.data.recurrence_group_id) {
        const approveResponse = await fetch('/api/sessions/bulk-approve', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ recurrence_group_id: createResult.data.recurrence_group_id }),
        });

        if (!approveResponse.ok) {
          const errorData = await approveResponse.json();
          throw new Error(errorData.error || 'Error al aprobar sesiones');
        }

        toast.success(`${sessionCount} sesiones programadas exitosamente`);
        router.push('/admin/sessions');
      } else {
        const sessionId = createResult.data.sessions
          ? createResult.data.sessions[0].id
          : createResult.data.session.id;

        const approveResponse = await fetch(`/api/sessions/${sessionId}/approve`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!approveResponse.ok) {
          const errorData = await approveResponse.json();
          throw new Error(errorData.error || 'Error al aprobar sesión');
        }

        toast.success('Sesión programada exitosamente');
        router.push(`/admin/sessions/${sessionId}`);
      }
    } catch (error: unknown) {
      console.error('Error scheduling session:', error);
      toast.error(error instanceof Error ? error.message : 'Error al programar sesión');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#0a0a0a] mb-4">Acceso Denegado</h1>
          <p className="text-gray-600">No tiene permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="sessions"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Calendar />}
        title="Programar Sesión"
        subtitle="Crear una nueva sesión de consultoría para una comunidad de crecimiento"
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
          <p className="text-sm text-gray-600 mb-6">
            * Campos obligatorios
          </p>
          <div className="space-y-6">
            {/* Row 1: School + Community */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Colegio <span className="text-red-500">*</span>
                </label>
                <select
                  name="school_id"
                  value={formData.school_id}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                >
                  <option value={0}>Seleccione un colegio</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comunidad de Crecimiento <span className="text-red-500">*</span>
                </label>
                <select
                  name="growth_community_id"
                  value={formData.growth_community_id}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  disabled={formData.school_id === 0}
                  required
                >
                  <option value="">Seleccione una comunidad</option>
                  {communities.map((community) => (
                    <option key={community.id} value={community.id}>
                      {community.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2 (Moved from Row 9): Consultants */}
            {formData.school_id > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Consultor(es) asignados <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-600 mb-3">
                  Debe asignar al menos un consultor antes de crear la sesión.
                </p>

                {/* Loading state */}
                {consultantsLoading && (
                  <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg mb-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand_accent mr-2"></div>
                    <span className="text-sm text-gray-700">Cargando consultores...</span>
                  </div>
                )}

                {/* Error state */}
                {consultantsError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-red-800">Error al cargar consultores</h4>
                        <p className="text-sm text-red-700 mt-1">{consultantsError}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchConsultants(formData.school_id)}
                        className="ml-2 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!consultantsLoading && !consultantsError && consultants.length === 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                    <p className="text-sm text-yellow-800">
                      No hay consultores disponibles para este colegio. Verifique que existan usuarios con rol activo de consultor.
                    </p>
                  </div>
                )}

                {/* Current facilitators list */}
                {facilitators.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {facilitators.map((facilitator) => {
                      const consultant = consultants.find((c) => c.id === facilitator.user_id);
                      if (!consultant) return null;

                      return (
                        <div
                          key={facilitator.user_id}
                          className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">
                              {consultant.first_name} {consultant.last_name}
                            </div>
                            <div className="text-sm text-gray-500">{consultant.email}</div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => handleToggleRole(facilitator.user_id)}
                              className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300"
                            >
                              {facilitator.facilitator_role === 'consultor_externo'
                                ? 'Externo'
                                : 'Interno'}
                            </button>

                            <label className="flex items-center text-sm">
                              <input
                                type="checkbox"
                                checked={facilitator.is_lead}
                                onChange={() => handleToggleLead(facilitator.user_id)}
                                className="mr-1"
                              />
                              Consultor principal
                            </label>

                            <button
                              type="button"
                              onClick={() => handleRemoveFacilitator(facilitator.user_id)}
                              aria-label={`Quitar consultor ${consultant.first_name} ${consultant.last_name}`}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Consultant selector */}
                {!consultantsLoading && !consultantsError && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddFacilitator(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                    disabled={consultants.length === 0 && !consultantsError}
                  >
                    <option value="">Agregar consultor...</option>
                    {consultants
                      .filter((c) => !facilitators.find((f) => f.user_id === c.id))
                      .map((consultant) => (
                        <option key={consultant.id} value={consultant.id}>
                          {consultant.first_name} {consultant.last_name} ({consultant.email})
                        </option>
                      ))}
                  </select>
                )}
              </div>
            )}

            {/* Row 2: Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título de la Sesión <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                maxLength={200}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                placeholder="Ej: Sesión de planificación trimestral"
                required
              />
            </div>

            {/* Row 3: Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                placeholder="Descripción de la sesión..."
              />
            </div>

            {/* Row 4: Objectives */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Objetivos
              </label>
              <textarea
                name="objectives"
                value={formData.objectives}
                onChange={handleInputChange}
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                placeholder="Objetivos de la sesión..."
              />
            </div>

            {/* Row 5: Date + Times */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="session_date"
                  value={formData.session_date}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de inicio <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hora de término <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Row 6: Recurrence Toggle */}
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de sesión
              </legend>
              <div className="flex space-x-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={!isRecurring}
                    onChange={() => setIsRecurring(false)}
                    className="mr-2"
                  />
                  <span>Sesión única</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    checked={isRecurring}
                    onChange={() => setIsRecurring(true)}
                    className="mr-2"
                  />
                  <span>Serie recurrente</span>
                </label>
              </div>
            </fieldset>

            {/* Row 7: Recurrence Settings (conditional) */}
            {isRecurring && (
              <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-lg space-y-4">
                <h4 className="font-medium text-gray-900">Configuración de recurrencia</h4>

                {/* Frequency Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frecuencia
                  </label>
                  <select
                    value={recurrenceFrequency}
                    onChange={(e) => setRecurrenceFrequency(e.target.value as RecurrenceFrequency)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="custom">Fechas personalizadas</option>
                  </select>
                </div>

                {/* Count Input (for non-custom) */}
                {recurrenceFrequency !== 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de sesiones (2-52)
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={52}
                      value={recurrenceCount}
                      onChange={(e) => setRecurrenceCount(parseInt(e.target.value, 10))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                    />
                  </div>
                )}

                {/* Custom Dates Input */}
                {recurrenceFrequency === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fechas personalizadas
                    </label>
                    <div className="space-y-2">
                      {customDates.map((date, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => handleCustomDateChange(index, e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                          />
                          {customDates.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomDate(index)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                              aria-label="Eliminar fecha"
                            >
                              <X size={20} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomDate}
                      className="mt-2 inline-flex items-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                    >
                      <Plus size={16} className="mr-1" />
                      Agregar fecha
                    </button>
                  </div>
                )}

                {/* Preview Panel */}
                {previewDates.length > 0 && (
                  <div className="bg-white p-4 rounded border border-gray-200">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">
                      Vista previa ({previewDates.length} sesiones)
                    </h5>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {previewDates.map((date, index) => {
                        const parsedDate = parseISO(date);
                        const dayOfWeek = parsedDate.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        return (
                          <div
                            key={index}
                            className={`flex items-center justify-between text-sm p-2 rounded ${
                              isWeekend ? 'bg-yellow-50 text-yellow-900' : 'bg-gray-50'
                            }`}
                          >
                            <span className="font-medium">Sesión {index + 1}</span>
                            <span>
                              {format(parsedDate, 'EEEE, dd MMMM yyyy', { locale: es })}
                            </span>
                            {isWeekend && (
                              <span className="flex items-center text-yellow-600 text-xs">
                                <AlertTriangle size={14} className="mr-1" />
                                Fin de semana
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Row 8: Modality */}
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">
                Modalidad <span className="text-red-500">*</span>
              </legend>
              <div className="flex space-x-4">
                {(['presencial', 'online', 'hibrida'] as const).map((mod) => (
                  <label key={mod} className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="modality"
                      value={mod}
                      checked={formData.modality === mod}
                      onChange={() => handleModalityChange(mod)}
                      className="mr-2"
                    />
                    <span className="capitalize">{mod}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Row 7: Conditional - Meeting Link + Provider */}
            {(formData.modality === 'online' || formData.modality === 'hibrida') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enlace de reunión <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    name="meeting_link"
                    value={formData.meeting_link}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                    placeholder="https://zoom.us/j/123456789"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Proveedor de reunión
                  </label>
                  <select
                    name="meeting_provider"
                    value={formData.meeting_provider}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  >
                    <option value="">Auto-detectar</option>
                    <option value="zoom">Zoom</option>
                    <option value="google_meet">Google Meet</option>
                    <option value="teams">Microsoft Teams</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
            )}

            {/* Row 8: Conditional - Location */}
            {(formData.modality === 'presencial' || formData.modality === 'hibrida') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ubicación <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  placeholder="Ej: Sala de profesores"
                />
              </div>
            )}


            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-4 pt-6 border-t">
              <button
                onClick={handleSaveDraft}
                disabled={submitting}
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save size={20} className="mr-2" />
                {isRecurring && previewDates.length > 0
                  ? `Guardar serie como borrador (${previewDates.length} sesiones)`
                  : 'Guardar borrador'}
              </button>

              <button
                onClick={handleScheduleSession}
                disabled={submitting}
                className="inline-flex items-center justify-center px-4 py-2 bg-brand_primary text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send size={20} className="mr-2" />
                {isRecurring && previewDates.length > 0
                  ? `Programar serie (${previewDates.length} sesiones)`
                  : 'Programar sesión'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SessionCreatePage;
