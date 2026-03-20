/**
 * BucketConfigSection
 * Collapsible section for toggling hour buckets on/off and assigning hours.
 * Supports the 12 predefined BUCKET_TEMPLATES + custom user-defined buckets.
 */

import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { BUCKET_TEMPLATES, type HourBucket, type DistributionType } from '@/lib/propuestas/types/hours';

const INPUT_CLASS =
  'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:outline-none w-full';

const DIST_LABELS: Record<DistributionType, string> = {
  bloque: 'Taller',
  cadencia: 'Sesiones',
  flexible: 'Flexible',
};

const DIST_COLORS: Record<DistributionType, string> = {
  bloque: 'bg-amber-100 text-amber-800',
  cadencia: 'bg-blue-100 text-blue-800',
  flexible: 'bg-gray-100 text-gray-700',
};

const MOD_LABELS: Record<string, string> = {
  presencial: 'Presencial',
  online: 'Online',
  asincronico: 'Asincrónico',
  hibrido: 'Híbrido',
};

const MOD_COLORS: Record<string, string> = {
  presencial: 'bg-yellow-100 text-yellow-800',
  online: 'bg-indigo-100 text-indigo-800',
  asincronico: 'bg-gray-100 text-gray-600',
  hibrido: 'bg-purple-100 text-purple-800',
};

const PROGRAM_MONTHS = 8;

const MES_OPTIONS = Array.from({ length: PROGRAM_MONTHS }, (_, i) => ({
  value: i + 1,
  label: `Mes ${i + 1}`,
}));

interface BucketConfigSectionProps {
  activeBuckets: HourBucket[];
  onChange: (buckets: HourBucket[]) => void;
}

export default function BucketConfigSection({
  activeBuckets,
  onChange,
}: BucketConfigSectionProps) {
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDist, setCustomDist] = useState<DistributionType>('bloque');
  const [customMod, setCustomMod] = useState<HourBucket['modalidad']>('presencial');

  // Check if a predefined template is active
  const isActive = (id: string) => activeBuckets.some((b) => b.id === id);

  // Get custom (non-template) buckets
  const customBuckets = activeBuckets.filter(
    (b) => !BUCKET_TEMPLATES.some((t) => t.id === b.id)
  );

  const toggleBucket = (templateId: string) => {
    if (isActive(templateId)) {
      onChange(activeBuckets.filter((b) => b.id !== templateId));
    } else {
      const template = BUCKET_TEMPLATES.find((t) => t.id === templateId);
      if (template) {
        onChange([...activeBuckets, { ...template, hours: 0 }]);
      }
    }
  };

  const updateBucketHours = (id: string, hours: number) => {
    onChange(
      activeBuckets.map((b) => (b.id === id ? { ...b, hours } : b))
    );
  };

  const updateBucketNotes = (id: string, notes: string) => {
    onChange(
      activeBuckets.map((b) => (b.id === id ? { ...b, notes: notes || undefined } : b))
    );
  };

  const updateBucketMes = (id: string, mes: number | undefined) => {
    onChange(
      activeBuckets.map((b) => (b.id === id ? { ...b, mes } : b))
    );
  };

  const removeBucket = (id: string) => {
    onChange(activeBuckets.filter((b) => b.id !== id));
  };

  const addCustomBucket = () => {
    if (!customName.trim()) return;
    const id = `custom-${Date.now()}`;
    const newBucket: HourBucket = {
      id,
      label: customName.trim(),
      hours: 0,
      distributionType: customDist,
      modalidad: customMod,
    };
    onChange([...activeBuckets, newBucket]);
    setCustomName('');
    setShowCustomForm(false);
  };

  // Summary totals by modalidad
  const totalByMod = activeBuckets.reduce<Record<string, number>>((acc, b) => {
    acc[b.modalidad] = (acc[b.modalidad] || 0) + b.hours;
    return acc;
  }, {});
  const grandTotal = activeBuckets.reduce((sum, b) => sum + b.hours, 0);

  return (
    <div className="space-y-3">
      {/* Predefined templates */}
      <div className="space-y-2">
        {BUCKET_TEMPLATES.map((template) => {
          const active = isActive(template.id);
          const bucket = activeBuckets.find((b) => b.id === template.id);

          return (
            <div
              key={template.id}
              className={`border rounded-lg p-3 transition-colors ${
                active ? 'border-yellow-300 bg-yellow-50/50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleBucket(template.id)}
                  className="rounded text-yellow-400 focus:ring-yellow-400"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate block">
                    {template.label}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    DIST_COLORS[template.distributionType]
                  }`}
                >
                  {DIST_LABELS[template.distributionType]}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    MOD_COLORS[template.modalidad]
                  }`}
                >
                  {MOD_LABELS[template.modalidad]}
                </span>
                {active && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-right focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                      value={bucket?.hours ?? 0}
                      onChange={(e) =>
                        updateBucketHours(template.id, parseInt(e.target.value, 10) || 0)
                      }
                    />
                    <span className="text-xs text-gray-400">hrs</span>
                  </div>
                )}
              </div>

              {/* Month picker (bloque only) + Notes (when active) */}
              {active && (
                <div className="mt-2 ml-7 flex gap-2 items-start">
                  {template.distributionType === 'bloque' && (
                    <select
                      className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 focus:ring-1 focus:ring-yellow-400 focus:outline-none w-24 flex-shrink-0"
                      value={bucket?.mes ?? ''}
                      onChange={(e) =>
                        updateBucketMes(template.id, e.target.value ? parseInt(e.target.value, 10) : undefined)
                      }
                    >
                      <option value="">Mes...</option>
                      {MES_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="Notas (opcional)"
                    className="border border-gray-200 rounded px-2 py-1 text-xs flex-1 text-gray-600 focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                    value={bucket?.notes ?? ''}
                    onChange={(e) => updateBucketNotes(template.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom buckets */}
      {customBuckets.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Actividades Personalizadas
          </p>
          {customBuckets.map((bucket) => (
            <div
              key={bucket.id}
              className="border border-yellow-300 bg-yellow-50/50 rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate block">
                    {bucket.label}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    DIST_COLORS[bucket.distributionType]
                  }`}
                >
                  {DIST_LABELS[bucket.distributionType]}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    MOD_COLORS[bucket.modalidad]
                  }`}
                >
                  {MOD_LABELS[bucket.modalidad]}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-right focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                    value={bucket.hours}
                    onChange={(e) =>
                      updateBucketHours(bucket.id, parseInt(e.target.value, 10) || 0)
                    }
                  />
                  <span className="text-xs text-gray-400">hrs</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeBucket(bucket.id)}
                  className="text-red-400 hover:text-red-600 p-1"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-2 flex gap-2 items-start">
                {bucket.distributionType === 'bloque' && (
                  <select
                    className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-600 focus:ring-1 focus:ring-yellow-400 focus:outline-none w-24 flex-shrink-0"
                    value={bucket.mes ?? ''}
                    onChange={(e) =>
                      updateBucketMes(bucket.id, e.target.value ? parseInt(e.target.value, 10) : undefined)
                    }
                  >
                    <option value="">Mes...</option>
                    {MES_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="Notas (opcional)"
                  className="border border-gray-200 rounded px-2 py-1 text-xs flex-1 text-gray-600 focus:ring-1 focus:ring-yellow-400 focus:outline-none"
                  value={bucket.notes ?? ''}
                  onChange={(e) => updateBucketNotes(bucket.id, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add custom bucket */}
      {!showCustomForm ? (
        <button
          type="button"
          onClick={() => setShowCustomForm(true)}
          className="flex items-center gap-2 text-sm text-yellow-700 hover:text-yellow-800 font-medium py-1"
        >
          <Plus size={14} />
          Agregar actividad personalizada
        </button>
      ) : (
        <div className="border border-dashed border-yellow-300 rounded-lg p-3 space-y-2 bg-yellow-50/30">
          <p className="text-xs font-semibold text-gray-600">Nueva actividad personalizada</p>
          <input
            type="text"
            placeholder="Nombre de la actividad"
            className={INPUT_CLASS}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <select
                className={INPUT_CLASS}
                value={customDist}
                onChange={(e) => setCustomDist(e.target.value as DistributionType)}
              >
                <option value="bloque">Taller / Bloque</option>
                <option value="cadencia">Sesiones regulares</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Modalidad</label>
              <select
                className={INPUT_CLASS}
                value={customMod}
                onChange={(e) => setCustomMod(e.target.value as HourBucket['modalidad'])}
              >
                <option value="presencial">Presencial</option>
                <option value="online">Online</option>
                <option value="asincronico">Asincrónico</option>
                <option value="hibrido">Híbrido</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addCustomBucket}
              disabled={!customName.trim()}
              className="text-xs bg-yellow-400 text-gray-900 px-3 py-1.5 rounded-lg font-semibold hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCustomForm(false);
                setCustomName('');
              }}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      {activeBuckets.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-gray-500 font-medium">
              Resumen: <span className="text-gray-900 font-semibold">{grandTotal} hrs</span>
            </span>
            {Object.entries(totalByMod).map(([mod, hrs]) => (
              <span key={mod} className="text-xs text-gray-500">
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-1 ${
                    mod === 'presencial'
                      ? 'bg-yellow-400'
                      : mod === 'online'
                        ? 'bg-indigo-400'
                        : mod === 'asincronico'
                          ? 'bg-gray-400'
                          : 'bg-purple-400'
                  }`}
                />
                {hrs} {MOD_LABELS[mod] || mod}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
