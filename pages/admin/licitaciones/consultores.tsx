/**
 * Admin — Gestión de Consultores FNE
 * /pages/admin/licitaciones/consultores.tsx
 *
 * Admin-only CRUD page for the consultant library used in proposal generation.
 * Features: list table, add/edit dialog, soft delete with confirmation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Plus, Pencil, Trash2, ArrowLeft, User, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type {
  PropuestaConsultor,
  ConsultorCategoria,
  FormacionAcademica,
  ExperienciaProfesional,
} from '@/lib/propuestas/types';

// ============================================================
// CONSTANTS
// ============================================================

const CATEGORIA_LABELS: Record<ConsultorCategoria, string> = {
  comite_internacional: 'Comité Internacional',
  equipo_fne: 'Equipo FNE',
  asesor_internacional: 'Asesor Internacional',
};

const CATEGORIA_COLORS: Record<ConsultorCategoria, string> = {
  comite_internacional: 'bg-purple-100 text-purple-800',
  equipo_fne: 'bg-blue-100 text-blue-800',
  asesor_internacional: 'bg-green-100 text-green-800',
};

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none w-full';
const BTN_PRIMARY =
  'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';

// ============================================================
// FORM STATE
// ============================================================

interface FormState {
  nombre: string;
  titulo: string;
  categoria: ConsultorCategoria;
  perfil_profesional: string;
  especialidades: string[];
  especialidadInput: string;
  formacion_academica: FormacionAcademica[];
  experiencia_profesional: ExperienciaProfesional[];
  foto_path: string | null;
  cv_pdf_path: string | null;
  orden: string;
}

const EMPTY_FORM: FormState = {
  nombre: '',
  titulo: '',
  categoria: 'equipo_fne',
  perfil_profesional: '',
  especialidades: [],
  especialidadInput: '',
  formacion_academica: [],
  experiencia_profesional: [],
  foto_path: null,
  cv_pdf_path: null,
  orden: '0',
};

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function ConsultoresAdminPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [authReady, setAuthReady] = useState(false);

  const [consultores, setConsultores] = useState<PropuestaConsultor[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PropuestaConsultor | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // File upload state
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingCv, setUploadingCv] = useState(false);

  // ============================================================
  // Auth
  // ============================================================

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authReady) loadConsultores();
  }, [authReady]);

  const checkAuth = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/my-roles');
      const rolesData = await response.json();
      const roles: string[] = (rolesData.roles || rolesData.data?.roles || []).map(
        (r: { role_type: string }) => r.role_type
      );

      if (!roles.includes('admin')) {
        toast.error('Solo administradores pueden gestionar consultores');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(true);
      setUserRole('admin');
      setAuthReady(true);
    } catch {
      router.push('/login');
    }
  };

  // ============================================================
  // Data
  // ============================================================

  const loadConsultores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/propuestas/consultores');
      const json = await res.json();
      if (res.ok) {
        setConsultores(json.data?.consultores || []);
      } else {
        toast.error(json.error || 'Error al cargar consultores');
      }
    } catch {
      toast.error('Error al cargar consultores');
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================
  // Dialog helpers
  // ============================================================

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (c: PropuestaConsultor) => {
    setEditing(c);
    setForm({
      nombre: c.nombre,
      titulo: c.titulo,
      categoria: c.categoria,
      perfil_profesional: c.perfil_profesional || '',
      especialidades: c.especialidades || [],
      especialidadInput: '',
      formacion_academica: c.formacion_academica || [],
      experiencia_profesional: c.experiencia_profesional || [],
      foto_path: c.foto_path,
      cv_pdf_path: c.cv_pdf_path,
      orden: String(c.orden),
    });
    setDialogOpen(true);
  };

  // ============================================================
  // Save / Delete
  // ============================================================

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.titulo.trim()) {
      toast.error('Nombre y título son requeridos');
      return;
    }
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        titulo: form.titulo.trim(),
        categoria: form.categoria,
        perfil_profesional: form.perfil_profesional.trim() || null,
        especialidades: form.especialidades.length > 0 ? form.especialidades : null,
        formacion_academica: form.formacion_academica.length > 0 ? form.formacion_academica : null,
        experiencia_profesional:
          form.experiencia_profesional.length > 0 ? form.experiencia_profesional : null,
        foto_path: form.foto_path,
        cv_pdf_path: form.cv_pdf_path,
        orden: parseInt(form.orden, 10) || 0,
      };

      const url = editing
        ? `/api/propuestas/consultores/${editing.id}`
        : '/api/propuestas/consultores';
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al guardar consultor');
        return;
      }

      toast.success(editing ? 'Consultor actualizado' : 'Consultor creado');
      setDialogOpen(false);
      loadConsultores();
    } catch {
      toast.error('Error al guardar consultor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/propuestas/consultores/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al desactivar consultor');
        return;
      }
      toast.success('Consultor desactivado');
      setConfirmDeleteId(null);
      loadConsultores();
    } catch {
      toast.error('Error al desactivar consultor');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================================
  // File uploads
  // ============================================================

  const handleUploadFoto = async (file: File) => {
    setUploadingFoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subfolder', 'consultores');
      const res = await fetch('/api/propuestas/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al subir foto');
        return;
      }
      setForm(f => ({ ...f, foto_path: json.data.path }));
      toast.success('Foto subida');
    } catch {
      toast.error('Error al subir foto');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleUploadCv = async (file: File) => {
    setUploadingCv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subfolder', 'consultores');
      const res = await fetch('/api/propuestas/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al subir CV');
        return;
      }
      setForm(f => ({ ...f, cv_pdf_path: json.data.path }));
      toast.success('CV subido');
    } catch {
      toast.error('Error al subir CV');
    } finally {
      setUploadingCv(false);
    }
  };

  // ============================================================
  // Especialidades helpers
  // ============================================================

  const addEspecialidad = () => {
    const val = form.especialidadInput.trim();
    if (val && !form.especialidades.includes(val)) {
      setForm(f => ({
        ...f,
        especialidades: [...f.especialidades, val],
        especialidadInput: '',
      }));
    }
  };

  const removeEspecialidad = (idx: number) => {
    setForm(f => ({ ...f, especialidades: f.especialidades.filter((_, i) => i !== idx) }));
  };

  // ============================================================
  // Formación académica helpers
  // ============================================================

  const addFormacion = () => {
    setForm(f => ({
      ...f,
      formacion_academica: [
        ...f.formacion_academica,
        { year: new Date().getFullYear(), institution: '', degree: '' },
      ],
    }));
  };

  const updateFormacion = (
    idx: number,
    field: keyof FormacionAcademica,
    value: string | number
  ) => {
    setForm(f => ({
      ...f,
      formacion_academica: f.formacion_academica.map((item, i) =>
        i === idx ? { ...item, [field]: field === 'year' ? Number(value) : value } : item
      ),
    }));
  };

  const removeFormacion = (idx: number) => {
    setForm(f => ({
      ...f,
      formacion_academica: f.formacion_academica.filter((_, i) => i !== idx),
    }));
  };

  // ============================================================
  // Experiencia profesional helpers
  // ============================================================

  const addExperiencia = () => {
    setForm(f => ({
      ...f,
      experiencia_profesional: [
        ...f.experiencia_profesional,
        { empresa: '', cargo: '', funcion: '' },
      ],
    }));
  };

  const updateExperiencia = (
    idx: number,
    field: keyof ExperienciaProfesional,
    value: string
  ) => {
    setForm(f => ({
      ...f,
      experiencia_profesional: f.experiencia_profesional.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeExperiencia = (idx: number) => {
    setForm(f => ({
      ...f,
      experiencia_profesional: f.experiencia_profesional.filter((_, i) => i !== idx),
    }));
  };

  // ============================================================
  // Render
  // ============================================================

  if (!authReady) {
    return (
      <MainLayout
        user={currentUser as Parameters<typeof MainLayout>[0]['user']}
        currentPage="licitaciones"
        pageTitle="Consultores"
        isAdmin={isAdmin}
        userRole={userRole}
      >
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-400"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones"
      pageTitle="Consultores FNE"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-1" />
          Volver
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Consultores FNE</h1>
            <p className="text-sm text-gray-600 mt-1">
              Biblioteca de consultores para propuestas de licitación
            </p>
          </div>
          <button onClick={openCreate} className={BTN_PRIMARY}>
            <Plus size={16} className="inline mr-1" />
            Nuevo Consultor
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            </div>
          ) : consultores.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <User size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No hay consultores registrados</p>
              <button onClick={openCreate} className="mt-3 text-sm text-blue-600 hover:underline">
                Agregar el primero
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre / Título</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Categoría</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">Especialidades</th>
                    <th className="px-4 py-3 text-center hidden md:table-cell">Foto</th>
                    <th className="px-4 py-3 text-center hidden md:table-cell">CV</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {consultores.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c.nombre}</div>
                        <div className="text-xs text-gray-500">{c.titulo}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORIA_COLORS[c.categoria]}`}
                        >
                          {CATEGORIA_LABELS[c.categoria]}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(c.especialidades || []).slice(0, 3).map((e, i) => (
                            <span
                              key={i}
                              className="inline-flex px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                            >
                              {e}
                            </span>
                          ))}
                          {(c.especialidades?.length || 0) > 3 && (
                            <span className="text-xs text-gray-400">
                              +{(c.especialidades?.length || 0) - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {c.foto_path ? (
                          <span className="text-green-600 text-xs font-medium">✓</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {c.cv_pdf_path ? (
                          <span className="text-green-600 text-xs font-medium">✓</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEdit(c)}
                          className="text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50 transition-colors mr-1"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(c.id)}
                          className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                          title="Desactivar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Consultor' : 'Nuevo Consultor'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Nombre + Título */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nombre completo *
                </label>
                <input
                  className={INPUT_CLASS}
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Arnoldo Cisternas"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Título *</label>
                <input
                  className={INPUT_CLASS}
                  value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ej: Director del Programa"
                />
              </div>
            </div>

            {/* Categoría + Orden */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoría *</label>
                <select
                  className={INPUT_CLASS}
                  value={form.categoria}
                  onChange={e =>
                    setForm(f => ({ ...f, categoria: e.target.value as ConsultorCategoria }))
                  }
                >
                  {(Object.entries(CATEGORIA_LABELS) as [ConsultorCategoria, string][]).map(
                    ([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Orden de aparición
                </label>
                <input
                  type="number"
                  min="0"
                  className={INPUT_CLASS}
                  value={form.orden}
                  onChange={e => setForm(f => ({ ...f, orden: e.target.value }))}
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Perfil profesional (bio)
              </label>
              <textarea
                rows={3}
                className={INPUT_CLASS}
                value={form.perfil_profesional}
                onChange={e => setForm(f => ({ ...f, perfil_profesional: e.target.value }))}
                placeholder="Descripción del perfil profesional..."
              />
            </div>

            {/* Especialidades */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Especialidades</label>
              <div className="flex gap-2 mb-2">
                <input
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                  value={form.especialidadInput}
                  onChange={e => setForm(f => ({ ...f, especialidadInput: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEspecialidad();
                    }
                  }}
                  placeholder="Escribir y presionar Enter"
                />
                <button type="button" onClick={addEspecialidad} className={BTN_SECONDARY}>
                  Agregar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {form.especialidades.map((e, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800"
                  >
                    {e}
                    <button
                      type="button"
                      onClick={() => removeEspecialidad(i)}
                      className="hover:text-blue-600"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Formación académica */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">Formación académica</label>
                <button
                  type="button"
                  onClick={addFormacion}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Agregar
                </button>
              </div>
              <div className="space-y-2">
                {form.formacion_academica.map((item, i) => (
                  <div key={i} className="grid grid-cols-7 gap-2 items-center">
                    <input
                      type="number"
                      className={`col-span-1 ${INPUT_CLASS}`}
                      value={item.year}
                      onChange={e => updateFormacion(i, 'year', e.target.value)}
                      placeholder="Año"
                    />
                    <input
                      className={`col-span-3 ${INPUT_CLASS}`}
                      value={item.institution}
                      onChange={e => updateFormacion(i, 'institution', e.target.value)}
                      placeholder="Institución"
                    />
                    <input
                      className={`col-span-2 ${INPUT_CLASS}`}
                      value={item.degree}
                      onChange={e => updateFormacion(i, 'degree', e.target.value)}
                      placeholder="Título"
                    />
                    <button
                      type="button"
                      onClick={() => removeFormacion(i)}
                      className="text-red-500 hover:text-red-700 flex justify-center"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Experiencia profesional */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">Experiencia profesional</label>
                <button
                  type="button"
                  onClick={addExperiencia}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + Agregar
                </button>
              </div>
              <div className="space-y-2">
                {form.experiencia_profesional.map((item, i) => (
                  <div key={i} className="grid grid-cols-7 gap-2 items-center">
                    <input
                      className={`col-span-2 ${INPUT_CLASS}`}
                      value={item.empresa}
                      onChange={e => updateExperiencia(i, 'empresa', e.target.value)}
                      placeholder="Empresa"
                    />
                    <input
                      className={`col-span-2 ${INPUT_CLASS}`}
                      value={item.cargo}
                      onChange={e => updateExperiencia(i, 'cargo', e.target.value)}
                      placeholder="Cargo"
                    />
                    <input
                      className={`col-span-2 ${INPUT_CLASS}`}
                      value={item.funcion}
                      onChange={e => updateExperiencia(i, 'funcion', e.target.value)}
                      placeholder="Función"
                    />
                    <button
                      type="button"
                      onClick={() => removeExperiencia(i)}
                      className="text-red-500 hover:text-red-700 flex justify-center"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* File uploads */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Foto de perfil (PNG/JPG)
                </label>
                {form.foto_path && (
                  <p className="text-xs text-green-600 mb-1 truncate">
                    ✓ {form.foto_path.split('/').pop()}
                  </p>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  disabled={uploadingFoto}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadFoto(f);
                  }}
                  className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                />
                {uploadingFoto && <p className="text-xs text-gray-500 mt-1">Subiendo...</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">CV (PDF)</label>
                {form.cv_pdf_path && (
                  <p className="text-xs text-green-600 mb-1 truncate">
                    ✓ {form.cv_pdf_path.split('/').pop()}
                  </p>
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={uploadingCv}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadCv(f);
                  }}
                  className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                />
                {uploadingCv && <p className="text-xs text-gray-500 mt-1">Subiendo...</p>}
              </div>
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => setDialogOpen(false)} className={BTN_SECONDARY}>
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploadingFoto || uploadingCv}
              className={BTN_PRIMARY}
            >
              {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear consultor'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete Dialog ── */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desactivar consultor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            El consultor será desactivado y no aparecerá en nuevas propuestas. Puede reactivarlo
            editándolo directamente en la base de datos.
          </p>
          <DialogFooter className="mt-2">
            <button onClick={() => setConfirmDeleteId(null)} className={BTN_SECONDARY}>
              Cancelar
            </button>
            <button
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? 'Desactivando...' : 'Desactivar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
