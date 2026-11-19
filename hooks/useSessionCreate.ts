import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { getUserPrimaryRole } from '../utils/roleUtils';
import { RecurrencePattern, RecurrenceFrequency } from '../lib/types/consultor-sessions.types';
import { generateRecurrenceDates } from '../lib/utils/recurrence';
import { isFeatureEnabled, FeatureFlags } from '../lib/featureFlags';
import { formatSessionRangeForConsultant } from '../lib/utils/session-timezone';
import { parseISO } from 'date-fns';
import type {
  School,
  GrowthCommunity,
  Consultant,
  Facilitator,
  HourType,
  Contrato,
} from '../components/sessions/sessionCreateTypes';

/**
 * Everything the admin's «create session» form knows and does: its state, its data calls, its
 * access checks and redirects, its toasts and its handlers. Moved out of
 * `pages/admin/sessions/create.tsx` unchanged (redesign 6, release SA): the same hooks in the same
 * order, the same effects with the same dependency lists, each statement as it was. Each decision
 * the markup made from data or status has one named copy, worked out by `decide()` (called by the
 * page after its loading and refusal returns, where the markup worked them out before).
 */
export function useSessionCreate() {
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

  // Hour tracking state
  const [hourTypes, setHourTypes] = useState<HourType[]>([]);
  const [hourTypesLoading, setHourTypesLoading] = useState(false);
  const [hourTypesError, setHourTypesError] = useState(false);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [selectedHourTypeKey, setSelectedHourTypeKey] = useState('');
  const [selectedContratoId, setSelectedContratoId] = useState('');
  const [availableHours, setAvailableHours] = useState<number | null>(null);
  const [allocatedHours, setAllocatedHours] = useState<number | null>(null);
  const [availableHoursLoading, setAvailableHoursLoading] = useState(false);

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
    // Zoom plan §8: durable managed intent. Off by default — an unchecked box
    // creates exactly the session this form has always created.
    is_zoom_managed: false,
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
      fetchHourTypes();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (formData.school_id > 0) {
      fetchCommunities(formData.school_id);
      fetchConsultants(formData.school_id);
      fetchContratos(formData.school_id);
      setSelectedContratoId(''); // Reset contract selection when school changes
    } else {
      setCommunities([]);
      setConsultants([]);
      setConsultantsLoading(false);
      setConsultantsError(null);
      setContratos([]);
      setSelectedContratoId('');
    }
    // Clear selected facilitators when school changes — old facilitator IDs
    // may not exist in the new school's consultant list
    setFacilitators([]);
  }, [formData.school_id]);

  // Fetch available hours when both hour type and contract are selected
  useEffect(() => {
    if (selectedHourTypeKey && selectedContratoId) {
      fetchAvailableHours(selectedContratoId, selectedHourTypeKey);
    } else {
      setAvailableHours(null);
      setAllocatedHours(null);
    }
  }, [selectedHourTypeKey, selectedContratoId]);

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

  const fetchHourTypes = async () => {
    setHourTypesLoading(true);
    setHourTypesError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setHourTypesLoading(false);
        return;
      }

      const response = await fetch('/api/hour-types', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        setHourTypesError(true);
        setHourTypesLoading(false);
        return;
      }
      const result = await response.json();
      // Exclude online_learning (session-only hour types)
      const sessionTypes = (result.data?.hour_types || []).filter(
        (ht: HourType) => ht.key !== 'online_learning'
      );
      setHourTypes(sessionTypes);
    } catch {
      setHourTypesError(true);
    } finally {
      setHourTypesLoading(false);
    }
  };

  const fetchContratos = async (schoolId: number) => {
    try {
      const { data, error } = await supabase
        .from('contratos')
        .select('id, nombre, clientes!inner(school_id)')
        .eq('clientes.school_id', schoolId)
        .eq('is_active', true)
        .order('nombre');

      if (error) throw error;
      setContratos(
        (data || []).map((c: { id: string; nombre: string }) => ({
          id: c.id,
          nombre: c.nombre,
        }))
      );
    } catch {
      setContratos([]);
    }
  };

  const fetchAvailableHours = async (contratoId: string, hourTypeKey: string) => {
    setAvailableHoursLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_bucket_summary', { p_contrato_id: contratoId });

      if (error) throw error;

      const bucket = (data || []).find(
        (b: { hour_type_key: string; available_hours: number; allocated_hours: number }) => b.hour_type_key === hourTypeKey
      );
      setAvailableHours(bucket ? bucket.available_hours : null);
      setAllocatedHours(bucket ? bucket.allocated_hours : null);
    } catch {
      setAvailableHours(null);
      setAllocatedHours(null);
    } finally {
      setAvailableHoursLoading(false);
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
      const updates: Record<string, string | boolean> = { modality };

      // Clear conditional fields based on modality
      if (modality === 'presencial') {
        updates.meeting_link = '';
        updates.meeting_provider = '' as '';
        // The managed-meeting box is hidden for presencial; clearing it stops a
        // box checked while online from submitting invisibly.
        updates.is_zoom_managed = false;
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

    // A managed session has no link to enter — the platform creates the meeting
    // at approval — and POST /api/sessions exempts it from the same rule. The
    // client must agree, or the form blocks a request the API would accept.
    if (
      (formData.modality === 'online' || formData.modality === 'hibrida') &&
      !formData.is_zoom_managed &&
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
        is_zoom_managed: formData.is_zoom_managed,
        location: formData.location || null,
        facilitators,
        hour_type_key: selectedHourTypeKey || null,
        contrato_id: selectedContratoId || null,
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

  // The text of the browser's confirmation question; asked only once the checks pass.
  const scheduleConfirmText = (sessionCount: number) =>
    isRecurring
      ? `¿Está seguro de que desea programar estas ${sessionCount} sesiones? Se notificará a los participantes.`
      : '¿Está seguro de que desea programar esta sesión? Se notificará a los participantes.';

  const handleScheduleSession = async () => {
    if (!validateForm()) return;

    const sessionCount = isRecurring ? previewDates.length : 1;
    const confirmed = window.confirm(
      scheduleConfirmText(sessionCount)
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
        is_zoom_managed: formData.is_zoom_managed,
        location: formData.location || null,
        facilitators,
        hour_type_key: selectedHourTypeKey || null,
        contrato_id: selectedContratoId || null,
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

  // The handlers the markup wrote inline, named; the same bodies.
  const handleHourTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedHourTypeKey(e.target.value);
  const handleContratoChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSelectedContratoId(e.target.value);
  const retryConsultants = () => fetchConsultants(formData.school_id);
  const handleConsultantSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value) {
      handleAddFacilitator(e.target.value);
      e.target.value = '';
    }
  };
  const chooseSingleSession = () => setIsRecurring(false);
  const chooseRecurringSeries = () => setIsRecurring(true);
  const handleFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setRecurrenceFrequency(e.target.value as RecurrenceFrequency);
  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => setRecurrenceCount(parseInt(e.target.value, 10));
  const handleCustomDateInput = (index: number, e: React.ChangeEvent<HTMLInputElement>) =>
    handleCustomDateChange(index, e.target.value);
  const handleZoomManagedChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((prev) => ({ ...prev, is_zoom_managed: e.target.checked }));

  /**
   * One named copy of each decision the form's markup makes from data or status. Called by the
   * page after its loading and refusal returns, on every render that draws the form, as the
   * markup worked them out; the clock and the flag are read at that moment, before the frame is
   * drawn, as the page did. The pieces the markup worked out only inside a branch, per row, or
   * more than once are functions, asked by the view inside that branch, per row, and as often
   * (send-back 1 of SA: none of them is worked out where the markup did not reach it).
   */
  const decide = () => {
    // §14 master kill switch. Off ⇒ the box never appears and the form behaves
    // exactly as it did before this chunk. The modality gate is the enclosing
    // conditional below (managed intent is online/híbrida only, per POST /api/sessions).
    const zoomManagedAvailable = isFeatureEnabled(FeatureFlags.ZOOM_MEETINGS);

    // Null until a date and both times are set — see formatSessionRangeForConsultant.
    const spainTimePreview = formatSessionRangeForConsultant(
      formData.session_date,
      formData.start_time,
      formData.end_time
    );

    // The earliest date a date field accepts: the clock, read once for the main date field and once
    // per custom-date row, and the rows' reads only while the custom dates are drawn (inside the
    // series and custom-frequency branches), as the markup read them.
    const earliestDate = new Date().toISOString().split('T')[0];
    const customDateEarliest = isRecurring && recurrenceFrequency === 'custom'
      ? customDates.map(() => new Date().toISOString().split('T')[0])
      : [];

    return {
      zoomManagedAvailable,
      spainTimePreview,
      // School, community, contract
      communitySelectDisabled: formData.school_id === 0,
      showHourTypesLoading: hourTypesLoading,
      showHourTypesError: hourTypesError && !hourTypesLoading,
      showHourTypeSelects: hourTypes.length > 0,
      // Asked only inside the hour-types branch
      contratoSelectDisabled: () => formData.school_id === 0,
      showNoContratos: () => formData.school_id > 0 && contratos.length === 0,
      // The hours chip (a text when shown, as the markup's `&&` chain gave it)
      showHoursChip: selectedHourTypeKey && selectedContratoId,
      // Asked only while the chip is drawn and not loading
      hasHoursBucket: () => availableHours !== null,
      // Asked by the view only when a bucket was found, where the markup worked it out. The chip's
      // colours and words stay in the view (this folder is not one Tailwind reads).
      hoursLevel: (availableHours: number) => {
        const pctRemaining =
          allocatedHours && allocatedHours > 0
            ? (availableHours / allocatedHours) * 100
            : availableHours > 0 ? 100 : 0;
        const isExhausted = availableHours <= 0;
        const isWarning = !isExhausted && pctRemaining < 25;
        return { isExhausted, isWarning };
      },
      // Consultants and facilitators (the error is a text when shown)
      showConsultants: formData.school_id > 0,
      // Asked only inside the school branch
      showConsultantsLoading: () => consultantsLoading,
      showConsultantsError: () => consultantsError,
      showConsultantsEmpty: () => !consultantsLoading && !consultantsError && consultants.length === 0,
      showFacilitators: () => facilitators.length > 0,
      consultantOf: (facilitator: Facilitator) => consultants.find((c) => c.id === facilitator.user_id),
      facilitatorRoleLabel: (facilitator: Facilitator) =>
        facilitator.facilitator_role === 'consultor_externo'
          ? 'Externo'
          : 'Interno',
      showConsultantSelector: () => !consultantsLoading && !consultantsError,
      consultantSelectorDisabled: () => consultants.length === 0 && !consultantsError,
      selectableConsultants: () => consultants
        .filter((c) => !facilitators.find((f) => f.user_id === c.id)),
      earliestDate,
      customDateEarliest,
      // Recurrence (all but the first asked only inside the series branch; the removal per row)
      showRecurrence: isRecurring,
      showRecurrenceCount: () => recurrenceFrequency !== 'custom',
      showCustomDates: () => recurrenceFrequency === 'custom',
      canRemoveCustomDate: () => customDates.length > 1,
      showPreview: () => previewDates.length > 0,
      previewRow: (date: string) => {
        const parsedDate = parseISO(date);
        const dayOfWeek = parsedDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        return { parsedDate, isWeekend };
      },
      // Modality
      showMeetingFields: formData.modality === 'online' || formData.modality === 'hibrida',
      // Asked only inside the meeting branch (the help only inside the Zoom box's branch)
      showZoomManagedHelp: () => formData.is_zoom_managed,
      showManualMeetingFields: () => !formData.is_zoom_managed,
      showLocation: formData.modality === 'presencial' || formData.modality === 'hibrida',
      // Buttons (the series count asked once per button, as the markup did)
      showSeriesCountInButtons: () => isRecurring && previewDates.length > 0,
      draftDisabled: submitting,
      scheduleDisabled: submitting,
    };
  };

  return {
    // State the views read
    user,
    isAdmin,
    loading,
    schools,
    communities,
    consultants,
    consultantsLoading,
    consultantsError,
    hourTypes,
    hourTypesLoading,
    hourTypesError,
    contratos,
    selectedHourTypeKey,
    setSelectedHourTypeKey,
    selectedContratoId,
    setSelectedContratoId,
    availableHours,
    allocatedHours,
    availableHoursLoading,
    formData,
    setFormData,
    facilitators,
    submitting,
    isRecurring,
    setIsRecurring,
    recurrenceFrequency,
    setRecurrenceFrequency,
    recurrenceCount,
    setRecurrenceCount,
    customDates,
    previewDates,
    // Actions
    fetchConsultants,
    handleInputChange,
    handleModalityChange,
    handleAddFacilitator,
    handleRemoveFacilitator,
    handleToggleLead,
    handleToggleRole,
    handleAddCustomDate,
    handleRemoveCustomDate,
    handleCustomDateChange,
    handleSaveDraft,
    handleScheduleSession,
    handleLogout,
    // Step 3: the inline handlers, named
    retryConsultants,
    handleConsultantSelect,
    handleHourTypeChange,
    handleContratoChange,
    chooseSingleSession,
    chooseRecurringSeries,
    handleFrequencyChange,
    handleCountChange,
    handleCustomDateInput,
    handleZoomManagedChange,
    // The checks and the confirmation text, one copy each
    validateForm,
    scheduleConfirmText,
    // The decisions, worked out only when called (after the loading and refusal returns)
    decide,
  };
}

export type SessionCreate = ReturnType<typeof useSessionCreate>;
export type SessionCreateDecisions = ReturnType<SessionCreate['decide']>;
