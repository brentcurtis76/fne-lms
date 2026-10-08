import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, UserCheck, X } from 'lucide-react';

/**
 * Registros del equipo directivo (migration 20261008120000).
 *
 * One row per vía whose registros go to ONE Equipo Directivo person per school
 * (today Liderazgo and Propósito). The person doing the Contexto Transversal
 * assignments picks that person here; every published template of the vía is
 * then created for them as a school-level registro.
 *
 * - Asignar: first pick.
 * - Reemplazar: allowed only while none of the vía's registros has been
 *   started; otherwise the server refuses and names them.
 * - Reenviar: delivers templates published after the pick (and repairs a
 *   missing or read-only access). Never recreates a cancelled registro.
 *
 * Read-only viewers (consultores) see the rows without actions.
 */

interface Person {
  id: string;
  name: string;
  email: string | null;
}

interface ViaRow {
  area: string;
  label: string;
  templates: { id: string; name: string }[];
  responsible: (Person & { assignedAt: string }) | null;
  pendingTemplates: { id: string; name: string }[];
}

interface Detail {
  templateName: string;
  outcome: 'created' | 'attached' | 'already_exists' | 'cancelled' | 'archived';
}

type ModalState = { via: ViaRow; mode: 'assign' | 'replace' } | null;

const OUTCOME_LABELS: Record<Detail['outcome'], string> = {
  created: 'creado',
  attached: 'entregado',
  already_exists: 'ya estaba asignado',
  cancelled: 'cancelado (no se vuelve a crear)',
  archived: 'archivado',
};

function summarize(details: Detail[]): string {
  if (details.length === 0) return 'No hay templates publicados en esta vía todavía.';
  return details.map((d) => `${d.templateName}: ${OUTCOME_LABELS[d.outcome] ?? d.outcome}`).join(' · ');
}

export default function ViaResponsiblesSection({ schoolId }: { schoolId: number }) {
  const [vias, setVias] = useState<ViaRow[]>([]);
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ message: string; templates?: string[] } | null>(null);
  const [notice, setNotice] = useState<{ label: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch(`/api/school/transversal-context/via-responsibles?school_id=${schoolId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(data.error || 'No se pudieron cargar los registros del equipo directivo.');
        return;
      }
      setVias(data.vias ?? []);
      setCandidates(data.candidates ?? []);
      setCanWrite(data.canWrite === true);
    } catch {
      setLoadError('No se pudieron cargar los registros del equipo directivo.');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    setLoading(true);
    setVias([]);
    setNotice(null);
    load();
  }, [load]);

  const submit = async (via: ViaRow, mode: 'assign' | 'replace', userId: string) => {
    setSaving(via.area);
    setActionError(null);
    try {
      const response = await fetch('/api/school/transversal-context/via-responsibles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, area: via.area, user_id: userId, mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError({ message: data.error || 'No se pudo completar la asignación.', templates: data.templates });
        return false;
      }
      const verb = data.mode === 'replaced' ? 'Responsable reemplazado' : data.mode === 'resent' ? 'Registros reenviados' : 'Responsable asignado';
      setNotice({ label: via.label, message: `${verb}. ${summarize(data.details ?? [])}` });
      await load();
      return true;
    } catch {
      setActionError({ message: 'No se pudo completar la asignación.' });
      return false;
    } finally {
      setSaving(null);
    }
  };

  const openModal = (via: ViaRow, mode: 'assign' | 'replace') => {
    setModal({ via, mode });
    setSelected('');
    setActionError(null);
  };

  const confirmModal = async () => {
    if (!modal || !selected) return;
    const ok = await submit(modal.via, modal.mode, selected);
    if (ok) setModal(null);
  };

  if (loading) {
    return (
      <div className="bg-white shadow-md rounded-lg p-6 mt-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-brand_primary" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white shadow-md rounded-lg p-4 mt-6 text-sm text-red-700" data-testid="via-responsibles-error">
        {loadError}
      </div>
    );
  }

  if (vias.length === 0) return null;

  const modalCandidates = modal
    ? candidates.filter((c) => c.id !== modal.via.responsible?.id)
    : [];

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden mt-6" data-testid="via-responsibles-section">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-brand_primary">Registros del equipo directivo</h3>
        <p className="text-sm text-brand_primary/60">
          Estas vías las responde una persona del equipo directivo de la escuela, no el docente de cada curso.
        </p>
      </div>

      {notice && (
        <div className="mx-4 mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" data-testid="via-responsibles-notice">
          <strong>{notice.label}:</strong> {notice.message}
          <button className="ml-2 underline" onClick={() => setNotice(null)}>Cerrar</button>
        </div>
      )}
      {actionError && !modal && (
        <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="via-responsibles-action-error">
          {actionError.message}
          {actionError.templates && actionError.templates.length > 0 && <> ({actionError.templates.join(', ')})</>}
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {vias.map((via) => (
          <li key={via.area} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-testid={`via-row-${via.area}`}>
            <div className="min-w-0">
              <p className="font-medium text-brand_primary">{via.label}</p>
              <p className="text-sm text-brand_primary/70">
                {via.responsible ? (
                  <>
                    <UserCheck className="inline w-4 h-4 mr-1 text-green-600" />
                    {via.responsible.name}
                    {via.responsible.email ? <span className="text-brand_primary/50"> · {via.responsible.email}</span> : null}
                  </>
                ) : (
                  'Sin responsable asignado'
                )}
              </p>
              <p className="text-xs text-brand_primary/50">
                {via.templates.length === 0
                  ? 'Aún no hay templates publicados en esta vía.'
                  : `${via.templates.length} template${via.templates.length === 1 ? '' : 's'} publicado${via.templates.length === 1 ? '' : 's'}`}
                {via.responsible && via.pendingTemplates.length > 0 && (
                  <span className="text-amber-700" data-testid={`via-pending-${via.area}`}>
                    {' '}· {via.pendingTemplates.length} pendiente{via.pendingTemplates.length === 1 ? '' : 's'} de entregar
                  </span>
                )}
              </p>
            </div>

            {canWrite && (
              <div className="flex gap-2 shrink-0">
                {!via.responsible ? (
                  <button
                    data-testid={`via-assign-${via.area}`}
                    onClick={() => openModal(via, 'assign')}
                    disabled={saving !== null}
                    className="px-3 py-1.5 text-sm bg-brand_primary text-white rounded-lg hover:bg-brand_primary/90 disabled:opacity-50"
                  >
                    Asignar
                  </button>
                ) : (
                  <>
                    <button
                      data-testid={`via-resend-${via.area}`}
                      onClick={() => submit(via, 'assign', via.responsible!.id)}
                      disabled={saving !== null}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {saving === via.area ? 'Enviando…' : 'Reenviar'}
                    </button>
                    <button
                      data-testid={`via-replace-${via.area}`}
                      onClick={() => openModal(via, 'replace')}
                      disabled={saving !== null}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Reemplazar
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full" role="dialog" aria-labelledby="via-modal-title">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 id="via-modal-title" className="text-lg font-semibold text-brand_primary">
                {modal.mode === 'assign' ? 'Asignar responsable' : 'Reemplazar responsable'} · {modal.via.label}
              </h3>
              <button data-testid="via-modal-close" onClick={() => setModal(null)} className="p-1 hover:bg-brand_beige rounded">
                <X className="w-5 h-5 text-brand_primary/60" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-brand_primary/70">
                {modal.mode === 'assign'
                  ? 'Elija a la persona del equipo directivo que responderá los registros de esta vía.'
                  : 'Solo es posible mientras la persona actual no haya comenzado ningún registro de esta vía.'}
              </p>
              {modalCandidates.length === 0 ? (
                <p className="text-sm text-brand_primary/60">No hay otras personas activas en el equipo directivo de esta escuela.</p>
              ) : (
                <select
                  data-testid="via-modal-select"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_accent text-brand_primary"
                >
                  <option value="">-- Seleccionar --</option>
                  {modalCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.email ? ` (${c.email})` : ''}
                    </option>
                  ))}
                </select>
              )}
              {actionError && (
                <p className="text-sm text-red-700" data-testid="via-modal-error">
                  {actionError.message}
                  {actionError.templates && actionError.templates.length > 0 && <> ({actionError.templates.join(', ')})</>}
                </p>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-brand_primary/70 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button
                data-testid="via-modal-confirm"
                onClick={confirmModal}
                disabled={!selected || saving !== null}
                className="px-4 py-2 text-sm bg-brand_primary text-white rounded-lg hover:bg-brand_primary/90 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : modal.mode === 'assign' ? 'Asignar' : 'Reemplazar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
