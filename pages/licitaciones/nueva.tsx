import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Building, Info } from 'lucide-react';

interface School {
  id: number;
  name: string;
  code?: string | null;
  cliente_id?: string | null;
}

interface Cliente {
  id: string;
  nombre_legal: string;
  nombre_fantasia: string;
  rut: string;
  direccion: string;
  comuna?: string | null;
  nombre_representante: string;
  rut_representante: string;
  fecha_escritura?: string | null;
  nombre_notario?: string | null;
}

interface Programa {
  id: string;
  name: string;
}

interface FormData {
  school_id: string;
  programa_id: string;
  nombre_licitacion: string;
  email_licitacion: string;
  monto_minimo: string;
  monto_maximo: string;
  tipo_moneda: 'UF' | 'CLP';
  duracion_minima: string;
  duracion_maxima: string;
  peso_evaluacion_tecnica: string;
  year: string;
  participantes_estimados: string;
  modalidad_preferida: '' | 'Presencial' | 'Virtual' | 'Hibrido';
  notas: string;
}

const currentYear = new Date().getFullYear();
const DEFAULT_FORM: FormData = {
  school_id: '',
  programa_id: '',
  nombre_licitacion: '',
  email_licitacion: '',
  monto_minimo: '',
  monto_maximo: '',
  tipo_moneda: 'UF',
  duracion_minima: '',
  duracion_maxima: '',
  peso_evaluacion_tecnica: '70',
  year: String(currentYear),
  participantes_estimados: '',
  modalidad_preferida: '',
  notas: '',
};

export default function NuevaLicitacionPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loadingCliente, setLoadingCliente] = useState(false);

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    checkAuth();
  }, []);

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

      if (!roles.includes('admin')) {
        toast.error('Solo administradores pueden crear licitaciones');
        router.push('/licitaciones');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(true);
      setUserRole('admin');
      setAuthLoading(false);

      await Promise.all([fetchSchools(), fetchProgramas()]);
    } catch {
      router.push('/login');
    }
  };

  const fetchSchools = async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('id, name, code, cliente_id')
      .order('name');
    if (!error) setSchools(data || []);
  };

  const fetchProgramas = async () => {
    const { data, error } = await supabase
      .from('programas')
      .select('id, name')
      .order('name');
    if (!error) setProgramas(data || []);
  };

  const handleSchoolChange = async (schoolId: string) => {
    setForm(f => ({ ...f, school_id: schoolId }));
    setSelectedCliente(null);

    if (!schoolId) return;

    const school = schools.find(s => String(s.id) === schoolId);
    if (!school?.cliente_id) {
      setErrors(e => ({ ...e, school_id: 'Esta escuela no tiene un cliente vinculado' }));
      return;
    }
    setErrors(e => { const { school_id: _, ...rest } = e; return rest; });

    setLoadingCliente(true);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre_legal, nombre_fantasia, rut, direccion, comuna, nombre_representante, rut_representante, fecha_escritura, nombre_notario')
        .eq('id', school.cliente_id)
        .single();

      if (error || !data) {
        toast.error('No se pudo cargar el cliente vinculado');
        return;
      }

      setSelectedCliente(data);

      // Check required fields
      if (!data.nombre_representante || !data.rut_representante || !data.fecha_escritura || !data.nombre_notario) {
        setErrors(e => ({
          ...e,
          school_id: 'El cliente no tiene toda la informacion legal requerida. Edite el cliente en la seccion de Escuelas.'
        }));
      }
    } finally {
      setLoadingCliente(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.school_id) newErrors.school_id = 'Seleccione una escuela';
    if (!form.programa_id) newErrors.programa_id = 'Seleccione un programa';
    if (!form.nombre_licitacion.trim()) newErrors.nombre_licitacion = 'El nombre es requerido';
    if (!form.email_licitacion.trim()) newErrors.email_licitacion = 'El correo es requerido';
    if (!form.monto_minimo) newErrors.monto_minimo = 'Ingrese el monto minimo';
    if (!form.monto_maximo) newErrors.monto_maximo = 'Ingrese el monto maximo';
    if (!form.duracion_minima.trim()) newErrors.duracion_minima = 'La duracion minima es requerida';
    if (!form.duracion_maxima.trim()) newErrors.duracion_maxima = 'La duracion maxima es requerida';

    const min = parseFloat(form.monto_minimo);
    const max = parseFloat(form.monto_maximo);
    if (!isNaN(min) && !isNaN(max) && max < min) {
      newErrors.monto_maximo = 'El monto maximo debe ser mayor o igual al minimo';
    }

    const peso = parseInt(form.peso_evaluacion_tecnica, 10);
    if (isNaN(peso) || peso < 1 || peso > 99) {
      newErrors.peso_evaluacion_tecnica = 'El peso tecnico debe ser entre 1 y 99';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const body = {
        school_id: parseInt(form.school_id, 10),
        programa_id: form.programa_id,
        nombre_licitacion: form.nombre_licitacion.trim(),
        email_licitacion: form.email_licitacion.trim(),
        monto_minimo: parseFloat(form.monto_minimo),
        monto_maximo: parseFloat(form.monto_maximo),
        tipo_moneda: form.tipo_moneda,
        duracion_minima: form.duracion_minima.trim(),
        duracion_maxima: form.duracion_maxima.trim(),
        peso_evaluacion_tecnica: parseInt(form.peso_evaluacion_tecnica, 10),
        year: parseInt(form.year, 10),
        participantes_estimados: form.participantes_estimados ? parseInt(form.participantes_estimados, 10) : null,
        modalidad_preferida: form.modalidad_preferida || null,
        notas: form.notas.trim() || null,
      };

      const res = await fetch('/api/licitaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al crear licitacion');
        return;
      }

      toast.success('Licitacion creada exitosamente');
      router.push(`/licitaciones/${json.data.licitacion.id}`);
    } catch {
      toast.error('Error inesperado al crear licitacion');
    } finally {
      setSubmitting(false);
    }
  };

  const Field = ({
    label,
    name,
    required = false,
    children,
  }: {
    label: string;
    name: string;
    required?: boolean;
    children: React.ReactNode;
  }) => (
    <div>
      <label htmlFor={`field-${name}`} className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {errors[name] && (
        <p className="mt-1 text-sm text-red-600">{errors[name]}</p>
      )}
    </div>
  );

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-sm";

  if (authLoading) {
    return (
      <MainLayout
        user={currentUser as Parameters<typeof MainLayout>[0]['user']}
        currentPage="licitaciones"
        pageTitle="Nueva Licitacion"
        isAdmin={false}
        userRole={userRole}
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
        </div>
      </MainLayout>
    );
  }

  const pesoTecnico = parseInt(form.peso_evaluacion_tecnica, 10) || 0;
  const pesoEconomico = 100 - pesoTecnico;

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones"
      pageTitle="Nueva Licitacion"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push('/licitaciones')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-1" />
          Volver a Licitaciones
        </button>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Nueva Licitacion</h1>
        <p className="text-gray-600 mb-8">Complete los campos para crear un nuevo proceso de licitacion</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Escuela */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Building size={20} className="mr-2" />
              Escuela
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Escuela" name="school_id" required>
                <select
                  id="field-school_id"
                  value={form.school_id}
                  onChange={e => handleSchoolChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Seleccione una escuela...</option>
                  {schools.map(s => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name} {s.code ? `(${s.code})` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Ano de Licitacion" name="year" required>
                <select
                  id="field-year"
                  value={form.year}
                  onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  className={inputClass}
                >
                  {Array.from({ length: 7 }, (_, i) => currentYear - 1 + i).map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Cliente preview */}
            {loadingCliente && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Cargando informacion del cliente...</p>
              </div>
            )}
            {selectedCliente && !loadingCliente && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center">
                  <Info size={14} className="mr-1" />
                  Cliente vinculado
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                  <div>
                    <span className="font-medium">Nombre legal:</span> {selectedCliente.nombre_legal}
                  </div>
                  <div>
                    <span className="font-medium">RUT:</span> {selectedCliente.rut}
                  </div>
                  <div>
                    <span className="font-medium">Representante:</span> {selectedCliente.nombre_representante}
                  </div>
                  <div>
                    <span className="font-medium">Comuna:</span> {selectedCliente.comuna || '-'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Programa */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Programa</h2>
            <Field label="Programa FNE" name="programa_id" required>
              <select
                id="field-programa_id"
                value={form.programa_id}
                onChange={e => setForm(f => ({ ...f, programa_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">Seleccione un programa...</option>
                {programas.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Section 3: Datos de la Licitacion */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Datos de la Licitacion</h2>
            <div className="space-y-4">
              <Field label="Nombre de la Licitacion" name="nombre_licitacion" required>
                <input
                  id="field-nombre_licitacion"
                  type="text"
                  value={form.nombre_licitacion}
                  onChange={e => setForm(f => ({ ...f, nombre_licitacion: e.target.value }))}
                  placeholder="Ej: Asesoria integral para transformacion educativa 2026"
                  className={inputClass}
                  maxLength={500}
                />
              </Field>

              <Field label="Correo electronico de contacto para la licitacion" name="email_licitacion" required>
                <input
                  id="field-email_licitacion"
                  type="email"
                  value={form.email_licitacion}
                  onChange={e => setForm(f => ({ ...f, email_licitacion: e.target.value }))}
                  placeholder="licitaciones@escuela.cl"
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Moneda" name="tipo_moneda" required>
                  <select
                    id="field-tipo_moneda"
                    value={form.tipo_moneda}
                    onChange={e => setForm(f => ({ ...f, tipo_moneda: e.target.value as 'UF' | 'CLP' }))}
                    className={inputClass}
                  >
                    <option value="UF">UF</option>
                    <option value="CLP">CLP</option>
                  </select>
                </Field>

                <Field label={`Monto minimo (${form.tipo_moneda})`} name="monto_minimo" required>
                  <input
                    id="field-monto_minimo"
                    type="number"
                    value={form.monto_minimo}
                    onChange={e => setForm(f => ({ ...f, monto_minimo: e.target.value }))}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className={inputClass}
                  />
                </Field>

                <Field label={`Monto maximo (${form.tipo_moneda})`} name="monto_maximo" required>
                  <input
                    id="field-monto_maximo"
                    type="number"
                    value={form.monto_maximo}
                    onChange={e => setForm(f => ({ ...f, monto_maximo: e.target.value }))}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Duracion minima del servicio" name="duracion_minima" required>
                  <input
                    id="field-duracion_minima"
                    type="text"
                    value={form.duracion_minima}
                    onChange={e => setForm(f => ({ ...f, duracion_minima: e.target.value }))}
                    placeholder="Ej: 6 meses"
                    className={inputClass}
                  />
                </Field>

                <Field label="Duracion maxima del servicio" name="duracion_maxima" required>
                  <input
                    id="field-duracion_maxima"
                    type="text"
                    value={form.duracion_maxima}
                    onChange={e => setForm(f => ({ ...f, duracion_maxima: e.target.value }))}
                    placeholder="Ej: 12 meses"
                    className={inputClass}
                  />
                </Field>
              </div>

              {/* Peso evaluacion */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Peso Evaluacion Tecnica <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <input
                      type="range"
                      min="1"
                      max="99"
                      value={form.peso_evaluacion_tecnica}
                      onChange={e => setForm(f => ({ ...f, peso_evaluacion_tecnica: e.target.value }))}
                      className="w-full"
                    />
                  </div>
                  <div className="flex space-x-4 text-sm">
                    <span className="text-blue-700 font-medium">Tecnica: {pesoTecnico}%</span>
                    <span className="text-green-700 font-medium">Economica: {pesoEconomico}%</span>
                  </div>
                </div>
                {errors.peso_evaluacion_tecnica && (
                  <p className="mt-1 text-sm text-red-600">{errors.peso_evaluacion_tecnica}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Campos Opcionales */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Campos Opcionales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Participantes estimados" name="participantes_estimados">
                <input
                  id="field-participantes_estimados"
                  type="number"
                  value={form.participantes_estimados}
                  onChange={e => setForm(f => ({ ...f, participantes_estimados: e.target.value }))}
                  placeholder="Ej: 30"
                  min="1"
                  className={inputClass}
                />
              </Field>

              <Field label="Modalidad preferida" name="modalidad_preferida">
                <select
                  id="field-modalidad_preferida"
                  value={form.modalidad_preferida}
                  onChange={e => setForm(f => ({ ...f, modalidad_preferida: e.target.value as FormData['modalidad_preferida'] }))}
                  className={inputClass}
                >
                  <option value="">Sin preferencia</option>
                  <option value="Presencial">Presencial</option>
                  <option value="Virtual">Virtual</option>
                  <option value="Hibrido">Hibrido</option>
                </select>
              </Field>

              <div className="col-span-2">
                <Field label="Notas adicionales" name="notas">
                  <textarea
                    id="field-notas"
                    value={form.notas}
                    onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                    placeholder="Observaciones o contexto adicional..."
                    rows={3}
                    maxLength={2000}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.push('/licitaciones')}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-yellow-400 text-black rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creando...' : 'Crear Licitacion'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
