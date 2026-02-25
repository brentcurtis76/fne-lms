/**
 * Admin — Feriados Chile
 * /pages/admin/licitaciones/feriados.tsx
 *
 * Admin-only page for managing Chilean public holidays used in
 * licitacion timeline calculations.
 * Features: year filter, table with inline edit, add form, delete with confirmation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, Save, ArrowLeft, Edit2, Calendar } from 'lucide-react';
import { FeriadoChile } from '@/types/licitaciones';

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-full';
const BTN_PRIMARY =
  'px-4 py-2 bg-yellow-400 text-black rounded-lg font-medium hover:bg-yellow-500 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2';
const BTN_SECONDARY =
  'px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2';
const BTN_DANGER =
  'text-red-600 hover:text-red-800 text-sm transition-colors p-1 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 rounded';

interface FeriadoEditState {
  fecha: string;
  nombre: string;
}

export default function FeriadosAdminPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const [feriados, setFeriados] = useState<FeriadoChile[]>([]);
  const [loading, setLoading] = useState(false);

  // Year filter
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FeriadoEditState>({ fecha: '', nombre: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeriado, setNewFeriado] = useState<FeriadoEditState>({
    fecha: `${currentYear}-01-01`,
    nombre: '',
  });
  const [addingSaving, setAddingSaving] = useState(false);

  // Bulk seed state
  const [bulkSeeding, setBulkSeeding] = useState(false);

  // ============================================================
  // Data loading
  // ============================================================

  const loadFeriados = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/licitaciones/feriados?year=${year}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al cargar feriados');
      }
      const json = await res.json();
      setFeriados(json.data?.feriados || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar feriados');
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================================
  // Auth check
  // ============================================================

  const checkAuth = useCallback(async () => {
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
        toast.error('Solo administradores pueden gestionar feriados');
        router.push('/dashboard');
        return;
      }

      setCurrentUser(user);
      setIsAdmin(true);
      setAuthReady(true);
    } catch {
      router.push('/login');
    }
  }, [supabase, router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authReady) {
      loadFeriados(selectedYear);
    }
  }, [authReady, selectedYear, loadFeriados]);

  // ============================================================
  // Add feriado
  // ============================================================

  const handleAdd = async () => {
    if (!newFeriado.fecha || !newFeriado.nombre.trim()) {
      toast.error('Fecha y nombre son requeridos');
      return;
    }

    setAddingSaving(true);
    try {
      const res = await fetch('/api/admin/licitaciones/feriados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: newFeriado.fecha, nombre: newFeriado.nombre.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al crear feriado');
      }

      toast.success('Feriado agregado exitosamente');
      setShowAddForm(false);
      setNewFeriado({ fecha: `${selectedYear}-01-01`, nombre: '' });
      await loadFeriados(selectedYear);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear feriado');
    } finally {
      setAddingSaving(false);
    }
  };

  // ============================================================
  // Edit feriado
  // ============================================================

  const startEdit = (feriado: FeriadoChile) => {
    setEditingId(feriado.id);
    setEditForm({ fecha: feriado.fecha, nombre: feriado.nombre });
    setConfirmDeleteId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ fecha: '', nombre: '' });
  };

  const handleSaveEdit = async (id: number) => {
    if (!editForm.fecha || !editForm.nombre.trim()) {
      toast.error('Fecha y nombre son requeridos');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/licitaciones/feriados', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, fecha: editForm.fecha, nombre: editForm.nombre.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al actualizar feriado');
      }

      toast.success('Feriado actualizado exitosamente');
      setEditingId(null);
      await loadFeriados(selectedYear);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar feriado');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Delete feriado
  // ============================================================

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch('/api/admin/licitaciones/feriados', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al eliminar feriado');
      }

      toast.success('Feriado eliminado exitosamente');
      setConfirmDeleteId(null);
      await loadFeriados(selectedYear);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar feriado');
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================================
  // Bulk seed Chilean holidays
  // ============================================================

  const handleBulkSeed = async () => {
    setBulkSeeding(true);
    try {
      const res = await fetch('/api/admin/licitaciones/feriados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_seed', year: selectedYear }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Error al cargar feriados');
      }

      const inserted: number = json.data?.inserted ?? 0;
      if (inserted === 0) {
        toast.success(`Todos los feriados de ${selectedYear} ya estaban registrados`);
      } else {
        toast.success(`${inserted} feriado${inserted !== 1 ? 's' : ''} agregado${inserted !== 1 ? 's' : ''} para ${selectedYear}`);
      }
      await loadFeriados(selectedYear);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar feriados');
    } finally {
      setBulkSeeding(false);
    }
  };

  // ============================================================
  // Format date
  // ============================================================

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const day = parseInt(parts[2], 10);
    const month = months[parseInt(parts[1], 10) - 1] || '';
    return `${day} de ${month} de ${parts[0]}`;
  };

  // ============================================================
  // Render
  // ============================================================

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-yellow-400" />
      </div>
    );
  }

  return (
    <MainLayout
      user={currentUser as Parameters<typeof MainLayout>[0]['user']}
      currentPage="licitaciones-feriados"
      pageTitle="Feriados Chile"
      isAdmin={isAdmin}
      userRole="admin"
    >
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/licitaciones')}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm"
          >
            <ArrowLeft size={16} />
            Volver a Licitaciones
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar size={24} aria-hidden="true" />
              Feriados Chile
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Gestione los feriados nacionales utilizados en el cálculo del cronograma de licitaciones
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow mb-4 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label htmlFor="year-filter" className="text-sm font-medium text-gray-700">Filtrar por año:</label>
            <select
              id="year-filter"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:outline-none w-auto"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">
              {feriados.length} feriado{feriados.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkSeed}
              disabled={bulkSeeding}
              className={BTN_SECONDARY}
              title={`Agregar automaticamente todos los feriados de Chile para ${selectedYear}`}
            >
              <Calendar size={16} className="inline mr-1" />
              {bulkSeeding ? 'Cargando...' : `Cargar feriados ${selectedYear}`}
            </button>
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                setNewFeriado({ fecha: `${selectedYear}-01-01`, nombre: '' });
              }}
              className={BTN_PRIMARY}
            >
              <Plus size={16} className="inline mr-1" />
              Agregar Feriado
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h3 className="font-medium text-gray-900 mb-3 text-sm">Nuevo Feriado</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label htmlFor="new-feriado-fecha" className="block text-xs text-gray-600 mb-1">Fecha</label>
                <input
                  id="new-feriado-fecha"
                  type="date"
                  value={newFeriado.fecha}
                  onChange={(e) => setNewFeriado(prev => ({ ...prev, fecha: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label htmlFor="new-feriado-nombre" className="block text-xs text-gray-600 mb-1">Nombre del Feriado</label>
                <input
                  id="new-feriado-nombre"
                  type="text"
                  value={newFeriado.nombre}
                  onChange={(e) => setNewFeriado(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Ej: Año Nuevo"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={addingSaving}
                className={BTN_PRIMARY}
              >
                {addingSaving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className={BTN_SECONDARY}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400" />
            </div>
          ) : feriados.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No hay feriados registrados para el año {selectedYear}.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 text-sm font-medium text-gray-700">Fecha</th>
                  <th scope="col" className="text-left px-4 py-3 text-sm font-medium text-gray-700">Nombre</th>
                  <th scope="col" className="text-left px-4 py-3 text-sm font-medium text-gray-700">Año</th>
                  <th scope="col" className="px-4 py-3 sr-only">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {feriados.map((feriado) => (
                  <tr key={feriado.id} className="hover:bg-gray-50">
                    {editingId === feriado.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="date"
                            value={editForm.fecha}
                            onChange={(e) =>
                              setEditForm(prev => ({ ...prev, fecha: e.target.value }))
                            }
                            aria-label="Fecha del feriado"
                            className={INPUT_CLASS}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.nombre}
                            onChange={(e) =>
                              setEditForm(prev => ({ ...prev, nombre: e.target.value }))
                            }
                            aria-label="Nombre del feriado"
                            className={INPUT_CLASS}
                          />
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {editForm.fecha ? editForm.fecha.split('-')[0] : feriado.year}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(feriado.id)}
                              disabled={saving}
                              className={BTN_PRIMARY}
                            >
                              <Save size={14} className="inline mr-1" />
                              {saving ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button onClick={cancelEdit} className={BTN_SECONDARY}>
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {formatDate(feriado.fecha)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800">{feriado.nombre}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{feriado.year}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEdit(feriado)}
                              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                              aria-label={`Editar ${feriado.nombre}`}
                            >
                              <Edit2 size={14} />
                            </button>
                            {confirmDeleteId === feriado.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(feriado.id)}
                                  disabled={deletingId === feriado.id}
                                  className="px-2 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                                >
                                  {deletingId === feriado.id ? '...' : 'Confirmar'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded transition-colors"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(feriado.id)}
                                className={BTN_DANGER}
                                aria-label={`Eliminar ${feriado.nombre}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
