import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import IntakeShell from '../../components/pasantias-intake/IntakeShell';
import ParticipantForm from '../../components/pasantias-intake/ParticipantForm';
import ParticipantList from '../../components/pasantias-intake/ParticipantList';
import RosterStatusBadge, { formatInstant } from '../../components/pasantias-intake/RosterStatusBadge';
import { PRIVACY_POLICY_PATH } from '../../lib/pasantias/consent';
import {
  intakeRequest,
  newClientRequestId,
  readTokenFromHash,
  type IntakeResponse,
} from '../../lib/pasantias/participants/client';
import { programDateRangeLabel } from '../../lib/pasantias/participants/dates';
import {
  draftFromParticipant,
  draftMatchesParticipant,
  draftToRequestFields,
  draftsEqual,
  emptyDraft,
  validateDraft,
  type ParticipantDraft,
} from '../../lib/pasantias/participants/form';
import {
  INTAKE_ACKNOWLEDGEMENT_TEXT,
  INTAKE_PURPOSE_TEXT,
} from '../../lib/pasantias/participants/notice';
import {
  ROSTER_MAX_PARTICIPANTS,
  rosterDisplayStatus,
  type CoordinatorRoster,
  type IntakeParticipant,
} from '../../lib/pasantias/participants/types';
import type { FieldErrors } from '../../lib/pasantias/participants/validation';

/**
 * /pasantias/nomina — a school coordinator fills in the roster of people
 * travelling to the January 2027 pasantía, through the private link FNE sent
 * (`#k=<token>`).
 *
 * The server render carries nothing: no school, no participant, only the shell
 * (FIRST §5). The token is read from the fragment after load and left there,
 * so a reload or bookmark still works; it travels to our own API only, as
 * `Authorization: Intake <token>`. Referrer is `no-referrer` on this page.
 *
 * Saving: each create attempt has one `clientRequestId`, reused by every retry
 * of that attempt, so a double click or a lost response never creates two
 * rows. When the server answers with a row that differs from what was typed (a
 * replayed create or a STALE edit), the stored row is shown in the list and the
 * typed values stay in the form to be saved deliberately (plan r2).
 *
 * "Enviar nómina a FNE" sends no e-mail: the roster is marked as sent and is
 * available to the FNE team. Any later edit reopens it until it is sent again.
 */

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return { props: {} };
};

const API = '/api/pasantias/participants';

type Phase = 'loading' | 'missing' | 'unavailable' | 'ready' | 'error';

interface Editor {
  mode: 'create' | 'edit';
  participantId: string | null;
  expectedVersion: number | null;
  /** One per create attempt; kept across retries until the server confirms. */
  clientRequestId: string | null;
  draft: ParticipantDraft;
  /** What "no unsaved changes" means for this editor. */
  baseline: ParticipantDraft;
  errors: FieldErrors;
  notice: string | null;
}

interface Banner {
  kind: 'success' | 'error' | 'info';
  text: string;
}

const UNAVAILABLE_TEXT = 'Enlace incompleto o no disponible — contacta a FNE.';

function newCreateEditor(): Editor {
  return {
    mode: 'create',
    participantId: null,
    expectedVersion: null,
    clientRequestId: newClientRequestId(),
    draft: emptyDraft(),
    baseline: emptyDraft(),
    errors: {},
    notice: null,
  };
}

function editEditor(participant: IntakeParticipant): Editor {
  const draft = draftFromParticipant(participant);
  return {
    mode: 'edit',
    participantId: participant.id,
    expectedVersion: participant.version,
    clientRequestId: null,
    draft,
    baseline: draft,
    errors: {},
    notice: null,
  };
}

function upsert(list: IntakeParticipant[], participant: IntakeParticipant): IntakeParticipant[] {
  const index = list.findIndex((p) => p.id === participant.id);
  if (index === -1) return [...list, participant];
  const next = list.slice();
  next[index] = participant;
  return next;
}

function fieldErrorsFrom(body: Record<string, unknown>): FieldErrors {
  const fields = body.fields;
  if (!fields || typeof fields !== 'object') return {};
  const out: FieldErrors = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export default function NominaPage() {
  const tokenRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const finalizingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roster, setRoster] = useState<CoordinatorRoster | null>(null);
  const [participants, setParticipants] = useState<IntakeParticipant[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const ackRef = useRef<HTMLInputElement>(null);

  const dirty = editor ? !draftsEqual(editor.draft, editor.baseline) : false;

  /** Answers shared by every call; returns true when it handled the response. */
  const handleCommon = useCallback((response: IntakeResponse): boolean => {
    if (response.network) {
      setBanner({
        kind: 'error',
        text: 'No pudimos conectar. Tus datos siguen en el formulario; inténtalo de nuevo.',
      });
      return true;
    }
    const code = response.body.code;
    if (response.status === 401 && code === 'LINK_UNAVAILABLE') {
      setPhase('unavailable');
      return true;
    }
    if (response.status === 401 || response.status === 403) {
      // A GENERA session cookie in this browser was refused by the platform
      // (expired session, or a password change pending). Not the link.
      setBanner({
        kind: 'error',
        text: 'Tu sesión de GENERA en este navegador no es válida. Recarga la página e inténtalo de nuevo.',
      });
      return true;
    }
    if (response.status === 429) {
      setBanner({ kind: 'error', text: 'Demasiadas solicitudes seguidas. Espera un minuto e inténtalo de nuevo.' });
      return true;
    }
    if (response.status === 413) {
      setBanner({ kind: 'error', text: 'La ficha es demasiado grande. Acorta los textos e inténtalo de nuevo.' });
      return true;
    }
    if (response.status >= 500) {
      setBanner({
        kind: 'error',
        text: 'No pudimos completar la operación. Tus datos siguen en el formulario; inténtalo de nuevo.',
      });
      return true;
    }
    return false;
  }, []);

  const load = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    const response = await intakeRequest(token, 'GET', API);
    if (!response.network && response.status === 200) {
      const nextRoster = response.body.roster as CoordinatorRoster;
      const nextParticipants = (response.body.participants as IntakeParticipant[]) ?? [];
      setRoster(nextRoster);
      setParticipants(nextParticipants);
      setPhase('ready');
      setLoadError(null);
      return { roster: nextRoster, participants: nextParticipants };
    }
    if (!response.network && response.status === 401 && response.body.code === 'LINK_UNAVAILABLE') {
      setPhase('unavailable');
      return null;
    }
    setLoadError(
      response.network
        ? 'No pudimos conectar con FNE. Revisa tu conexión y recarga la página.'
        : response.status === 401 || response.status === 403
          ? 'Tu sesión de GENERA en este navegador no es válida. Recarga la página.'
          : 'No pudimos cargar la nómina. Recarga la página.'
    );
    setPhase((current) => (current === 'ready' ? current : 'error'));
    return null;
  }, []);

  useEffect(() => {
    const token = readTokenFromHash(window.location.hash);
    if (!token) {
      setPhase('missing');
      return;
    }
    tokenRef.current = token;
    void load().then((data) => {
      if (data && data.participants.length === 0) setEditor(newCreateEditor());
    });
  }, [load]);

  // Warn before leaving with a ficha that is not saved.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Applies the roster a save answered with; true when that save reopened a sent roster. */
  const applyRoster = (next: CoordinatorRoster | null | undefined, previous: CoordinatorRoster | null): boolean => {
    if (!next) return false;
    setRoster(next);
    return previous?.status === 'submitted' && next.status === 'open';
  };
  const REOPENED_SUFFIX = ' La nómina volvió a edición; envíala nuevamente.';

  const showInvalid = (errors: FieldErrors) => {
    const count = Object.keys(errors).length;
    setBanner({
      kind: 'error',
      text: count === 1 ? 'Revisa el campo marcado.' : `Revisa los ${count} campos marcados.`,
    });
    setFocusRequest((n) => n + 1);
  };

  const save = async () => {
    if (!editor || !roster || savingRef.current) return;
    const token = tokenRef.current;
    if (!token) return;

    const { errors } = validateDraft(editor.draft, roster.program);
    const missingAck = !acknowledged;
    setAckError(missingAck ? 'Debes confirmar la declaración antes de guardar.' : null);
    if (Object.keys(errors).length > 0 || missingAck) {
      setEditor({ ...editor, errors });
      if (Object.keys(errors).length > 0) showInvalid(errors);
      else {
        setBanner({ kind: 'error', text: 'Confirma la declaración antes de guardar.' });
        ackRef.current?.focus();
      }
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setBanner(null);
    const current = editor;
    const fields = draftToRequestFields(current.draft);
    try {
      const response =
        current.mode === 'create'
          ? await intakeRequest(token, 'POST', API, {
              ...fields,
              clientRequestId: current.clientRequestId,
              acknowledged: true,
            })
          : await intakeRequest(token, 'PUT', `${API}/${current.participantId}`, {
              ...fields,
              expectedVersion: current.expectedVersion,
              acknowledged: true,
            });

      if (!response.network && (response.status === 200 || response.status === 201)) {
        const saved = response.body.participant as IntakeParticipant;
        setParticipants((list) => upsert(list, saved));
        const reopened = applyRoster(response.body.roster as CoordinatorRoster, roster);
        const replayed = response.body.replayed === true;

        if (current.mode === 'create' && replayed && !draftMatchesParticipant(current.draft, saved, roster.program)) {
          // An earlier attempt with this id was already stored with other
          // values. Show what is stored; keep what was typed, as an edit.
          setEditor({
            mode: 'edit',
            participantId: saved.id,
            expectedVersion: saved.version,
            clientRequestId: null,
            draft: current.draft,
            baseline: draftFromParticipant(saved),
            errors: {},
            notice:
              'Esta ficha ya se había guardado antes con otros datos (la versión guardada aparece en la lista). ' +
              'Tus cambios siguen aquí: revísalos y pulsa «Guardar cambios».',
          });
          return;
        }

        setEditor(null);
        if (replayed) {
          // Nothing was written: no new row, no new acknowledgement, no reopen.
          // Say what is actually stored, not that a save just happened.
          setJustSaved(false);
          setBanner({
            kind: 'info',
            text:
              current.mode === 'edit'
                ? `No había cambios: la ficha de ${saved.firstNames} ${saved.lastNames} sigue igual y no se registró nada nuevo.`
                : `La ficha de ${saved.firstNames} ${saved.lastNames} ya estaba guardada con estos datos; no se registró nada nuevo.`,
          });
          return;
        }
        setJustSaved(true);
        setBanner({
          kind: 'success',
          text: `Ficha de ${saved.firstNames} ${saved.lastNames} guardada.` + (reopened ? REOPENED_SUFFIX : ''),
        });
        return;
      }

      if (handleCommon(response)) return;

      const code = response.body.code;
      if (response.status === 409 && code === 'STALE' && current.mode === 'edit') {
        const stored = response.body.current as IntakeParticipant | undefined;
        if (stored) {
          setParticipants((list) => upsert(list, stored));
          if (draftMatchesParticipant(current.draft, stored, roster.program)) {
            // The stored row already holds exactly this (e.g. a retry whose
            // first response was lost). THIS request wrote nothing, so it is
            // reported as the stored state, not as a fresh save.
            setEditor(null);
            setJustSaved(false);
            setBanner({
              kind: 'info',
              text: `La ficha de ${stored.firstNames} ${stored.lastNames} ya tenía estos datos guardados; no se registró nada nuevo.`,
            });
            void load();
            return;
          }
          setEditor({
            ...current,
            expectedVersion: stored.version,
            baseline: draftFromParticipant(stored),
            errors: {},
            notice:
              'Esta ficha cambió en otra ventana o dispositivo (la versión guardada aparece en la lista). ' +
              'Tus cambios siguen aquí: revísalos y guarda de nuevo.',
          });
          void load();
        }
        return;
      }
      if (response.status === 409 && code === 'DUPLICATE_RUT') {
        const errorsFromServer = { rut: String(response.body.error ?? 'Este RUT ya está en la nómina.') };
        setEditor({ ...current, errors: errorsFromServer });
        showInvalid(errorsFromServer);
        return;
      }
      if (response.status === 422 && code === 'VALIDATION') {
        const fieldErrors = fieldErrorsFrom(response.body);
        if (fieldErrors.acknowledged) {
          setAckError(fieldErrors.acknowledged);
          delete fieldErrors.acknowledged;
        }
        setEditor({ ...current, errors: fieldErrors });
        if (Object.keys(fieldErrors).length > 0) showInvalid(fieldErrors);
        else setBanner({ kind: 'error', text: String(response.body.error ?? 'Revisa la ficha.') });
        return;
      }
      if (response.status === 422 && code === 'ROSTER_FULL') {
        setBanner({ kind: 'error', text: String(response.body.error) });
        return;
      }
      if (response.status === 404) {
        setEditor(null);
        setBanner({ kind: 'error', text: 'Esa ficha ya no está en esta nómina. Actualizamos la lista.' });
        void load();
        return;
      }
      setBanner({ kind: 'error', text: 'No pudimos guardar la ficha. Inténtalo de nuevo.' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!roster || finalizingRef.current) return;
    const token = tokenRef.current;
    if (!token) return;
    if (dirty) {
      setBanner({ kind: 'error', text: 'Guarda o cancela la ficha abierta antes de enviar la nómina.' });
      return;
    }
    finalizingRef.current = true;
    setFinalizing(true);
    setBanner(null);
    try {
      const response = await intakeRequest(token, 'POST', `${API}/finalize`, {
        expectedRosterVersion: roster.version,
      });
      if (!response.network && response.status === 200) {
        const next = response.body.roster as CoordinatorRoster | null;
        if (next) setRoster(next);
        else void load();
        setEditor(null);
        setBanner({
          kind: 'success',
          text: 'Nómina enviada a FNE. Ya está disponible para el equipo FNE.',
        });
        return;
      }
      if (handleCommon(response)) return;
      if (response.status === 409) {
        await load();
        setBanner({
          kind: 'error',
          text: 'La nómina cambió mientras la revisabas. Revisa la lista y envíala otra vez.',
        });
        return;
      }
      if (response.status === 422 && response.body.code === 'EMPTY_ROSTER') {
        setBanner({ kind: 'error', text: String(response.body.error) });
        return;
      }
      setBanner({ kind: 'error', text: 'No pudimos enviar la nómina. Inténtalo de nuevo.' });
    } finally {
      finalizingRef.current = false;
      setFinalizing(false);
    }
  };

  const openCreate = () => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
    setJustSaved(false);
    setEditor(newCreateEditor());
  };

  const openEdit = (participant: IntakeParticipant) => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
    setJustSaved(false);
    setEditor(editEditor(participant));
  };

  const cancelEditor = () => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
    setEditor(null);
  };

  const head = (
    <Head>
      <title>Nómina de pasantes · Fundación Nueva Educación</title>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
    </Head>
  );

  if (phase !== 'ready' || !roster) {
    const message =
      phase === 'missing' || phase === 'unavailable'
        ? UNAVAILABLE_TEXT
        : phase === 'error'
          ? loadError ?? 'No pudimos cargar la nómina. Recarga la página.'
          : 'Cargando nómina…';
    return (
      <>
        {head}
        <IntakeShell>
          <div
            role={phase === 'loading' ? 'status' : 'alert'}
            data-testid={`intake-state-${phase}`}
            className="mx-auto max-w-xl rounded-lg border border-gray-200 p-6 text-center"
          >
            <h1 className="font-mont text-xl font-bold">Nómina de pasantes</h1>
            <p className="mt-3 text-base">{message}</p>
          </div>
        </IntakeShell>
      </>
    );
  }

  const display = rosterDisplayStatus(roster);
  const full = participants.length >= ROSTER_MAX_PARTICIPANTS;
  const canFinalize = participants.length > 0 && roster.status === 'open' && !dirty && !finalizing;

  return (
    <>
      {head}
      <IntakeShell>
        <section aria-labelledby="intake-title" className="space-y-4">
          <div className="rounded-lg border-l-4 border-brand_accent bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-700">{roster.programName}</p>
            <h1 id="intake-title" className="font-mont text-2xl font-bold" data-testid="intake-school">
              {roster.schoolName}
            </h1>
            <p className="mt-1 text-sm text-gray-700">
              Programa del {programDateRangeLabel(roster.program)} · Enlace válido hasta{' '}
              {formatInstant(roster.expiresAt)}
            </p>
          </div>

          <div
            data-testid="intake-roster-status"
            data-status={display}
            className={`rounded-lg border p-4 ${
              display === 'submitted'
                ? 'border-brand_primary bg-brand_primary text-white'
                : display === 'reopened'
                  ? 'border-brand_accent bg-brand_accent/20'
                  : 'border-gray-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <RosterStatusBadge roster={roster} />
              <p className="font-semibold">
                {display === 'submitted'
                  ? `Enviada a FNE el ${formatInstant(roster.submittedAt)}`
                  : display === 'reopened'
                    ? 'La nómina volvió a edición; envíala nuevamente'
                    : 'Borrador: aún no se ha enviado a FNE'}
              </p>
            </div>
            <p className={`mt-1 text-sm ${display === 'submitted' ? 'text-white/90' : 'text-gray-700'}`}>
              {display === 'submitted'
                ? 'La nómina está disponible para el equipo FNE. No se envían correos. Si corriges una ficha, la nómina vuelve a edición y deberás enviarla otra vez.'
                : display === 'reopened'
                  ? `Se envió por última vez el ${formatInstant(roster.lastSubmittedAt)}. Tras los cambios, envíala nuevamente para que FNE vea la versión final.`
                  : 'Guarda cada ficha y, cuando la nómina esté completa, pulsa «Enviar nómina a FNE».'}
            </p>
          </div>

          <div
            role="status"
            aria-live="polite"
            data-testid="intake-live"
            data-kind={banner?.kind ?? 'none'}
            className={
              banner
                ? `rounded-md border p-3 text-sm font-medium ${
                    banner.kind === 'error'
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : banner.kind === 'success'
                        ? 'border-green-300 bg-green-50 text-green-900'
                        : 'border-brand_accent bg-brand_accent/20'
                  }`
                : 'sr-only'
            }
          >
            {banner?.text ?? ''}
          </div>

          <div className="rounded-lg border border-gray-200 p-4 text-sm">
            <p>{INTAKE_PURPOSE_TEXT}</p>
            <p className="mt-2">
              <a
                href={PRIVACY_POLICY_PATH}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="intake-privacy-link"
                className="font-semibold text-brand_accent_text underline"
              >
                Política de Privacidad
              </a>
            </p>
            <label className="mt-3 flex items-start gap-2">
              <input
                ref={ackRef}
                type="checkbox"
                data-testid="intake-ack"
                checked={acknowledged}
                onChange={(e) => {
                  setAcknowledged(e.target.checked);
                  if (e.target.checked) setAckError(null);
                }}
                aria-invalid={Boolean(ackError)}
                aria-describedby={ackError ? 'intake-error-ack' : undefined}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand_primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent"
              />
              <span>
                {INTAKE_ACKNOWLEDGEMENT_TEXT}
                <span className="ml-0.5 text-red-700" aria-hidden="true">
                  ★
                </span>
              </span>
            </label>
            {ackError ? (
              <p id="intake-error-ack" data-testid="intake-error-acknowledged" className="mt-1 font-medium text-red-700">
                {ackError}
              </p>
            ) : null}
          </div>
        </section>

        <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
          <section aria-labelledby="intake-list-title" className="order-2 lg:order-1 lg:col-span-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="intake-list-title" className="font-mont text-xl font-bold">
                Personas guardadas{' '}
                <span className="text-base font-semibold text-gray-600" data-testid="intake-count">
                  ({participants.length}/{ROSTER_MAX_PARTICIPANTS})
                </span>
              </h2>
              <button
                type="button"
                data-testid="intake-add"
                onClick={openCreate}
                disabled={saving || full || editor?.mode === 'create'}
                className="min-h-[40px] rounded-md bg-brand_accent px-3 py-1.5 text-sm font-semibold text-brand_primary hover:bg-brand_accent_hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Agregar persona
              </button>
            </div>
            <ParticipantList
              participants={participants}
              program={roster.program}
              editingId={editor?.mode === 'edit' ? editor.participantId : null}
              disabled={saving}
              onEdit={openEdit}
            />
            <div className="mt-4 rounded-lg border border-gray-200 p-4">
              <button
                type="button"
                data-testid="intake-finalize"
                onClick={() => void finalize()}
                disabled={!canFinalize}
                className="min-h-[44px] w-full rounded-md bg-brand_primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand_gray_dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {finalizing ? 'Enviando…' : roster.status === 'submitted' ? 'Nómina enviada' : 'Enviar nómina a FNE'}
              </button>
              <p className="mt-2 text-xs text-gray-600">
                {dirty
                  ? 'Guarda o cancela la ficha abierta antes de enviar.'
                  : 'Al enviar, la nómina queda disponible para el equipo FNE. No se envían correos.'}
              </p>
            </div>
          </section>

          <section className="order-1 lg:order-2 lg:col-span-7">
            {editor ? (
              <div className="rounded-lg border-2 border-brand_primary p-4">
                <ParticipantForm
                  program={roster.program}
                  mode={editor.mode}
                  draft={editor.draft}
                  errors={editor.errors}
                  saving={saving}
                  dirty={dirty}
                  justSaved={justSaved}
                  notice={editor.notice}
                  focusRequest={focusRequest}
                  onChange={(draft) => {
                    setJustSaved(false);
                    setEditor((current) => (current ? { ...current, draft } : current));
                  }}
                  onSubmit={() => void save()}
                  onCancel={cancelEditor}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                <p className="text-base" data-testid="intake-editor-closed">
                  {justSaved ? (
                    <span data-testid="intake-save-state" data-state="saved" className="font-semibold">
                      Guardado.{' '}
                    </span>
                  ) : null}
                  {full
                    ? `La nómina tiene el máximo de ${ROSTER_MAX_PARTICIPANTS} personas.`
                    : 'Pulsa «Agregar persona» para completar una nueva ficha, o «Editar» en una persona guardada.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </IntakeShell>
    </>
  );
}
