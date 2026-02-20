import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Copy, Check, Upload, Calendar, Lock } from 'lucide-react';
import { LicitacionDetail, LicitacionEstado, ESTADO_DISPLAY, TimelineDates } from '@/types/licitaciones';
import Step3Bases from '@/components/licitaciones/Step3Bases';
import Step4Propuestas from '@/components/licitaciones/Step4Propuestas';
import Step6Adjudicacion from '@/components/licitaciones/Step6Adjudicacion';

// Pure client-side helper — no server imports needed
function generatePublicacionText(
  licitacion: LicitacionDetail,
  schoolName: string,
  comuna: string
): string {
  const fechaLimite = licitacion.fecha_limite_solicitud_bases
    ? formatDateInline(licitacion.fecha_limite_solicitud_bases)
    : '[fecha pendiente]';

  return (
    `Con el objetivo de asesorar al equipo directivo y lideres del establecimiento ` +
    `en el cambio de cultura organizacional centrada en la innovacion educativa y ` +
    `en el Modelo Relacional es que el ${schoolName}, de la comuna de ${comuna}, ` +
    `llamamos a concurso publico para la contratacion de servicios ATE con el ` +
    `siguiente requerimiento: asesoria al equipo directivo para liderar a la escuela ` +
    `hacia una cultura colaborativa, de aprendizaje profundo, con metodologias de ` +
    `vanguardia y con la base en un enfoque en lo relacional.\n\n` +
    `Bases de la licitacion se pueden solicitar hasta el ${fechaLimite} al ` +
    `correo ${licitacion.email_licitacion}`
  );
}

function formatDateInline(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const day = parseInt(parts[2], 10);
  const month = months[parseInt(parts[1], 10) - 1] || '';
  return `${day} de ${month} de ${parts[0]}`;
}

// ============================================================
// STEPPER DEFINITION
// ============================================================

const STEPS = [
  { number: 1, label: 'Creacion' },
  { number: 2, label: 'Publicacion' },
  { number: 3, label: 'Bases' },
  { number: 4, label: 'Propuestas' },
  { number: 5, label: 'Evaluacion' },
  { number: 6, label: 'Adjudicacion' },
  { number: 7, label: 'Contrato' },
];

function getActiveStep(estado: LicitacionEstado): number {
  const mapping: Record<LicitacionEstado, number> = {
    borrador: 1,
    publicacion_pendiente: 2,
    recepcion_bases_pendiente: 3,
    propuestas_pendientes: 4,
    evaluacion_pendiente: 5,
    adjudicacion_pendiente: 6,
    contrato_pendiente: 7,
    contrato_generado: 7,
    adjudicada_externo: 7,
    cerrada: 7,
  };
  return mapping[estado] || 1;
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function Stepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, idx) => {
        const isCompleted = step.number < activeStep;
        const isActive = step.number === activeStep;
        const isLocked = step.number > 2 && step.number > activeStep;

        return (
          <div key={step.number} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors
                  ${isCompleted ? 'bg-green-500 text-white' : ''}
                  ${isActive ? 'bg-yellow-400 text-black' : ''}
                  ${!isCompleted && !isActive ? 'bg-gray-200 text-gray-500' : ''}
                `}
              >
                {isLocked ? <Lock size={12} /> : step.number}
              </div>
              <span className={`text-xs mt-1 ${isActive ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value ?? '-'}</span>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: LicitacionEstado }) {
  const info = ESTADO_DISPLAY[estado] || { label: estado, color: 'text-gray-700', bg: 'bg-gray-100' };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${info.bg} ${info.color}`}>
      {info.label}
    </span>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function LicitacionDetailPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { id } = router.query;

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEncargado, setIsEncargado] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [authReady, setAuthReady] = useState(false);

  const [licitacion, setLicitacion] = useState<LicitacionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Step 2 state
  const [publicacionText, setPublicacionText] = useState('');
  const [copied, setCopied] = useState(false);
  const [fechaPublicacion, setFechaPublicacion] = useState('');
  const [timeline, setTimeline] = useState<TimelineDates | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmingPublicacion, setConfirmingPublicacion] = useState(false);

  // Admin timeline edit
  const [editingTimeline, setEditingTimeline] = useState(false);
  const [editedDates, setEditedDates] = useState<Partial<TimelineDates>>({});
  const [savingDates, setSavingDates] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authReady && id && typeof id === 'string') {
      fetchLicitacion(id);
    }
  }, [authReady, id]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/my-roles');
      const rolesData = await response.json();
      const roles: string[] = (rolesData.roles || rolesData.data?.roles || []).map((r: { role_type: string }) => r.role_type);
      const adminAccess = roles.includes('admin');
      const encargadoAccess = roles.includes('encargado_licitacion');

      if (!adminAccess && !encargadoAccess) {
        toast.error('No tiene permisos para acceder a licitaciones');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(adminAccess);
      setIsEncargado(encargadoAccess);
      setUserRole(adminAccess ? 'admin' : 'encargado_licitacion');
      setAuthReady(true);
    } catch {
      router.push('/login');
    }
  };

  const fetchLicitacion = async (licitacionId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/licitaciones/${licitacionId}`);
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al cargar licitacion');
        router.push('/licitaciones');
        return;
      }

      const lic: LicitacionDetail = json.data.licitacion;
      setLicitacion(lic);

      // Pre-populate timeline if already confirmed
      if (lic.fecha_publicacion) {
        setFechaPublicacion(lic.fecha_publicacion);
      }

      // Generate publicacion text
      if (lic.school && lic.cliente) {
        const schoolName = lic.cliente.nombre_fantasia || lic.school.name;
        const comuna = lic.cliente.comuna || '';
        setPublicacionText(generatePublicacionText(lic, schoolName, comuna));
      }
    } catch {
      toast.error('Error al cargar licitacion');
      router.push('/licitaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(publicacionText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleFechaChange = useCallback(async (fecha: string) => {
    setFechaPublicacion(fecha);
    if (!fecha || !id) return;

    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/licitaciones/${id}/timeline?fecha_publicacion=${fecha}`);
      const json = await res.json();

      if (res.ok) {
        setTimeline(json.data.timeline);
        setEditedDates(json.data.timeline);
      }
    } catch {
      toast.error('Error al calcular cronograma');
    } finally {
      setTimelineLoading(false);
    }
  }, [id]);

  const handleUploadImage = async () => {
    if (!imageFile || !id) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('tipo', 'publicacion_imagen');
      formData.append('nombre', `Imagen publicacion - ${licitacion?.numero_licitacion}`);

      const res = await fetch(`/api/licitaciones/${id}/upload`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al subir imagen');
        return;
      }

      toast.success('Imagen subida exitosamente');
      setUploadedImageUrl(json.data.documento.storage_path);
      setImageFile(null);
    } catch {
      toast.error('Error al subir imagen');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleConfirmPublicacion = async () => {
    if (!fechaPublicacion || !id) {
      toast.error('Ingrese la fecha de publicacion');
      return;
    }

    setConfirmingPublicacion(true);
    try {
      const body = {
        fecha_publicacion: fechaPublicacion,
        publicacion_imagen_url: uploadedImageUrl || undefined,
      };

      const res = await fetch(`/api/licitaciones/${id}/publicacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al confirmar publicacion');
        return;
      }

      toast.success('Publicacion confirmada exitosamente');
      fetchLicitacion(id as string);
    } catch {
      toast.error('Error al confirmar publicacion');
    } finally {
      setConfirmingPublicacion(false);
    }
  };

  const handleSaveDates = async () => {
    if (!id || Object.keys(editedDates).length === 0) return;

    setSavingDates(true);
    try {
      const res = await fetch(`/api/licitaciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline: editedDates }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al guardar fechas');
        return;
      }

      toast.success('Fechas actualizadas correctamente');
      setEditingTimeline(false);
      fetchLicitacion(id as string);
    } catch {
      toast.error('Error al guardar fechas');
    } finally {
      setSavingDates(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const day = parseInt(parts[2], 10);
    const month = months[parseInt(parts[1], 10) - 1] || '';
    return `${day} de ${month} de ${parts[0]}`;
  };

  if (loading || !licitacion) {
    return (
      <MainLayout
        user={currentUser as Parameters<typeof MainLayout>[0]['user']}
        currentPage="licitaciones"
        pageTitle="Licitacion"
        isAdmin={isAdmin}
        userRole={userRole}
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
        </div>
      </MainLayout>
    );
  }

  const activeStep = getActiveStep(licitacion.estado);
  const step1Done = activeStep > 1;
  const step2Active = activeStep === 2;
  const step2Done = activeStep > 2;
  const isPublicacionPendiente = licitacion.estado === 'publicacion_pendiente';
  const canConfirmPublicacion = (isAdmin || isEncargado) && isPublicacionPendiente;

  // displayTimeline: use live calculated timeline if available, otherwise fall back to
  // persisted dates from the licitacion record. Typed as Partial<TimelineDates> since
  // the fallback values may be null/undefined (dates not yet set).
  const displayTimeline: Partial<TimelineDates> = timeline || {
    fecha_limite_solicitud_bases: licitacion.fecha_limite_solicitud_bases ?? undefined,
    fecha_limite_consultas: licitacion.fecha_limite_consultas ?? undefined,
    fecha_inicio_propuestas: licitacion.fecha_inicio_propuestas ?? undefined,
    fecha_limite_propuestas: licitacion.fecha_limite_propuestas ?? undefined,
    fecha_limite_evaluacion: licitacion.fecha_limite_evaluacion ?? undefined,
  };

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones"
      pageTitle={licitacion.numero_licitacion}
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push('/licitaciones')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-1" />
          Volver a Licitaciones
        </button>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">{licitacion.numero_licitacion}</p>
            <h1 className="text-2xl font-bold text-gray-900">{licitacion.nombre_licitacion}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {licitacion.school?.name} — {licitacion.year}
            </p>
          </div>
          <EstadoBadge estado={licitacion.estado} />
        </div>

        {/* Stepper */}
        <Stepper activeStep={activeStep} />

        {/* Step 1: Creation Summary */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center">
              <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center mr-2">1</span>
              Creacion de Licitacion
              {step1Done && <span className="ml-2 text-green-600 text-sm">(Completado)</span>}
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Informacion General</h3>
                <InfoRow label="Numero" value={licitacion.numero_licitacion} />
                <InfoRow label="Programa" value={licitacion.programa?.name || licitacion.programa_id} />
                <InfoRow label="Ano" value={licitacion.year} />
                <InfoRow label="Correo licitacion" value={licitacion.email_licitacion} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Presupuesto y Plazos</h3>
                <InfoRow label="Monto minimo" value={`${licitacion.monto_minimo} ${licitacion.tipo_moneda}`} />
                <InfoRow label="Monto maximo" value={`${licitacion.monto_maximo} ${licitacion.tipo_moneda}`} />
                <InfoRow label="Duracion minima" value={licitacion.duracion_minima} />
                <InfoRow label="Duracion maxima" value={licitacion.duracion_maxima} />
                <InfoRow label="Peso tecnico" value={`${licitacion.peso_evaluacion_tecnica}%`} />
                <InfoRow label="Peso economico" value={`${licitacion.peso_evaluacion_economica}%`} />
              </div>
              {licitacion.cliente && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Cliente</h3>
                  <InfoRow label="Nombre legal" value={licitacion.cliente.nombre_legal} />
                  <InfoRow label="RUT" value={licitacion.cliente.rut} />
                  <InfoRow label="Representante" value={licitacion.cliente.nombre_representante} />
                  <InfoRow label="Comuna" value={licitacion.cliente.comuna} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Publicacion */}
        <div className={`bg-white rounded-lg shadow mb-6 ${!step2Active && !step2Done ? 'opacity-60' : ''}`}>
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900 flex items-center">
              <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center mr-2 ${step2Done ? 'bg-green-500 text-white' : step2Active ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-500'}`}>
                2
              </span>
              Publicacion
              {step2Done && <span className="ml-2 text-green-600 text-sm">(Completado)</span>}
            </h2>
          </div>
          <div className="p-6">
            {step2Done ? (
              // Completed state — read-only
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Fecha de publicacion</p>
                  <p className="text-sm text-gray-900">{formatDate(licitacion.fecha_publicacion)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Cronograma calculado</p>
                  <div className="space-y-2">
                    <InfoRow label="Limite solicitud de bases" value={formatDate(licitacion.fecha_limite_solicitud_bases)} />
                    <InfoRow label="Limite consultas" value={formatDate(licitacion.fecha_limite_consultas)} />
                    <InfoRow label="Inicio propuestas" value={formatDate(licitacion.fecha_inicio_propuestas)} />
                    <InfoRow label="Limite propuestas" value={formatDate(licitacion.fecha_limite_propuestas)} />
                    <InfoRow label="Limite evaluacion" value={formatDate(licitacion.fecha_limite_evaluacion)} />
                  </div>
                </div>
                {isAdmin && (
                  <div>
                    <button
                      onClick={() => setEditingTimeline(!editingTimeline)}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      {editingTimeline ? 'Cancelar ajuste' : 'Ajustar fechas (admin)'}
                    </button>

                    {editingTimeline && (
                      <div className="mt-4 space-y-3">
                        {(Object.keys(editedDates) as Array<keyof TimelineDates>).map(key => (
                          <div key={key}>
                            <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                              {key.replace(/_/g, ' ')}
                            </label>
                            <input
                              type="date"
                              value={(editedDates[key] as string) || ''}
                              onChange={e => setEditedDates(d => ({ ...d, [key]: e.target.value }))}
                              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-yellow-400"
                            />
                          </div>
                        ))}
                        <button
                          onClick={handleSaveDates}
                          disabled={savingDates}
                          className="mt-2 px-4 py-2 bg-yellow-400 text-black rounded-lg text-sm hover:bg-yellow-500 disabled:opacity-60"
                        >
                          {savingDates ? 'Guardando...' : 'Guardar fechas ajustadas'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : step2Active ? (
              // Active state — editable
              <div className="space-y-6">
                {/* Publicacion text */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Texto de publicacion</p>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap mb-2">
                    {publicacionText || 'Seleccione una escuela con cliente vinculado para generar el texto.'}
                  </div>
                  <button
                    onClick={handleCopyText}
                    disabled={!publicacionText}
                    className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {copied ? <Check size={16} className="mr-2 text-green-600" aria-hidden="true" /> : <Copy size={16} className="mr-2" aria-hidden="true" />}
                    <span aria-live="polite">{copied ? 'Copiado!' : 'Copiar texto'}</span>
                  </button>
                </div>

                {/* Fecha publicacion */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de publicacion <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="date"
                      value={fechaPublicacion}
                      onChange={e => handleFechaChange(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400"
                    />
                    {timelineLoading && (
                      <span className="text-sm text-gray-500">Calculando cronograma...</span>
                    )}
                  </div>
                </div>

                {/* Timeline preview */}
                {displayTimeline.fecha_limite_solicitud_bases && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <Calendar size={14} className="mr-1" />
                      Cronograma calculado (dias habiles, sin feriados chilenos)
                    </p>
                    <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                      <InfoRow label="Limite solicitud de bases (+5 dias habiles)" value={formatDate(displayTimeline.fecha_limite_solicitud_bases)} />
                      <InfoRow label="Limite consultas (+3 dias habiles)" value={formatDate(displayTimeline.fecha_limite_consultas)} />
                      <InfoRow label="Inicio recepcion propuestas (+1 dia habil)" value={formatDate(displayTimeline.fecha_inicio_propuestas)} />
                      <InfoRow label="Limite propuestas (+5 dias habiles)" value={formatDate(displayTimeline.fecha_limite_propuestas)} />
                      <InfoRow label="Limite evaluacion (+3 dias habiles)" value={formatDate(displayTimeline.fecha_limite_evaluacion)} />
                    </div>
                    {isAdmin && (
                      <div>
                        <button
                          onClick={() => setEditingTimeline(!editingTimeline)}
                          className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          {editingTimeline ? 'Usar fechas calculadas' : 'Ajustar fechas manualmente'}
                        </button>

                        {editingTimeline && displayTimeline && (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(Object.keys(displayTimeline) as Array<keyof TimelineDates>).map(key => (
                              <div key={key}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  {key.replace(/_/g, ' ')}
                                </label>
                                <input
                                  type="date"
                                  value={(editedDates[key] as string) || (displayTimeline[key] as string) || ''}
                                  onChange={e => setEditedDates(d => ({ ...d, [key]: e.target.value }))}
                                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Image upload */}
                {canConfirmPublicacion && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Imagen de publicacion (opcional)
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={e => setImageFile(e.target.files?.[0] || null)}
                        className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                      />
                      {imageFile && (
                        <button
                          onClick={handleUploadImage}
                          disabled={uploadingImage}
                          className="flex items-center px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-60"
                        >
                          <Upload size={14} className="mr-1" />
                          {uploadingImage ? 'Subiendo...' : 'Subir'}
                        </button>
                      )}
                      {uploadedImageUrl && (
                        <span className="text-sm text-green-600 flex items-center">
                          <Check size={14} className="mr-1" />
                          Imagen subida
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Confirm button */}
                {canConfirmPublicacion && (
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={() => {
                        if (window.confirm('Esta acción no se puede deshacer. ¿Confirmar la publicación?')) {
                          handleConfirmPublicacion();
                        }
                      }}
                      disabled={confirmingPublicacion || !fechaPublicacion}
                      className="px-6 py-3 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {confirmingPublicacion ? 'Confirmando...' : 'Confirmar Publicacion'}
                    </button>
                    <p className="text-sm text-gray-500 mt-2">
                      Al confirmar, el estado cambiara a &ldquo;Recepcion de Bases&rdquo; y el cronograma quedara registrado.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              // Locked/future
              <p className="text-sm text-gray-500">
                Este paso estara disponible cuando la licitacion avance al estado &ldquo;Publicacion Pendiente&rdquo;.
              </p>
            )}
          </div>
        </div>

        {/* Step 3: Bases */}
        {(() => {
          const isStep3Done = activeStep > 3;
          const isStep3Active = activeStep === 3;
          const isStep3Locked = activeStep < 3;
          return (
            <div className={`bg-white rounded-lg shadow mb-6 ${isStep3Locked ? 'opacity-50' : ''}`}>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 flex items-center">
                  <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center mr-2 ${isStep3Done ? 'bg-green-500 text-white' : isStep3Active ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-400'}`}>
                    {isStep3Locked ? <Lock size={10} /> : 3}
                  </span>
                  Bases
                  {isStep3Done && <span className="ml-2 text-green-600 text-sm">(Completado)</span>}
                  {isStep3Locked && <span className="ml-2 text-xs text-gray-400">(Disponible cuando la publicacion este confirmada)</span>}
                </h2>
              </div>
              {!isStep3Locked && (
                <div className="p-6">
                  <Step3Bases
                    licitacion={licitacion}
                    isAdmin={isAdmin}
                    onAdvance={() => {}}
                    onRefresh={() => fetchLicitacion(id as string)}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {/* Step 4: Propuestas */}
        {(() => {
          const isStep4Done = activeStep > 4;
          const isStep4Active = activeStep === 4;
          const isStep4Locked = activeStep < 4;
          return (
            <div className={`bg-white rounded-lg shadow mb-6 ${isStep4Locked ? 'opacity-50' : ''}`}>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 flex items-center">
                  <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center mr-2 ${isStep4Done ? 'bg-green-500 text-white' : isStep4Active ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-400'}`}>
                    {isStep4Locked ? <Lock size={10} /> : 4}
                  </span>
                  Propuestas
                  {isStep4Done && <span className="ml-2 text-green-600 text-sm">(Completado)</span>}
                  {isStep4Locked && <span className="ml-2 text-xs text-gray-400">(Disponible en Paso 3)</span>}
                </h2>
              </div>
              {!isStep4Locked && (
                <div className="p-6">
                  <Step4Propuestas
                    licitacion={licitacion}
                    isAdmin={isAdmin}
                    onAdvance={() => {}}
                    onRefresh={() => fetchLicitacion(id as string)}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {/* Step 5: Evaluacion */}
        {(() => {
          const isStep5Done = activeStep > 5;
          const isStep5Active = activeStep === 5;
          const isStep5Locked = activeStep < 5;
          return (
            <div className={`bg-white rounded-lg shadow mb-6 ${isStep5Locked ? 'opacity-50' : ''}`}>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 flex items-center">
                  <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center mr-2 ${isStep5Done ? 'bg-green-500 text-white' : isStep5Active ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-400'}`}>
                    {isStep5Locked ? <Lock size={10} /> : 5}
                  </span>
                  Evaluacion
                  {isStep5Done && <span className="ml-2 text-green-600 text-sm">(Completado)</span>}
                  {isStep5Locked && <span className="ml-2 text-xs text-gray-400">(Disponible en Paso 4)</span>}
                </h2>
              </div>
              {!isStep5Locked && (
                <div className="p-6">
                  {isStep5Active ? (
                    <div>
                      <p className="text-sm text-gray-600 mb-4">
                        Complete la evaluacion de propuestas de cada ATE usando la pagina de evaluacion.
                      </p>
                      <button
                        onClick={() => router.push(`/licitaciones/${id}/evaluacion`)}
                        className="px-6 py-3 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors"
                      >
                        Ir a Evaluacion de Propuestas →
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      <p>La evaluacion fue completada. El Acta de Reunion fue firmada y subida.</p>
                      <button
                        onClick={() => router.push(`/licitaciones/${id}/evaluacion`)}
                        className="mt-2 text-blue-600 hover:text-blue-800 underline text-sm"
                      >
                        Ver resumen de evaluacion
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Step 6: Adjudicacion */}
        {(() => {
          const isStep6Done = activeStep > 6;
          const isStep6Active = activeStep === 6;
          const isStep6Locked = activeStep < 6;
          return (
            <div className={`bg-white rounded-lg shadow mb-6 ${isStep6Locked ? 'opacity-50' : ''}`}>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 flex items-center">
                  <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center mr-2 ${isStep6Done ? 'bg-green-500 text-white' : isStep6Active ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-400'}`}>
                    {isStep6Locked ? <Lock size={10} /> : 6}
                  </span>
                  Adjudicacion
                  {isStep6Done && <span className="ml-2 text-green-600 text-sm">(Completado)</span>}
                  {isStep6Locked && <span className="ml-2 text-xs text-gray-400">(Disponible en Paso 5)</span>}
                </h2>
              </div>
              {!isStep6Locked && (
                <div className="p-6">
                  <Step6Adjudicacion
                    licitacion={licitacion}
                    isAdmin={isAdmin}
                    onRefresh={() => fetchLicitacion(id as string)}
                  />
                </div>
              )}
            </div>
          );
        })()}

        {/* Step 7: Contrato — locked for future phase */}
        <div className="bg-white rounded-lg shadow mb-4 opacity-50">
          <div className="px-6 py-4">
            <h2 className="font-semibold text-gray-500 flex items-center text-sm">
              <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-400 text-xs flex items-center justify-center mr-2">
                <Lock size={10} />
              </span>
              Paso 7: Contrato
              <span className="ml-2 text-xs text-gray-400">(Disponible en una fase futura)</span>
            </h2>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
