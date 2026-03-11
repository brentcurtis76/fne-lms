/**
 * Admin — Biblioteca de Documentos para Propuestas
 * /pages/admin/licitaciones/documentos-propuesta.tsx
 *
 * Admin-only CRUD page for the supporting document library used in proposal generation.
 * Features: list with expiry warnings, add/edit dialog with file upload, soft delete.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Plus, Pencil, Trash2, ArrowLeft, FileText, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { PropuestaDocumentoBiblioteca, DocumentoTipo } from '@/lib/propuestas/types';

// ============================================================
// CONSTANTS
// ============================================================

const TIPO_LABELS: Record<DocumentoTipo, string> = {
  certificado_pertenencia: 'Certificado de Pertenencia',
  evaluaciones_clientes: 'Evaluaciones de Clientes',
  carta_recomendacion: 'Carta de Recomendación',
  ficha_servicio: 'Ficha de Servicio',
  otro: 'Otro',
};

const TIPO_COLORS: Record<DocumentoTipo, string> = {
  certificado_pertenencia: 'bg-blue-100 text-blue-800',
  evaluaciones_clientes: 'bg-purple-100 text-purple-800',
  carta_recomendacion: 'bg-green-100 text-green-800',
  ficha_servicio: 'bg-yellow-100 text-yellow-800',
  otro: 'bg-gray-100 text-gray-700',
};

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none w-full';
const BTN_PRIMARY =
  'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';

// ============================================================
// HELPERS
// ============================================================

type DocumentoWithExpiry = PropuestaDocumentoBiblioteca & { expired: boolean };

function getExpiryStatus(
  doc: DocumentoWithExpiry
): 'expired' | 'expiring_soon' | 'valid' | 'no_expiry' {
  if (!doc.fecha_vencimiento) return 'no_expiry';
  const vencimiento = new Date(doc.fecha_vencimiento);
  const now = new Date();
  if (vencimiento < now) return 'expired';
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  if (vencimiento <= thirtyDays) return 'expiring_soon';
  return 'valid';
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ============================================================
// FORM STATE
// ============================================================

interface FormState {
  nombre: string;
  tipo: DocumentoTipo;
  descripcion: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  archivo_path: string;
}

const EMPTY_FORM: FormState = {
  nombre: '',
  tipo: 'certificado_pertenencia',
  descripcion: '',
  fecha_emision: '',
  fecha_vencimiento: '',
  archivo_path: '',
};

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function DocumentosPropuestaAdminPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [authReady, setAuthReady] = useState(false);

  const [documentos, setDocumentos] = useState<DocumentoWithExpiry[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentoWithExpiry | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // File upload
  const [uploadingFile, setUploadingFile] = useState(false);

  // ============================================================
  // Auth
  // ============================================================

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authReady) loadDocumentos();
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
        toast.error('Solo administradores pueden gestionar documentos');
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

  const loadDocumentos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/propuestas/documentos');
      const json = await res.json();
      if (res.ok) {
        setDocumentos(json.data?.documentos || []);
      } else {
        toast.error(json.error || 'Error al cargar documentos');
      }
    } catch {
      toast.error('Error al cargar documentos');
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

  const openEdit = (d: DocumentoWithExpiry) => {
    setEditing(d);
    setForm({
      nombre: d.nombre,
      tipo: d.tipo,
      descripcion: d.descripcion || '',
      fecha_emision: d.fecha_emision || '',
      fecha_vencimiento: d.fecha_vencimiento || '',
      archivo_path: d.archivo_path,
    });
    setDialogOpen(true);
  };

  // ============================================================
  // Save / Delete
  // ============================================================

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!form.archivo_path && !editing) {
      toast.error('Debe subir un archivo');
      return;
    }
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        descripcion: form.descripcion.trim() || null,
        archivo_path: form.archivo_path || editing?.archivo_path,
        fecha_emision: form.fecha_emision || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
      };

      const url = editing
        ? `/api/propuestas/documentos/${editing.id}`
        : '/api/propuestas/documentos';
      const method = editing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || 'Error al guardar documento');
        return;
      }

      toast.success(editing ? 'Documento actualizado' : 'Documento creado');
      setDialogOpen(false);
      loadDocumentos();
    } catch {
      toast.error('Error al guardar documento');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/propuestas/documentos/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al eliminar documento');
        return;
      }
      toast.success('Documento eliminado');
      setConfirmDeleteId(null);
      loadDocumentos();
    } catch {
      toast.error('Error al eliminar documento');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================================
  // File upload
  // ============================================================

  const handleUploadFile = async (file: File) => {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subfolder', `documentos/${form.tipo}`);
      const res = await fetch('/api/propuestas/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al subir archivo');
        return;
      }
      setForm(f => ({ ...f, archivo_path: json.data.path }));
      toast.success('Archivo subido');
    } catch {
      toast.error('Error al subir archivo');
    } finally {
      setUploadingFile(false);
    }
  };

  // ============================================================
  // Render helpers
  // ============================================================

  function ExpiryBadge({ doc }: { doc: DocumentoWithExpiry }) {
    const status = getExpiryStatus(doc);
    if (status === 'no_expiry') return <span className="text-gray-400 text-xs">Sin vencimiento</span>;
    if (status === 'expired')
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <AlertTriangle size={10} />
          Vencido {formatDate(doc.fecha_vencimiento)}
        </span>
      );
    if (status === 'expiring_soon')
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <AlertTriangle size={10} />
          Vence {formatDate(doc.fecha_vencimiento)}
        </span>
      );
    return (
      <span className="text-xs text-green-600">Vigente hasta {formatDate(doc.fecha_vencimiento)}</span>
    );
  }

  if (!authReady) {
    return (
      <MainLayout
        user={currentUser as Parameters<typeof MainLayout>[0]['user']}
        currentPage="licitaciones"
        pageTitle="Documentos"
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
      pageTitle="Documentos para Propuestas"
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
            <h1 className="text-2xl font-bold text-gray-900">Biblioteca de Documentos</h1>
            <p className="text-sm text-gray-600 mt-1">
              Certificados, evaluaciones y cartas para anexar a propuestas
            </p>
          </div>
          <button onClick={openCreate} className={BTN_PRIMARY}>
            <Plus size={16} className="inline mr-1" />
            Nuevo Documento
          </button>
        </div>

        {/* Expiry summary */}
        {documentos.some(d => getExpiryStatus(d) === 'expired') && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Hay {documentos.filter(d => getExpiryStatus(d) === 'expired').length} documento(s)
              vencido(s). Los certificados vencidos bloquean la generación de propuestas.
            </span>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            </div>
          ) : documentos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No hay documentos registrados</p>
              <button onClick={openCreate} className="mt-3 text-sm text-blue-600 hover:underline">
                Agregar el primero
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Tipo</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">
                      Emisión
                    </th>
                    <th className="px-4 py-3 text-left">Vencimiento</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documentos.map(doc => {
                    const status = getExpiryStatus(doc);
                    const rowClass =
                      status === 'expired'
                        ? 'bg-red-50 hover:bg-red-100'
                        : status === 'expiring_soon'
                        ? 'bg-yellow-50 hover:bg-yellow-100'
                        : 'hover:bg-gray-50';

                    return (
                      <tr key={doc.id} className={`transition-colors ${rowClass}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{doc.nombre}</div>
                          {doc.descripcion && (
                            <div className="text-xs text-gray-500 truncate max-w-xs">
                              {doc.descripcion}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[doc.tipo]}`}
                          >
                            {TIPO_LABELS[doc.tipo]}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                          {formatDate(doc.fecha_emision)}
                        </td>
                        <td className="px-4 py-3">
                          <ExpiryBadge doc={doc} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => openEdit(doc)}
                            className="text-blue-600 hover:text-blue-800 p-1.5 rounded hover:bg-blue-50 transition-colors mr-1"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(doc.id)}
                            className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Documento' : 'Nuevo Documento'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nombre */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                className={INPUT_CLASS}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Certificado de Pertenencia FNE"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo *</label>
              <select
                className={INPUT_CLASS}
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as DocumentoTipo }))}
              >
                {(Object.entries(TIPO_LABELS) as [DocumentoTipo, string][]).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Descripción (opcional)
              </label>
              <input
                className={INPUT_CLASS}
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Ej: Certificado vigente emitido por MINEDUC"
              />
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fecha de emisión
                </label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={form.fecha_emision}
                  onChange={e => setForm(f => ({ ...f, fecha_emision: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fecha de vencimiento
                </label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={form.fecha_vencimiento}
                  onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                />
              </div>
            </div>

            {/* Archivo */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Archivo (PDF) {!editing && '*'}
              </label>
              {form.archivo_path && (
                <p className="text-xs text-green-600 mb-1 truncate">
                  ✓ {form.archivo_path.split('/').pop()}
                </p>
              )}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                disabled={uploadingFile}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadFile(f);
                }}
                className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:bg-white file:text-gray-700 hover:file:bg-gray-50"
              />
              {uploadingFile && <p className="text-xs text-gray-500 mt-1">Subiendo...</p>}
              {editing && !form.archivo_path && (
                <p className="text-xs text-gray-400 mt-1">
                  Deje vacío para conservar el archivo actual
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => setDialogOpen(false)} className={BTN_SECONDARY}>
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || uploadingFile}
              className={BTN_PRIMARY}
            >
              {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear documento'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Delete Dialog ── */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar documento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            El documento será eliminado de la biblioteca y no estará disponible para nuevas
            propuestas. Esta acción es irreversible.
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
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
