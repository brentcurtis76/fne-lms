import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { Calendar, Save, Send } from 'lucide-react';

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
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [schools, setSchools] = useState<School[]>([]);
  const [communities, setCommunities] = useState<GrowthCommunity[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);

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
    }
  }, [formData.school_id]);

  useEffect(() => {
    if (formData.meeting_link && !formData.meeting_provider) {
      const provider = detectMeetingProvider(formData.meeting_link);
      setFormData((prev) => ({ ...prev, meeting_provider: provider }));
    }
  }, [formData.meeting_link]);

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
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, first_name, last_name, email)')
        .eq('school_id', schoolId)
        .eq('role_type', 'consultor')
        .eq('is_active', true);

      if (error) throw error;

      const consultantsData: Consultant[] = (data || [])
        .filter((item: any) => item.profiles)
        .map((item: any) => ({
          id: item.profiles.id,
          first_name: item.profiles.first_name || '',
          last_name: item.profiles.last_name || '',
          email: item.profiles.email || '',
        }));

      setConsultants(consultantsData);
    } catch (error) {
      console.error('Error fetching consultants:', error);
      toast.error('Error al cargar consultores');
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
      const updates: any = { modality };

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

    if (facilitators.length > 0) {
      const leadCount = facilitators.filter((f) => f.is_lead).length;
      if (leadCount !== 1) {
        toast.error('Debe haber exactamente un facilitador principal');
        return false;
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

      const payload = {
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
        facilitators: facilitators.length > 0 ? facilitators : undefined,
      };

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
      toast.success('Sesión guardada como borrador');
      router.push(`/admin/sessions/${result.data.session.id}`);
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error(error.message || 'Error al guardar borrador');
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleSession = async () => {
    if (!validateForm()) return;

    const confirmed = window.confirm(
      '¿Está seguro de que desea programar esta sesión? Se notificará a los participantes.'
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

      // Create session
      const payload = {
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
        facilitators: facilitators.length > 0 ? facilitators : undefined,
      };

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
      const sessionId = createResult.data.session.id;

      // Approve session
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
    } catch (error: any) {
      console.error('Error scheduling session:', error);
      toast.error(error.message || 'Error al programar sesión');
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

            {/* Row 6: Modality */}
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

            {/* Row 9: Facilitators */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Facilitadores asignados
              </label>

              {formData.school_id === 0 && (
                <p className="text-gray-500 text-sm mb-4">
                  Seleccione un colegio para asignar facilitadores
                </p>
              )}

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
                            Principal
                          </label>

                          <button
                            type="button"
                            onClick={() => handleRemoveFacilitator(facilitator.user_id)}
                            aria-label={`Quitar facilitador ${consultant.first_name} ${consultant.last_name}`}
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

              {formData.school_id > 0 && consultants.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddFacilitator(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent"
                  disabled={consultants.length === 0}
                >
                  <option value="">Agregar facilitador...</option>
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

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-4 pt-6 border-t">
              <button
                onClick={handleSaveDraft}
                disabled={submitting}
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save size={20} className="mr-2" />
                Guardar borrador
              </button>

              <button
                onClick={handleScheduleSession}
                disabled={submitting}
                className="inline-flex items-center justify-center px-4 py-2 bg-brand_primary text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                <Send size={20} className="mr-2" />
                Programar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SessionCreatePage;
