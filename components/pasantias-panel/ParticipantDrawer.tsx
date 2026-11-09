import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import ParticipantForm from '../pasantias-intake/ParticipantForm';
import RosterStatusBadge, { formatInstant } from '../pasantias-intake/RosterStatusBadge';
import { storedDateLabel } from '../../lib/pasantias/participants/dates';
import {
  draftFromParticipant,
  draftToRequestFields,
  draftsEqual,
  validateDraft,
  type ParticipantDraft,
} from '../../lib/pasantias/participants/form';
import { displayRut } from '../../lib/pasantias/participants/rut';
import { FOCUS_LABELS, FUNDING_LABELS } from '../../lib/pasantias/participants/types';
import { PANEL_API, dietaryText, errorText, logisticsBody, readJson } from '../../lib/pasantias/panel/client';
import {
  DESCRIPTION_MAX,
  DOCUMENT_KIND_LABELS,
  FILE_ACCEPT,
  FLIGHT_LABELS,
  FLIGHT_STATUSES,
  LETTER_LINE_MAX,
  LODGING_LABELS,
  LODGING_STATUSES,
  MAX_FILE_BYTES,
  NOTES_MAX,
  SALUTATIONS,
  SALUTATION_LABELS,
  UPLOAD_KINDS,
  letterMissing,
  type FlightStatus,
  type LetterAssetsState,
  type LodgingStatus,
  type Logistics,
  type PanelDetail,
  type PanelRoster,
  type PanelRow,
  type Salutation,
  type UploadKind,
} from '../../lib/pasantias/panel/types';
import { FIELD, PRIMARY, SECONDARY } from './PanelParts';

/** Shown as placeholders only — never saved unless the admin types them. */
const SCHOOL_LINE_EXAMPLE = 'del Colegio Ejemplo de Valdivia, de la Región de Los Ríos, Chile';
const LODGING_LINE_EXAMPLE =
  'la Residencia/Hotel Martí Codolar, ubicada en Av. del Cardenal Vidal i Barraquer, 15, Horta-Guinardó';

interface TrackingDraft {
  flightStatus: FlightStatus;
  lodgingStatus: LodgingStatus;
  depositReceived: boolean;
  balanceReceived: boolean;
  salutation: '' | Salutation;
  notes: string;
}

function trackingFrom(l: Logistics): TrackingDraft {
  return {
    flightStatus: l.flightStatus,
    lodgingStatus: l.lodgingStatus,
    depositReceived: l.depositReceived,
    balanceReceived: l.balanceReceived,
    salutation: l.salutation ?? '',
    notes: l.notes ?? '',
  };
}

function sameTracking(a: TrackingDraft, b: TrackingDraft): boolean {
  return (
    a.flightStatus === b.flightStatus &&
    a.lodgingStatus === b.lodgingStatus &&
    a.depositReceived === b.depositReceived &&
    a.balanceReceived === b.balanceReceived &&
    a.salutation === b.salutation &&
    a.notes === b.notes
  );
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} data-testid={id} className="rounded-lg border border-gray-200 p-4">
      <h3 id={`${id}-title`} className="font-mont text-base font-bold">
        {title}
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Notice({ testId, text, tone = 'info' }: { testId: string; text: string | null; tone?: 'info' | 'error' }) {
  if (!text) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId}
      className={`rounded-md border p-2 text-sm font-medium ${
        tone === 'error' ? 'border-red-300 bg-red-50 text-red-800' : 'border-brand_accent bg-brand_accent/20'
      }`}
    >
      {text}
    </p>
  );
}

type Reset = { tracking?: boolean; letter?: boolean; correction?: boolean };
type Msg = { text: string; tone: 'info' | 'error' } | null;

export default function ParticipantDrawer({
  participantId,
  letterAssets,
  onClose,
  onRowChanged,
}: {
  participantId: string;
  letterAssets: LetterAssetsState;
  onClose: () => void;
  onRowChanged: (row: PanelRow, roster: PanelRoster) => void;
}) {
  const [detail, setDetail] = useState<PanelDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tracking, setTracking] = useState<TrackingDraft | null>(null);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [trackingMsg, setTrackingMsg] = useState<Msg>(null);
  const [trackingErrors, setTrackingErrors] = useState<Record<string, string>>({});

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ParticipantDraft | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [dataMsg, setDataMsg] = useState<Msg>(null);

  const [schoolLine, setSchoolLine] = useState('');
  const [lodgingLine, setLodgingLine] = useState('');
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [linesSaving, setLinesSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [letterMsg, setLetterMsg] = useState<Msg>(null);

  const [kind, setKind] = useState<UploadKind>('ticket');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [docMsg, setDocMsg] = useState<Msg>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = useCallback(
    (next: PanelDetail, reset: Reset) => {
      setDetail(next);
      if (reset.tracking) setTracking(trackingFrom(next.row.logistics));
      if (reset.letter) {
        setSchoolLine(next.roster.details.letterSchoolLine ?? '');
        setLodgingLine(next.roster.details.letterLodgingLine ?? '');
      }
      if (reset.correction) setDraft(draftFromParticipant(next.row.participant));
      onRowChanged(next.row, next.roster);
    },
    [onRowChanged]
  );

  /** Re-reads the traveller; resets only the drafts named, so unsaved typing elsewhere stays. */
  const reload = useCallback(
    async (reset: Reset): Promise<boolean> => {
      try {
        const response = await fetch(`${PANEL_API}/participants/${participantId}`, { cache: 'no-store' });
        const body = await readJson(response);
        if (!response.ok) {
          setLoadError(errorText(response.status, body, 'No pudimos cargar los datos de esta persona.'));
          return false;
        }
        setLoadError(null);
        apply(body as unknown as PanelDetail, reset);
        return true;
      } catch {
        setLoadError('No pudimos conectar. Inténtalo de nuevo.');
        return false;
      }
    },
    [apply, participantId]
  );

  useEffect(() => {
    void reload({ tracking: true, letter: true, correction: true });
    // Runs once per traveller: `reload` changes identity with the parent's callbacks.
  }, [participantId]);

  const base = `${PANEL_API}/participants/${participantId}`;

  /* --------------------------------------------------------------- tracking */

  const saveTracking = async () => {
    if (!detail || !tracking || trackingSaving) return;
    setTrackingSaving(true);
    setTrackingMsg(null);
    setTrackingErrors({});
    try {
      const response = await fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          logisticsBody(detail.row.logistics, {
            ...tracking,
            salutation: tracking.salutation === '' ? null : tracking.salutation,
            notes: tracking.notes.trim() === '' ? null : tracking.notes,
          })
        ),
      });
      const body = await readJson(response);
      if (response.ok) {
        await reload({ tracking: true });
        setTrackingMsg({ text: 'Seguimiento guardado.', tone: 'info' });
        return;
      }
      if (response.status === 409) {
        await reload({ tracking: true });
        setTrackingMsg({ text: errorText(409, body, 'Estos datos cambiaron mientras los editabas.'), tone: 'error' });
        return;
      }
      if (response.status === 422 && body.fields && typeof body.fields === 'object') {
        setTrackingErrors(body.fields as Record<string, string>);
      }
      setTrackingMsg({ text: errorText(response.status, body, 'No pudimos guardar el seguimiento.'), tone: 'error' });
    } catch {
      setTrackingMsg({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setTrackingSaving(false);
    }
  };

  /* ------------------------------------------------------------- correction */

  const saveCorrection = async () => {
    if (!detail || !draft || draftSaving) return;
    const { errors } = validateDraft(draft, detail.roster.program);
    setDraftErrors(errors);
    setDraftNotice(null);
    if (Object.keys(errors).length > 0) {
      setFocusRequest((n) => n + 1);
      return;
    }
    setDraftSaving(true);
    try {
      const response = await fetch(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draftToRequestFields(draft), expectedVersion: detail.row.participant.version }),
      });
      const body = await readJson(response);
      if (response.ok) {
        await reload({ correction: true });
        setEditing(false);
        setDataMsg({ text: 'Datos corregidos. El cambio quedó en el historial.', tone: 'info' });
        return;
      }
      if (response.status === 409 && body.code === 'STALE') {
        await reload({});
        setDraftNotice('El colegio u otra persona cambió estos datos mientras los editabas. Revisa la versión guardada (arriba) y vuelve a guardar si corresponde.');
        return;
      }
      if (body.fields && typeof body.fields === 'object') {
        setDraftErrors(body.fields as Record<string, string>);
        setFocusRequest((n) => n + 1);
      }
      setDraftNotice(errorText(response.status, body, 'No pudimos guardar los datos.'));
    } catch {
      setDraftNotice('No pudimos conectar. Inténtalo de nuevo.');
    } finally {
      setDraftSaving(false);
    }
  };

  /* ----------------------------------------------------------------- letter */

  const saveLines = async () => {
    if (!detail || linesSaving) return;
    setLinesSaving(true);
    setLetterMsg(null);
    setLineErrors({});
    try {
      const response = await fetch(`${PANEL_API}/rosters/${detail.roster.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letterSchoolLine: schoolLine.trim() === '' ? null : schoolLine,
          letterLodgingLine: lodgingLine.trim() === '' ? null : lodgingLine,
          expectedVersion: detail.roster.details.version,
        }),
      });
      const body = await readJson(response);
      if (response.ok) {
        await reload({ letter: true });
        setLetterMsg({ text: `Datos de la carta guardados para ${detail.roster.schoolName}.`, tone: 'info' });
        return;
      }
      if (response.status === 409) await reload({ letter: true });
      if (response.status === 422 && body.fields && typeof body.fields === 'object') {
        setLineErrors(body.fields as Record<string, string>);
      }
      setLetterMsg({ text: errorText(response.status, body, 'No pudimos guardar los datos de la carta.'), tone: 'error' });
    } catch {
      setLetterMsg({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setLinesSaving(false);
    }
  };

  const generateLetter = async () => {
    if (!detail || generating) return;
    setGenerating(true);
    setLetterMsg(null);
    try {
      const response = await fetch(`${base}/letter`, { method: 'POST' });
      const body = await readJson(response);
      if (response.status === 201) {
        await reload({});
        setLetterMsg({ text: 'Carta generada y guardada en los documentos de esta persona.', tone: 'info' });
        return;
      }
      setLetterMsg({ text: errorText(response.status, body, 'No pudimos generar la carta.'), tone: 'error' });
    } catch {
      setLetterMsg({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  /* -------------------------------------------------------------- documents */

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (uploading) return;
    const file = fileRef.current?.files?.[0];
    setDocMsg(null);
    if (!file) {
      setUploadErrors({ file: 'Elige un archivo para subir.' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadErrors({ file: 'El archivo supera el máximo de 4 MB.' });
      return;
    }
    setUploadErrors({});
    setUploading(true);
    try {
      const form = new FormData();
      form.append('kind', kind);
      if (description.trim() !== '') form.append('description', description);
      form.append('file', file);
      const response = await fetch(`${base}/documents`, { method: 'POST', body: form });
      const body = await readJson(response);
      if (response.status === 201) {
        setDescription('');
        if (fileRef.current) fileRef.current.value = '';
        await reload({});
        setDocMsg({ text: 'Documento subido.', tone: 'info' });
        return;
      }
      if (body.fields && typeof body.fields === 'object') setUploadErrors(body.fields as Record<string, string>);
      setDocMsg({ text: errorText(response.status, body, 'No pudimos subir el documento.'), tone: 'error' });
    } catch {
      setDocMsg({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const download = async (docId: string) => {
    if (docBusy) return;
    setDocBusy(docId);
    setDocMsg(null);
    try {
      const response = await fetch(`${PANEL_API}/documents/${docId}`, { cache: 'no-store' });
      const body = await readJson(response);
      if (!response.ok || typeof body.url !== 'string') {
        setDocMsg({ text: errorText(response.status, body, 'No pudimos abrir el documento.'), tone: 'error' });
        return;
      }
      // The signed URL answers `Content-Disposition: attachment`, so this downloads without leaving the page.
      const link = document.createElement('a');
      link.href = body.url;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setDocMsg({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setDocBusy(null);
    }
  };

  const remove = async (docId: string) => {
    if (docBusy) return;
    setDocBusy(docId);
    setDocMsg(null);
    try {
      const response = await fetch(`${PANEL_API}/documents/${docId}`, { method: 'DELETE' });
      const body = await readJson(response);
      if (!response.ok && response.status !== 404) {
        setDocMsg({ text: errorText(response.status, body, 'No pudimos eliminar el documento.'), tone: 'error' });
        return;
      }
      setConfirmRemove(null);
      await reload({});
      setDocMsg({ text: 'Documento eliminado.', tone: 'info' });
    } catch {
      setDocMsg({ text: 'No pudimos conectar. Inténtalo de nuevo.', tone: 'error' });
    } finally {
      setDocBusy(null);
    }
  };

  /* ----------------------------------------------------------------- render */

  const p = detail?.row.participant;
  const roster = detail?.roster;
  const fullName = p ? `${p.firstNames} ${p.lastNames}` : 'Pasante';
  const storedTracking = detail ? trackingFrom(detail.row.logistics) : null;
  const trackingDirty = Boolean(tracking && storedTracking && !sameTracking(tracking, storedTracking));
  const linesDirty = Boolean(
    roster &&
      (schoolLine.trim() !== (roster.details.letterSchoolLine ?? '') ||
        lodgingLine.trim() !== (roster.details.letterLodgingLine ?? ''))
  );
  const missing = detail ? letterMissing(detail.row.logistics, detail.roster.details, letterAssets) : [];

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="panel-drawer">
        <DialogHeader>
          <DialogTitle className="font-mont text-xl" data-testid="panel-drawer-title">
            {fullName}
          </DialogTitle>
          <DialogDescription>
            {roster ? `${roster.schoolName} · ${roster.programName}` : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>

        {loadError ? <Notice testId="panel-drawer-error" text={loadError} tone="error" /> : null}
        {!detail || !p || !roster || !tracking ? (
          loadError ? null : (
            <p className="flex items-center gap-2 text-sm text-gray-700" data-testid="panel-drawer-loading">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
            </p>
          )
        ) : (
          <div className="space-y-4">
            <Section id="panel-section-data" title="Datos enviados por el colegio">
              <Notice testId="panel-data-msg" text={dataMsg?.text ?? null} tone={dataMsg?.tone} />
              {editing && draft ? (
                <>
                  <p className="text-sm text-gray-700">
                    Estás corrigiendo datos que ingresó el colegio. El cambio queda registrado con tu nombre y el
                    colegio lo verá la próxima vez que abra su nómina.
                  </p>
                  <ParticipantForm
                    program={roster.program}
                    mode="edit"
                    draft={draft}
                    errors={draftErrors}
                    saving={draftSaving}
                    dirty={!draftsEqual(draft, draftFromParticipant(p))}
                    justSaved={false}
                    notice={draftNotice}
                    focusRequest={focusRequest}
                    onChange={setDraft}
                    onSubmit={() => void saveCorrection()}
                    onCancel={() => {
                      setEditing(false);
                      setDraft(draftFromParticipant(p));
                      setDraftErrors({});
                      setDraftNotice(null);
                    }}
                  />
                </>
              ) : (
                <>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2" data-testid="panel-data-view">
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">RUT</dt>
                      <dd data-testid="panel-data-rut">{displayRut(p.rut)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">Pasaporte</dt>
                      <dd data-testid="panel-data-passport">{p.passportNumber ?? 'Sin indicar'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">Llegada a Barcelona</dt>
                      <dd>{storedDateLabel(roster.program, 'arrival', p.arrivalDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">Regreso desde Barcelona</dt>
                      <dd>{storedDateLabel(roster.program, 'departure', p.departureDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">Foco</dt>
                      <dd>{p.focus ? FOCUS_LABELS[p.focus] : 'Sin indicar'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">Alimentación</dt>
                      <dd>{dietaryText(p)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">Costos (según el colegio)</dt>
                      <dd>
                        {roster.schoolFunding
                          ? `Pasajes: ${FUNDING_LABELS[roster.schoolFunding.flightsFunding]} · Estadía: ${FUNDING_LABELS[roster.schoolFunding.lodgingFunding]}`
                          : 'Sin definir por el colegio'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-600">Nómina del colegio</dt>
                      <dd>
                        <RosterStatusBadge roster={roster} testId="panel-data-roster-status" /> · Última edición{' '}
                        {formatInstant(p.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    data-testid="panel-data-edit"
                    onClick={() => {
                      setDraft(draftFromParticipant(p));
                      setDraftErrors({});
                      setDraftNotice(null);
                      setDataMsg(null);
                      setEditing(true);
                    }}
                    className={SECONDARY}
                  >
                    Corregir datos
                  </button>
                </>
              )}
            </Section>

            <Section id="panel-section-tracking" title="Seguimiento FNE">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="panel-tracking-flight" className="block text-sm font-semibold">
                    Pasaje aéreo
                  </label>
                  <select
                    id="panel-tracking-flight"
                    data-testid="panel-tracking-flight"
                    value={tracking.flightStatus}
                    onChange={(e) => setTracking({ ...tracking, flightStatus: e.target.value as FlightStatus })}
                    className={`mt-1 ${FIELD}`}
                  >
                    {FLIGHT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {FLIGHT_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="panel-tracking-lodging" className="block text-sm font-semibold">
                    Alojamiento
                  </label>
                  <select
                    id="panel-tracking-lodging"
                    data-testid="panel-tracking-lodging"
                    value={tracking.lodgingStatus}
                    onChange={(e) => setTracking({ ...tracking, lodgingStatus: e.target.value as LodgingStatus })}
                    className={`mt-1 ${FIELD}`}
                  >
                    {LODGING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {LODGING_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-semibold">Pago del programa</legend>
                  <div className="mt-1 flex flex-wrap gap-4">
                    <label className="flex min-h-[40px] items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        data-testid="panel-tracking-deposit"
                        checked={tracking.depositReceived}
                        onChange={(e) => setTracking({ ...tracking, depositReceived: e.target.checked })}
                        className="h-5 w-5 accent-brand_primary"
                      />
                      Abono 50% recibido
                    </label>
                    <label className="flex min-h-[40px] items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        data-testid="panel-tracking-balance"
                        checked={tracking.balanceReceived}
                        onChange={(e) => setTracking({ ...tracking, balanceReceived: e.target.checked })}
                        className="h-5 w-5 accent-brand_primary"
                      />
                      Saldo 50% recibido
                    </label>
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="panel-tracking-salutation" className="block text-sm font-semibold">
                    Tratamiento en la carta
                  </label>
                  <select
                    id="panel-tracking-salutation"
                    data-testid="panel-tracking-salutation"
                    value={tracking.salutation}
                    onChange={(e) => setTracking({ ...tracking, salutation: e.target.value as TrackingDraft['salutation'] })}
                    className={`mt-1 ${FIELD}`}
                  >
                    <option value="">Sin indicar</option>
                    {SALUTATIONS.map((s) => (
                      <option key={s} value={s}>
                        {SALUTATION_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="panel-tracking-notes" className="block text-sm font-semibold">
                    Notas internas
                  </label>
                  <textarea
                    id="panel-tracking-notes"
                    data-testid="panel-tracking-notes"
                    rows={3}
                    maxLength={NOTES_MAX * 2}
                    value={tracking.notes}
                    onChange={(e) => setTracking({ ...tracking, notes: e.target.value })}
                    aria-invalid={Boolean(trackingErrors.notes)}
                    className={`mt-1 ${FIELD}`}
                  />
                  <p className="mt-1 text-xs text-gray-600">Solo las ve el equipo FNE. Máximo {NOTES_MAX} caracteres.</p>
                  {trackingErrors.notes ? <p className="mt-1 text-sm text-red-700">{trackingErrors.notes}</p> : null}
                </div>
              </div>
              <Notice testId="panel-tracking-msg" text={trackingMsg?.text ?? null} tone={trackingMsg?.tone} />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  data-testid="panel-tracking-save"
                  onClick={() => void saveTracking()}
                  disabled={!trackingDirty || trackingSaving}
                  className={PRIMARY}
                >
                  {trackingSaving ? 'Guardando…' : 'Guardar seguimiento'}
                </button>
                {trackingDirty ? <span className="text-sm font-semibold text-brand_accent_text">Cambios sin guardar</span> : null}
              </div>
            </Section>

            <Section id="panel-section-letter" title="Carta de invitación">
              <p className="text-sm text-gray-700">
                Estos dos textos valen para todas las personas de {roster.schoolName} ({roster.programName}).
              </p>
              <div>
                <label htmlFor="panel-letter-school" className="block text-sm font-semibold">
                  Colegio, como aparece en la carta
                </label>
                <p id="panel-letter-school-hint" className="text-xs text-gray-600">
                  Completa la frase «…como parte del equipo ____». Ej.: {SCHOOL_LINE_EXAMPLE}
                </p>
                <input
                  id="panel-letter-school"
                  data-testid="panel-letter-school"
                  type="text"
                  maxLength={LETTER_LINE_MAX * 2}
                  value={schoolLine}
                  onChange={(e) => setSchoolLine(e.target.value)}
                  aria-describedby="panel-letter-school-hint"
                  aria-invalid={Boolean(lineErrors.letterSchoolLine)}
                  className={`mt-1 ${FIELD}`}
                />
                {lineErrors.letterSchoolLine ? <p className="mt-1 text-sm text-red-700">{lineErrors.letterSchoolLine}</p> : null}
              </div>
              <div>
                <label htmlFor="panel-letter-lodging" className="block text-sm font-semibold">
                  Alojamiento, como aparece en la carta
                </label>
                <p id="panel-letter-lodging-hint" className="text-xs text-gray-600">
                  Completa la frase «Usted se estará hospedando en ____». Ej.: {LODGING_LINE_EXAMPLE}
                </p>
                <input
                  id="panel-letter-lodging"
                  data-testid="panel-letter-lodging"
                  type="text"
                  maxLength={LETTER_LINE_MAX * 2}
                  value={lodgingLine}
                  onChange={(e) => setLodgingLine(e.target.value)}
                  aria-describedby="panel-letter-lodging-hint"
                  aria-invalid={Boolean(lineErrors.letterLodgingLine)}
                  className={`mt-1 ${FIELD}`}
                />
                {lineErrors.letterLodgingLine ? <p className="mt-1 text-sm text-red-700">{lineErrors.letterLodgingLine}</p> : null}
              </div>
              <button
                type="button"
                data-testid="panel-letter-save-lines"
                onClick={() => void saveLines()}
                disabled={!linesDirty || linesSaving}
                className={SECONDARY}
              >
                {linesSaving ? 'Guardando…' : 'Guardar datos de la carta'}
              </button>
              {missing.length > 0 ? (
                <p className="text-sm text-gray-800" data-testid="panel-letter-missing">
                  Para generar la carta falta: {missing.join('; ')}.
                </p>
              ) : null}
              <Notice testId="panel-letter-msg" text={letterMsg?.text ?? null} tone={letterMsg?.tone} />
              <button
                type="button"
                data-testid="panel-letter-generate"
                onClick={() => void generateLetter()}
                disabled={missing.length > 0 || generating || linesDirty || trackingDirty}
                className={PRIMARY}
              >
                {generating ? 'Generando…' : detail.row.hasLetter ? 'Generar una carta nueva' : 'Generar carta de invitación'}
              </button>
              {missing.length === 0 && (linesDirty || trackingDirty) ? (
                <p className="text-xs text-gray-600">Guarda los cambios pendientes antes de generar la carta.</p>
              ) : null}
            </Section>

            <Section id="panel-section-documents" title="Documentos">
              <Notice testId="panel-doc-msg" text={docMsg?.text ?? null} tone={docMsg?.tone} />
              {detail.documents.length === 0 ? (
                <p className="text-sm text-gray-700" data-testid="panel-doc-empty">
                  Aún no hay documentos de esta persona.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100" data-testid="panel-doc-list">
                  {detail.documents.map((doc) => (
                    <li key={doc.id} data-testid={`panel-doc-${doc.id}`} data-kind={doc.kind} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold">
                          {DOCUMENT_KIND_LABELS[doc.kind]}
                          {doc.description ? ` · ${doc.description}` : ''}
                        </p>
                        <p className="break-all text-xs text-gray-700">
                          {doc.fileName} · {fileSize(doc.sizeBytes)} · {formatInstant(doc.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid={`panel-doc-download-${doc.id}`}
                          onClick={() => void download(doc.id)}
                          disabled={docBusy !== null}
                          className={SECONDARY}
                        >
                          Descargar
                        </button>
                        {confirmRemove === doc.id ? (
                          <>
                            <button
                              type="button"
                              data-testid={`panel-doc-remove-confirm-${doc.id}`}
                              onClick={() => void remove(doc.id)}
                              disabled={docBusy !== null}
                              className={`${SECONDARY} border-red-300 text-red-800`}
                            >
                              Sí, eliminar
                            </button>
                            <button
                              type="button"
                              data-testid={`panel-doc-remove-cancel-${doc.id}`}
                              onClick={() => setConfirmRemove(null)}
                              disabled={docBusy !== null}
                              className={SECONDARY}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            data-testid={`panel-doc-remove-${doc.id}`}
                            onClick={() => setConfirmRemove(doc.id)}
                            disabled={docBusy !== null}
                            className={`${SECONDARY} text-red-800`}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <form noValidate onSubmit={(e) => void upload(e)} className="grid grid-cols-1 gap-3 rounded-md bg-gray-50 p-3 sm:grid-cols-2" data-testid="panel-doc-form">
                <div>
                  <label htmlFor="panel-doc-kind" className="block text-sm font-semibold">
                    Tipo de documento
                  </label>
                  <select
                    id="panel-doc-kind"
                    data-testid="panel-doc-kind"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as UploadKind)}
                    className={`mt-1 ${FIELD}`}
                  >
                    {UPLOAD_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {DOCUMENT_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="panel-doc-description" className="block text-sm font-semibold">
                    Descripción (opcional)
                  </label>
                  <input
                    id="panel-doc-description"
                    data-testid="panel-doc-description"
                    type="text"
                    maxLength={DESCRIPTION_MAX * 2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    aria-invalid={Boolean(uploadErrors.description)}
                    className={`mt-1 ${FIELD}`}
                  />
                  {uploadErrors.description ? <p className="mt-1 text-sm text-red-700">{uploadErrors.description}</p> : null}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="panel-doc-file" className="block text-sm font-semibold">
                    Archivo
                  </label>
                  <input
                    id="panel-doc-file"
                    data-testid="panel-doc-file"
                    ref={fileRef}
                    type="file"
                    accept={FILE_ACCEPT}
                    aria-describedby="panel-doc-file-hint"
                    aria-invalid={Boolean(uploadErrors.file)}
                    className="mt-1 block w-full text-sm"
                  />
                  <p id="panel-doc-file-hint" className="mt-1 text-xs text-gray-600">
                    PDF o imagen (JPG, PNG, WebP), hasta 4 MB. Solo el equipo FNE puede verlo.
                  </p>
                  {uploadErrors.file ? (
                    <p className="mt-1 text-sm text-red-700" data-testid="panel-doc-file-error">
                      {uploadErrors.file}
                    </p>
                  ) : null}
                </div>
                <div>
                  <button type="submit" data-testid="panel-doc-upload" disabled={uploading} className={PRIMARY}>
                    {uploading ? 'Subiendo…' : 'Subir documento'}
                  </button>
                </div>
              </form>
            </Section>

            <Section id="panel-section-activity" title="Historial">
              {detail.activity.length === 0 ? (
                <p className="text-sm text-gray-700" data-testid="panel-activity-empty">
                  Aún no hay cambios registrados.
                </p>
              ) : (
                <ol className="space-y-2" data-testid="panel-activity-list">
                  {detail.activity.map((entry) => (
                    <li key={entry.id} className="text-sm" data-testid="panel-activity-item" data-action={entry.action}>
                      <p className="text-xs text-gray-600">
                        {formatInstant(entry.createdAt)} · {entry.actorName}
                      </p>
                      {entry.lines.map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
