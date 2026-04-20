import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Archive } from 'lucide-react';

interface School {
  id: number;
  name: string;
}

interface Programa {
  id: string;
  nombre: string;
}

interface RoleRecord {
  role_type: string;
  school_id?: number | null;
  school?: { id?: number; name?: string } | null;
}

interface FormData {
  school_id: string;
  programa_id: string;
  year: string;
  nombre_licitacion: string;
  numero_licitacion: string;
  notas: string;
}

const Field = ({
  label,
  name,
  required = false,
  errors,
  children,
  hint,
}: {
  label: string;
  name: string;
  required?: boolean;
  errors: Record<string, string>;
  children: React.ReactNode;
  hint?: string;
}) => (
  <div>
    <label htmlFor={`field-${name}`} className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint && !errors[name] && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    {errors[name] && <p className="mt-1 text-sm text-red-600">{errors[name]}</p>}
  </div>
);

const currentYear = new Date().getFullYear();
const YEAR_MIN = 2000;

const DEFAULT_FORM: FormData = {
  school_id: '',
  programa_id: '',
  year: String(currentYear),
  nombre_licitacion: '',
  numero_licitacion: '',
  notas: '',
};

export default function ImportarLicitacionPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEncargado, setIsEncargado] = useState(false);
  const [encargadoSchoolId, setEncargadoSchoolId] = useState<number | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [schools, setSchools] = useState<School[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);

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
      const roles: RoleRecord[] = rolesData.roles || rolesData.data?.roles || [];
      const roleTypes = roles.map(r => r.role_type);
      const adminAccess = roleTypes.includes('admin');
      const encargadoAccess = roleTypes.includes('encargado_licitacion');

      if (!adminAccess && !encargadoAccess) {
        toast.error('No tiene permisos para importar licitaciones');
        router.push('/licitaciones');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(adminAccess);
      setIsEncargado(encargadoAccess);
      setUserRole(adminAccess ? 'admin' : 'encargado_licitacion');

      if (!adminAccess && encargadoAccess) {
        const encargadoRole = roles.find(r => r.role_type === 'encargado_licitacion');
        const scopedSchoolId = encargadoRole?.school_id != null ? Number(encargadoRole.school_id) : null;
        if (scopedSchoolId == null) {
          toast.error('Su rol de encargado no tiene una escuela asignada');
          router.push('/licitaciones');
          return;
        }
        setEncargadoSchoolId(scopedSchoolId);
        const name = encargadoRole?.school?.name ?? '';
        setSchools([{ id: scopedSchoolId, name }]);
        setForm(f => ({ ...f, school_id: String(scopedSchoolId) }));
      }

      setAuthLoading(false);

      const tasks: Promise<void>[] = [fetchProgramas()];
      if (adminAccess) {
        tasks.push(fetchSchools());
      }
      await Promise.all(tasks);
    } catch {
      router.push('/login');
    }
  };

  const fetchSchools = async () => {
    const { data, error } = await supabase
      .from('schools')
      .select('id, name')
      .order('name');
    if (!error) setSchools(data || []);
  };

  const fetchProgramas = async () => {
    const { data, error } = await supabase
      .from('programas')
      .select('id, nombre')
      .order('nombre');
    if (!error) setProgramas(data || []);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.school_id) newErrors.school_id = 'Seleccione una escuela';
    if (!form.programa_id) newErrors.programa_id = 'Seleccione un programa';
    if (!form.year) newErrors.year = 'Seleccione un año';
    if (!form.nombre_licitacion.trim()) newErrors.nombre_licitacion = 'El nombre es requerido';

    const yearNum = parseInt(form.year, 10);
    if (isNaN(yearNum) || yearNum < YEAR_MIN || yearNum > currentYear) {
      newErrors.year = `El año debe estar entre ${YEAR_MIN} y ${currentYear}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const numero = form.numero_licitacion.trim();
      const body: Record<string, unknown> = {
        estado: 'cerrada',
        school_id: parseInt(form.school_id, 10),
        programa_id: form.programa_id,
        year: parseInt(form.year, 10),
        nombre_licitacion: form.nombre_licitacion.trim(),
        notas: form.notas.trim() || null,
      };
      if (numero) body.numero_licitacion = numero;

      const res = await fetch('/api/licitaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al importar licitacion historica');
        return;
      }

      toast.success('Licitacion historica registrada');
      router.push(`/licitaciones/${json.data.licitacion.id}`);
    } catch {
      toast.error('Error inesperado al importar licitacion');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent text-sm";
  const years = Array.from({ length: currentYear - YEAR_MIN + 1 }, (_, i) => currentYear - i);

  if (authLoading) {
    return (
      <MainLayout
        user={currentUser as Parameters<typeof MainLayout>[0]['user']}
        currentPage="licitaciones"
        pageTitle="Importar Licitacion Historica"
        isAdmin={false}
        userRole={userRole}
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones"
      pageTitle="Importar Licitacion Historica"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push('/licitaciones')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-1" />
          Volver a Licitaciones
        </button>

        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Archive size={24} />
          Importar Licitacion Historica
        </h1>
        <p className="text-gray-600 mb-8">
          Registre una licitacion ya cerrada para mantener el historial. Se creara en estado{' '}
          <span className="font-semibold">Cerrada</span> sin pasar por el flujo activo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Escuela" name="school_id" required errors={errors}>
                <select
                  id="field-school_id"
                  value={form.school_id}
                  onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                  className={inputClass}
                  disabled={isEncargado && !isAdmin && encargadoSchoolId != null}
                >
                  {isAdmin && <option value="">Seleccione una escuela...</option>}
                  {schools.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Año" name="year" required errors={errors}>
                <select
                  id="field-year"
                  value={form.year}
                  onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  className={inputClass}
                >
                  {years.map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Programa" name="programa_id" required errors={errors}>
              <select
                id="field-programa_id"
                value={form.programa_id}
                onChange={e => setForm(f => ({ ...f, programa_id: e.target.value }))}
                className={inputClass}
              >
                <option value="">Seleccione un programa...</option>
                {programas.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </Field>

            <Field label="Nombre de la Licitacion" name="nombre_licitacion" required errors={errors}>
              <input
                id="field-nombre_licitacion"
                type="text"
                value={form.nombre_licitacion}
                onChange={e => setForm(f => ({ ...f, nombre_licitacion: e.target.value }))}
                placeholder="Ej: Asesoria integral 2023"
                className={inputClass}
                maxLength={500}
              />
            </Field>

            <Field
              label="Numero de Licitacion"
              name="numero_licitacion"
              errors={errors}
              hint="Opcional. Si se deja en blanco, se genera automaticamente."
            >
              <input
                id="field-numero_licitacion"
                type="text"
                value={form.numero_licitacion}
                onChange={e => setForm(f => ({ ...f, numero_licitacion: e.target.value }))}
                placeholder="Ej: LIC-2023-001-001"
                className={inputClass}
                maxLength={100}
              />
            </Field>

            <Field label="Notas" name="notas" errors={errors}>
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
              {submitting ? 'Importando...' : 'Importar Licitacion'}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
