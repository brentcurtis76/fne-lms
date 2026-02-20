/**
 * Admin — Criterios de Evaluacion
 * /pages/admin/licitaciones/criterios.tsx
 *
 * Admin-only page for managing technical evaluation criteria per program.
 * Features: program selector, criteria table with inline edit, add/delete, validation sum=100.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import { EvaluacionCriterio } from '@/types/licitaciones';

interface Programa {
  id: string;
  nombre: string;
}

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-full';
const BTN_PRIMARY =
  'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed';
const BTN_SECONDARY =
  'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60';
const BTN_DANGER =
  'text-red-600 hover:text-red-800 text-sm transition-colors p-1';

interface EditingCriterio {
  id?: string;
  nombre_criterio: string;
  puntaje_maximo: string;
  descripcion: string;
  orden: string;
  is_active: boolean;
  isNew?: boolean;
}

export default function CriteriosAdminPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const [programas, setProgramas] = useState<Programa[]>([]);
  const [selectedProgramaId, setSelectedProgramaId] = useState<string>('');
  const [criterios, setCriterios] = useState<EvaluacionCriterio[]>([]);
  const [loading, setLoading] = useState(false);

  // Editing state
  const [editingRows, setEditingRows] = useState<Record<string, EditingCriterio>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRow, setNewRow] = useState<EditingCriterio>({
    nombre_criterio: '',
    puntaje_maximo: '',
    descripcion: '',
    orden: '',
    is_active: true,
    isNew: true,
  });
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // ============================================================
  // Auth check
  // ============================================================

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (authReady) {
      loadProgramas();
    }
  }, [authReady]);

  useEffect(() => {
    if (selectedProgramaId) {
      loadCriterios(selectedProgramaId);
    }
  }, [selectedProgramaId]);

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
      const roles: string[] = (
        rolesData.roles ||
        rolesData.data?.roles ||
        []
      ).map((r: { role_type: string }) => r.role_type);

      if (!roles.includes('admin')) {
        toast.error('Solo administradores pueden gestionar criterios');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(true);
      setAuthReady(true);
    } catch {
      router.push('/login');
    }
  };

  // ============================================================
  // Data loading
  // ============================================================

  const loadProgramas = async () => {
    try {
      // Use the templates endpoint which already returns programs (no separate /api/programas endpoint)
      const res = await fetch('/api/admin/licitaciones/templates');
      if (res.ok) {
        const json = await res.json();
        // templates endpoint returns { programas: [{programa: {id, nombre}, template: ...}] }
        const programaList = json.data?.programas || [];
        const progs: Programa[] = programaList.map(
          (entry: { programa: { id: string; nombre: string } }) => ({
            id: entry.programa.id,
            nombre: entry.programa.nombre,
          })
        );
        setProgramas(progs);
        if (progs.length > 0 && !selectedProgramaId) {
          setSelectedProgramaId(progs[0].id);
        }
      }
    } catch {
      toast.error('Error al cargar programas');
    }
  };

  const loadCriterios = useCallback(async (programaId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/licitaciones/criterios?programa_id=${encodeURIComponent(programaId)}`
      );
      const json = await res.json();
      if (res.ok) {
        setCriterios(json.data?.criterios || []);
        setEditingRows({});
      }
    } catch {
      toast.error('Error al cargar criterios');
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================
  // Validation
  // ============================================================

  const totalActivePuntaje = criterios
    .filter(c => c.is_active)
    .reduce((sum, c) => sum + Number(c.puntaje_maximo), 0);

  const editedTotalActivePuntaje = criterios
    .filter(c => c.is_active)
    .reduce((sum, c) => {
      const editing = editingRows[c.id];
      if (editing) return sum + (parseFloat(editing.puntaje_maximo) || 0);
      return sum + Number(c.puntaje_maximo);
    }, 0)
    + (showAddForm && newRow.is_active ? parseFloat(newRow.puntaje_maximo) || 0 : 0);

  // ============================================================
  // CRUD operations
  // ============================================================

  const handleSaveCriterio = async (criterioId: string) => {
    const editing = editingRows[criterioId];
    if (!editing) return;

    if (!editing.nombre_criterio.trim()) {
      toast.error('Nombre del criterio requerido');
      return;
    }
    const puntaje = parseFloat(editing.puntaje_maximo);
    if (isNaN(puntaje) || puntaje <= 0) {
      toast.error('Puntaje maximo debe ser mayor a 0');
      return;
    }

    setSaving(s => ({ ...s, [criterioId]: true }));
    try {
      const res = await fetch(
        `/api/admin/licitaciones/criterios?criterio_id=${criterioId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre_criterio: editing.nombre_criterio.trim(),
            puntaje_maximo: puntaje,
            descripcion: editing.descripcion.trim() || null,
            orden: parseInt(editing.orden) || 0,
            is_active: editing.is_active,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al actualizar criterio');
        return;
      }
      toast.success('Criterio actualizado');
      setEditingRows(prev => {
        const next = { ...prev };
        delete next[criterioId];
        return next;
      });
      loadCriterios(selectedProgramaId);
    } catch {
      toast.error('Error al actualizar criterio');
    } finally {
      setSaving(s => ({ ...s, [criterioId]: false }));
    }
  };

  const handleDeleteCriterio = async (criterioId: string, nombre: string) => {
    if (!window.confirm(`¿Desactivar el criterio "${nombre}"?`)) return;

    setSaving(s => ({ ...s, [criterioId]: true }));
    try {
      const res = await fetch(
        `/api/admin/licitaciones/criterios?criterio_id=${criterioId}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al eliminar criterio');
        return;
      }
      toast.success('Criterio desactivado');
      loadCriterios(selectedProgramaId);
    } catch {
      toast.error('Error al eliminar criterio');
    } finally {
      setSaving(s => ({ ...s, [criterioId]: false }));
    }
  };

  const handleAddCriterio = async () => {
    if (!newRow.nombre_criterio.trim()) {
      toast.error('Nombre del criterio requerido');
      return;
    }
    const puntaje = parseFloat(newRow.puntaje_maximo);
    if (isNaN(puntaje) || puntaje <= 0) {
      toast.error('Puntaje maximo debe ser mayor a 0');
      return;
    }

    setSaving(s => ({ ...s, new: true }));
    try {
      const res = await fetch('/api/admin/licitaciones/criterios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programa_id: selectedProgramaId,
          nombre_criterio: newRow.nombre_criterio.trim(),
          puntaje_maximo: puntaje,
          descripcion: newRow.descripcion.trim() || null,
          orden: parseInt(newRow.orden) || criterios.length + 1,
          is_active: newRow.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al crear criterio');
        return;
      }
      toast.success('Criterio creado');
      setNewRow({
        nombre_criterio: '',
        puntaje_maximo: '',
        descripcion: '',
        orden: '',
        is_active: true,
        isNew: true,
      });
      setShowAddForm(false);
      loadCriterios(selectedProgramaId);
    } catch {
      toast.error('Error al crear criterio');
    } finally {
      setSaving(s => ({ ...s, new: false }));
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (!authReady) {
    return (
      <MainLayout
        user={null}
        currentPage="admin"
        pageTitle="Criterios de Evaluacion"
        isAdmin={false}
        userRole=""
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
      currentPage="admin"
      pageTitle="Criterios de Evaluacion"
      isAdmin={isAdmin}
      userRole="admin"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <button
          onClick={() => router.push('/admin/licitaciones/templates')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={18} className="mr-1" />
          Volver
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Criterios de Evaluacion Tecnica</h1>
          <p className="text-sm text-gray-500 mt-1">
            Administre los criterios de evaluacion por programa. La suma de puntajes maximos debe ser 100.
          </p>
        </div>

        {/* Program selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label htmlFor="programa-select" className="block text-sm font-medium text-gray-700 mb-2">
            Programa
          </label>
          <select
            id="programa-select"
            value={selectedProgramaId}
            onChange={e => setSelectedProgramaId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Seleccione un programa...</option>
            {programas.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Criteria table */}
        {selectedProgramaId && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Criterios</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Total puntaje activos:{' '}
                  <span
                    className={
                      Math.abs(editedTotalActivePuntaje - 100) < 0.01
                        ? 'text-green-600 font-semibold'
                        : 'text-red-600 font-semibold'
                    }
                  >
                    {editedTotalActivePuntaje.toFixed(1)} / 100
                  </span>
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={BTN_PRIMARY}
              >
                <span className="flex items-center gap-1">
                  <Plus size={14} />
                  Agregar criterio
                </span>
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Criterio</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Max pts</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Orden</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Activo</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {criterios.map(c => {
                        const editing = editingRows[c.id];
                        return (
                          <tr key={c.id} className={!c.is_active ? 'opacity-50 bg-gray-50' : ''}>
                            {editing ? (
                              <>
                                <td className="px-4 py-3">
                                  <input
                                    type="text"
                                    value={editing.nombre_criterio}
                                    onChange={e =>
                                      setEditingRows(prev => ({
                                        ...prev,
                                        [c.id]: { ...editing, nombre_criterio: e.target.value },
                                      }))
                                    }
                                    className={INPUT_CLASS}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={editing.puntaje_maximo}
                                    onChange={e =>
                                      setEditingRows(prev => ({
                                        ...prev,
                                        [c.id]: { ...editing, puntaje_maximo: e.target.value },
                                      }))
                                    }
                                    className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-right"
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="number"
                                    min={0}
                                    value={editing.orden}
                                    onChange={e =>
                                      setEditingRows(prev => ({
                                        ...prev,
                                        [c.id]: { ...editing, orden: e.target.value },
                                      }))
                                    }
                                    className="border border-gray-300 rounded px-2 py-1 text-sm w-16 text-right"
                                  />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={editing.is_active}
                                    onChange={e =>
                                      setEditingRows(prev => ({
                                        ...prev,
                                        [c.id]: { ...editing, is_active: e.target.checked },
                                      }))
                                    }
                                  />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => handleSaveCriterio(c.id)}
                                      disabled={saving[c.id]}
                                      className="text-green-600 hover:text-green-800 p-1"
                                      title="Guardar"
                                      aria-label="Guardar criterio"
                                    >
                                      <Save size={16} />
                                    </button>
                                    <button
                                      onClick={() =>
                                        setEditingRows(prev => {
                                          const next = { ...prev };
                                          delete next[c.id];
                                          return next;
                                        })
                                      }
                                      className="text-gray-500 hover:text-gray-700 text-xs"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  {c.nombre_criterio}
                                  {c.descripcion && (
                                    <p className="text-xs text-gray-500 font-normal">{c.descripcion}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">{c.puntaje_maximo}</td>
                                <td className="px-4 py-3 text-right">{c.orden}</td>
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      c.is_active
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    {c.is_active ? 'Activo' : 'Inactivo'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() =>
                                        setEditingRows(prev => ({
                                          ...prev,
                                          [c.id]: {
                                            id: c.id,
                                            nombre_criterio: c.nombre_criterio,
                                            puntaje_maximo: String(c.puntaje_maximo),
                                            descripcion: c.descripcion || '',
                                            orden: String(c.orden),
                                            is_active: c.is_active,
                                          },
                                        }))
                                      }
                                      className="text-gray-700 hover:text-gray-900 text-xs"
                                    >
                                      Editar
                                    </button>
                                    {c.is_active && (
                                      <button
                                        onClick={() => handleDeleteCriterio(c.id, c.nombre_criterio)}
                                        disabled={saving[c.id]}
                                        className={BTN_DANGER}
                                        title="Desactivar"
                                        aria-label={`Desactivar criterio ${c.nombre_criterio}`}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}

                      {criterios.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                            No hay criterios definidos para este programa.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add new row form */}
                {showAddForm && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Nuevo Criterio</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Nombre <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newRow.nombre_criterio}
                          onChange={e => setNewRow(r => ({ ...r, nombre_criterio: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Nombre del criterio"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Puntaje Max <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newRow.puntaje_maximo}
                          onChange={e => setNewRow(r => ({ ...r, puntaje_maximo: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Orden</label>
                        <input
                          type="number"
                          min={0}
                          value={newRow.orden}
                          onChange={e => setNewRow(r => ({ ...r, orden: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder={String(criterios.length + 1)}
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Descripcion (opcional)
                        </label>
                        <textarea
                          value={newRow.descripcion}
                          onChange={e => setNewRow(r => ({ ...r, descripcion: e.target.value }))}
                          rows={2}
                          className={INPUT_CLASS}
                          placeholder="Descripcion del criterio de evaluacion"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleAddCriterio}
                        disabled={saving.new}
                        className={BTN_PRIMARY}
                      >
                        {saving.new ? 'Guardando...' : 'Agregar Criterio'}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddForm(false);
                          setNewRow({ nombre_criterio: '', puntaje_maximo: '', descripcion: '', orden: '', is_active: true, isNew: true });
                        }}
                        className={BTN_SECONDARY}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Validation warning */}
        {selectedProgramaId && Math.abs(totalActivePuntaje - 100) > 0.01 && criterios.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            ⚠ La suma de puntajes maximos de criterios activos es {totalActivePuntaje.toFixed(1)}, no 100. Ajuste los criterios.
          </div>
        )}
      </div>
    </MainLayout>
  );
}
