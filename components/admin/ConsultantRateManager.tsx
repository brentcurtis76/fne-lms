/**
 * ConsultantRateManager — Admin CRUD UI for consultant hourly rates
 *
 * Features:
 *   - Filter bar: consultant dropdown, hour type dropdown, "Solo activas" toggle
 *   - Table: Consultor, Tipo de Hora, Tarifa EUR, Vigente Desde, Vigente Hasta, Acciones
 *   - Add/Edit modal with form → POST/PATCH
 *   - Deactivate (soft delete) action
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, X, DollarSign, AlertCircle, Monitor, Building, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ============================================================
// Types
// ============================================================

interface HourType {
  id: string;
  key: string;
  display_name: string;
  modality?: string;
}

interface ConsultantProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface RateRow {
  id: string;
  consultant_id: string;
  hour_type_id: string;
  rate_eur: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  profiles: ConsultantProfile | null;
  hour_types: HourType | null;
}

interface RateFormData {
  consultant_id: string;
  hour_type_key: string;
  rate_eur: string;
  effective_from: string;
  effective_to: string;
}

const DEFAULT_FORM: RateFormData = {
  consultant_id: '',
  hour_type_key: '',
  rate_eur: '',
  effective_from: '',
  effective_to: '',
};

// ============================================================
// Helpers
// ============================================================

function formatEur(value: number): string {
  return `€${value.toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr + 'T00:00:00'), 'd MMM yyyy', { locale: es });
  } catch {
    return dateStr;
  }
}

function isRateActive(rate: RateRow): boolean {
  if (!rate.effective_to) return true;
  const today = new Date().toISOString().slice(0, 10);
  return rate.effective_to > today;
}

// ============================================================
// Component
// ============================================================

export default function ConsultantRateManager() {
  const [rates, setRates] = useState<RateRow[]>([]);
  const [consultants, setConsultants] = useState<ConsultantProfile[]>([]);
  const [hourTypes, setHourTypes] = useState<HourType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filter state
  const [filterConsultant, setFilterConsultant] = useState('');
  const [filterHourType, setFilterHourType] = useState('');
  const [filterActiveOnly, setFilterActiveOnly] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRate, setEditingRate] = useState<RateRow | null>(null);
  const [form, setForm] = useState<RateFormData>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<RateRow | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // ============================================================
  // Data loading
  // ============================================================

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterConsultant) params.set('consultant_id', filterConsultant);
      if (filterHourType) params.set('hour_type_key', filterHourType);
      if (filterActiveOnly) params.set('active_only', 'true');

      const response = await fetch(`/api/admin/consultant-rates?${params.toString()}`);
      const json = await response.json();

      if (!response.ok) {
        toast.error(json.error ?? 'Error al cargar tarifas');
        return;
      }

      setRates(json.data?.rates ?? []);
    } catch {
      toast.error('Error de red al cargar tarifas');
    } finally {
      setLoading(false);
    }
  }, [filterConsultant, filterHourType, filterActiveOnly]);

  const loadConsultants = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/consultant-assignment-users');
      if (!response.ok) return;
      const json = await response.json();
      // The endpoint returns { consultants: [...], students: [...], ... }
      const users: ConsultantProfile[] = json.consultants ?? [];
      setConsultants(Array.isArray(users) ? users : []);
    } catch {
      // Silently fail — consultant dropdown falls back to empty
    }
  }, []);

  const loadHourTypes = useCallback(async () => {
    try {
      const response = await fetch('/api/hour-types');
      if (!response.ok) return;
      const json = await response.json();
      const types: HourType[] = json.data?.hour_types ?? json.hour_types ?? [];
      setHourTypes(Array.isArray(types) ? types : []);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    loadConsultants();
    loadHourTypes();
  }, [loadConsultants, loadHourTypes]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  // ============================================================
  // Modal helpers
  // ============================================================

  function openAddModal() {
    setEditingRate(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setShowModal(true);
    setTimeout(() => modalRef.current?.focus(), 100);
  }

  function openEditModal(rate: RateRow) {
    setEditingRate(rate);
    setForm({
      consultant_id: rate.consultant_id,
      hour_type_key: rate.hour_types?.key ?? '',
      rate_eur: String(rate.rate_eur),
      effective_from: rate.effective_from,
      effective_to: rate.effective_to ?? '',
    });
    setFormError(null);
    setShowModal(true);
    setTimeout(() => modalRef.current?.focus(), 100);
  }

  function closeModal() {
    setShowModal(false);
    setEditingRate(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
  }

  function handleFormChange(field: keyof RateFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // ============================================================
  // Save (create or update)
  // ============================================================

  async function handleSave() {
    setFormError(null);

    const rateEur = parseFloat(form.rate_eur);
    if (isNaN(rateEur) || rateEur < 0) {
      setFormError('La tarifa EUR debe ser un número válido mayor o igual a 0.');
      return;
    }

    setSaving(true);
    try {
      if (editingRate) {
        // PATCH existing rate
        const payload: { rate_eur?: number; effective_to?: string | null } = {};
        if (form.rate_eur !== String(editingRate.rate_eur)) {
          payload.rate_eur = rateEur;
        }
        if (form.effective_to !== (editingRate.effective_to ?? '')) {
          payload.effective_to = form.effective_to || null;
        }

        const response = await fetch(`/api/admin/consultant-rates/${editingRate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await response.json();

        if (!response.ok) {
          setFormError(json.error ?? 'Error al actualizar tarifa');
          return;
        }

        toast.success('Tarifa actualizada correctamente');
      } else {
        // POST new rate
        const payload = {
          consultant_id: form.consultant_id,
          hour_type_key: form.hour_type_key,
          rate_eur: rateEur,
          effective_from: form.effective_from,
          effective_to: form.effective_to || null,
        };

        if (!payload.consultant_id) {
          setFormError('Debe seleccionar un consultor.');
          return;
        }
        if (!payload.hour_type_key) {
          setFormError('Debe seleccionar un tipo de hora.');
          return;
        }
        if (!payload.effective_from) {
          setFormError('La fecha de inicio es requerida.');
          return;
        }

        const response = await fetch('/api/admin/consultant-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await response.json();

        if (!response.ok) {
          setFormError(json.error ?? 'Error al crear tarifa');
          return;
        }

        toast.success('Tarifa creada correctamente');
      }

      closeModal();
      loadRates();
    } catch {
      setFormError('Error de red. Intente nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // Deactivate (soft delete)
  // ============================================================

  async function handleDeactivate(rate: RateRow) {
    try {
      const response = await fetch(`/api/admin/consultant-rates/${rate.id}`, {
        method: 'DELETE',
      });
      const json = await response.json();

      if (!response.ok) {
        toast.error(json.error ?? 'Error al desactivar tarifa');
        return;
      }

      toast.success('Tarifa desactivada correctamente');
      loadRates();
    } catch {
      toast.error('Error de red al desactivar tarifa');
    }
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          {/* Consultant filter */}
          <select
            value={filterConsultant}
            onChange={(e) => setFilterConsultant(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent min-w-[200px]"
          >
            <option value="">Todos los consultores</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>

          {/* Hour type filter */}
          <select
            value={filterHourType}
            onChange={(e) => setFilterHourType(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent min-w-[200px]"
          >
            <option value="">Todos los tipos de hora</option>
            {hourTypes.map((ht) => (
              <option key={ht.key} value={ht.key}>
                {ht.display_name}
              </option>
            ))}
          </select>

          {/* Active only toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filterActiveOnly}
              onChange={(e) => setFilterActiveOnly(e.target.checked)}
              className="rounded border-gray-300 text-brand_primary focus:ring-brand_accent"
            />
            Solo activas
          </label>

          {/* Spacer */}
          <div className="flex-1" />

          {/* CSV Export button */}
          <a
            href="/api/admin/consultant-rates/csv"
            download
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>

          {/* Add button */}
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-brand_accent text-brand_primary px-4 py-2 rounded-md text-sm font-semibold hover:bg-yellow-400 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar Tarifa
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando tarifas...</div>
        ) : rates.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No se encontraron tarifas con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Consultor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Tipo de Hora</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Tarifa EUR</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Vigente Desde</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Vigente Hasta</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Estado</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rates.map((rate) => {
                  const active = isRateActive(rate);
                  return (
                    <tr key={rate.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        {rate.profiles
                          ? `${rate.profiles.first_name} ${rate.profiles.last_name}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        <span className="flex items-center gap-1.5">
                          {rate.hour_types?.modality === 'online' ? (
                            <Monitor className="h-3.5 w-3.5 text-blue-500" />
                          ) : (
                            <Building className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          {rate.hour_types?.display_name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {formatEur(rate.rate_eur)}
                      </td>
                      <td className="px-4 py-3">{formatDate(rate.effective_from)}</td>
                      <td className="px-4 py-3">{formatDate(rate.effective_to)}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {active ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(rate)}
                            className="p-1 text-gray-500 hover:text-brand_primary transition-colors"
                            aria-label={`Editar tarifa de ${rate.profiles?.first_name ?? 'consultor'}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {active && confirmDeactivate?.id === rate.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  handleDeactivate(rate);
                                  setConfirmDeactivate(null);
                                }}
                                className="px-2 py-0.5 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmDeactivate(null)}
                                className="px-2 py-0.5 text-xs font-medium text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                              >
                                No
                              </button>
                            </div>
                          ) : active ? (
                            <button
                              onClick={() => setConfirmDeactivate(rate)}
                              className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                              aria-label={`Desactivar tarifa de ${rate.profiles?.first_name ?? 'consultor'}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="rate-modal-title">
          <div ref={modalRef} tabIndex={-1} className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 outline-none">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand_primary/10 rounded-lg">
                  <DollarSign className="h-5 w-5 text-brand_primary" />
                </div>
                <h2 id="rate-modal-title" className="text-lg font-semibold text-gray-900">
                  {editingRate ? 'Editar Tarifa' : 'Agregar Tarifa'}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Cerrar dialogo"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form error */}
            {formError && (
              <div className="flex items-start gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Form fields */}
            <div className="space-y-4">
              {/* Consultant — only shown for new rates */}
              {!editingRate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Consultor <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.consultant_id}
                    onChange={(e) => handleFormChange('consultant_id', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
                  >
                    <option value="">Seleccionar consultor...</option>
                    {consultants.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Hour type — only shown for new rates */}
              {!editingRate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Hora <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.hour_type_key}
                    onChange={(e) => handleFormChange('hour_type_key', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
                  >
                    <option value="">Seleccionar tipo de hora...</option>
                    {hourTypes.map((ht) => (
                      <option key={ht.key} value={ht.key}>
                        {ht.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Rate EUR */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tarifa (EUR/hora) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.rate_eur}
                    onChange={(e) => handleFormChange('rate_eur', e.target.value)}
                    className="w-full border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Effective from — only shown for new rates */}
              {!editingRate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vigente Desde <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => handleFormChange('effective_from', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
                  />
                </div>
              )}

              {/* Effective to */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vigente Hasta{' '}
                  <span className="text-gray-400 text-xs">(vacío = sin fecha de término)</span>
                </label>
                <input
                  type="date"
                  value={form.effective_to}
                  onChange={(e) => handleFormChange('effective_to', e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-brand_primary bg-brand_accent rounded-md hover:bg-yellow-400 transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editingRate ? 'Actualizar' : 'Crear Tarifa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
