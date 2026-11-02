import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import IntakeShell from '../../components/pasantias-intake/IntakeShell';
import ParticipantForm, { RequiredMark } from '../../components/pasantias-intake/ParticipantForm';
import ParticipantList from '../../components/pasantias-intake/ParticipantList';
import RosterStatusBadge, { formatInstant } from '../../components/pasantias-intake/RosterStatusBadge';
import SchoolDataForm from '../../components/pasantias-intake/SchoolDataForm';
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
  schoolDraftFromFunding,
  schoolDraftMatchesFunding,
  schoolDraftsEqual,
  validateDraft,
  validateSchoolDraft,
  type ParticipantDraft,
  type SchoolDraft,
} from '../../lib/pasantias/participants/form';
import {
  INTAKE_ACKNOWLEDGEMENT_TEXT,
  INTAKE_PURPOSE_TEXT,
} from '../../lib/pasantias/participants/notice';
import {
  FUNDING_LABELS,
  ROSTER_MAX_PARTICIPANTS,
  rosterDisplayStatus,
  type CoordinatorRoster,
  type IntakeParticipant,
  type SchoolFunding,
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
 * Two sections (F01): "Datos del colegio" — Pasajes and Estadía, answered once
 * for this roster — and "Pasantes". Until the school's answer is saved, adding,
 * editing and sending are disabled with the reason shown; sending is also
 * disabled while the school section has unsaved changes.
 *
 * Saving: each create attempt has one `clientRequestId`, reused by every retry
 * of that attempt, so a double click or a lost response never creates two
 * rows. When the server answers with a row that differs from what was typed (a
 * replayed create or a STALE edit), the stored row is shown in the list and the
 * typed values stay in the form to be saved deliberately (plan r2). The same
 * holds for the school's answer on a STALE funding save.
 *
 * "Enviar nómina a FNE" sends no e-mail: the roster is marked as sent and is
 * available to the FNE team. Any later edit — a participant or the school's
 * funding — reopens it until it is sent again.
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
const SCHOOL_REQUIRED_TEXT =
  'Primero guarda los datos del colegio (Pasajes y Estadía) para agregar o editar pasantes y enviar la nómina.';

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

function fundingText(funding: SchoolFunding): string {
  return `Pasajes: ${FUNDING_LABELS[funding.flightsFunding]} · Estadía: ${FUNDING_LABELS[funding.lodgingFunding]}`;
}

export default function NominaPage() {
  const tokenRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const finalizingRef = useRef(false);
  const schoolSavingRef = useRef(false);
  const lastSchoolBaseline = useRef<SchoolDraft | null>(null);

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

  // F01 — "Datos del colegio".
  const [schoolDraft, setSchoolDraft] = useState<SchoolDraft>(schoolDraftFromFunding(null));
  const [schoolErrors, setSchoolErrors] = useState<FieldErrors>({});
  const [schoolSaving, setSchoolSaving] = useState(false);
  const [schoolJustSaved, setSchoolJustSaved] = useState(false);
  const [schoolNotice, setSchoolNotice] = useState<string | null>(null);
  const [schoolFocusRequest, setSchoolFocusRequest] = useState(0);

  const dirty = editor ? !draftsEqual(editor.draft, editor.baseline) : false;
  const schoolFunding = roster?.schoolFunding ?? null;
  const fundingSaved = schoolFunding !== null;
  const schoolBaseline = schoolDraftFromFunding(schoolFunding);
  const schoolDirty = roster ? !schoolDraftsEqual(schoolDraft, schoolBaseline) : false;

  // Follow the saved answer (load, save, a reply carrying a newer roster) unless
  // the coordinator has unsaved choices of their own, which are kept.
  useEffect(() => {
    const next = schoolDraftFromFunding(schoolFunding);
    const previous = lastSchoolBaseline.current;
    lastSchoolBaseline.current = next;
    setSchoolDraft((current) => (previous === null || schoolDraftsEqual(current, previous) ? next : current));
  }, [schoolFunding?.version, schoolFunding?.flightsFunding, schoolFunding?.lodgingFunding]);

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
      // A first ficha opens by itself only once the school's data exists.
      if (data && data.participants.length === 0 && data.roster.schoolFunding) setEditor(newCreateEditor());
    });
  }, [load]);

  /**
   * FX-2: one coordinator write at a time on this page — school funding,
   * participant save and finalize are mutually serialized. Each handler sets
   * its own ref synchronously before its first await, so this check also stops
   * a second action dispatched in the same event turn (before React re-renders
   * the disabled controls). Serializing keeps replies in order: a late reply
   * from an earlier write can no longer overwrite the roster a later write
   * already answered with. Cross-tab conflicts are still resolved by the
   * optimistic versions (STALE), unchanged.
   */
  const anyWriteInFlight = (): boolean =>
    savingRef.current || schoolSavingRef.current || finalizingRef.current;

  /** The same rule for rendering: every write control is disabled while any write is in flight. */
  const writeBusy = saving || schoolSaving || finalizing;

  // Warn before leaving with a ficha or the school's data not saved.
  useEffect(() => {
    if (!dirty && !schoolDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, schoolDirty]);

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

  /* ---------------------------------------------------- Datos del colegio */

  const saveSchool = async () => {
    if (!roster || anyWriteInFlight()) return;
    const token = tokenRef.current;
    if (!token) return;

    const errors = validateSchoolDraft(schoolDraft);
    setSchoolErrors(errors);
    if (Object.keys(errors).length > 0) {
      setBanner({ kind: 'error', text: 'Elige Pasajes y Estadía antes de guardar los datos del colegio.' });
      setSchoolFocusRequest((n) => n + 1);
      return;
    }

    schoolSavingRef.current = true;
    setSchoolSaving(true);
    setBanner(null);
    setSchoolNotice(null);
    const previous = roster;
    const draft = schoolDraft;
    try {
      const response = await intakeRequest(token, 'PUT', `${API}/school`, {
        flightsFunding: draft.flightsFunding,
        lodgingFunding: draft.lodgingFunding,
        expectedFundingVersion: previous.schoolFunding?.version ?? null,
      });

      if (!response.network && response.status === 200) {
        const next = response.body.roster as CoordinatorRoster;
        const reopened = applyRoster(next, previous);
        if (response.body.replayed === true) {
          // Nothing was written: say what is stored, not that a save happened.
          setSchoolJustSaved(false);
          setBanner({
            kind: 'info',
            text: 'Los datos del colegio ya estaban guardados con estos valores; no se registró nada nuevo.',
          });
        } else {
          setSchoolJustSaved(true);
          setBanner({ kind: 'success', text: 'Datos del colegio guardados.' + (reopened ? REOPENED_SUFFIX : '') });
        }
        if (!previous.schoolFunding && participants.length === 0 && !editor) setEditor(newCreateEditor());
        return;
      }

      if (handleCommon(response)) return;

      const code = response.body.code;
      if (response.status === 409 && code === 'STALE') {
        const current = response.body.current as CoordinatorRoster | undefined;
        if (current) {
          setRoster(current);
          setSchoolJustSaved(false);
          if (schoolDraftMatchesFunding(draft, current.schoolFunding)) {
            setBanner({
              kind: 'info',
              text: 'Los datos del colegio ya tenían estos valores guardados; no se registró nada nuevo.',
            });
          } else {
            const stored = current.schoolFunding ? fundingText(current.schoolFunding) : 'sin datos guardados';
            setSchoolNotice(
              `Los datos del colegio cambiaron en otra ventana o dispositivo. Guardado ahora: ${stored}. ` +
                'Tus cambios siguen aquí: revísalos y guarda de nuevo.'
            );
          }
        }
        return;
      }
      if (response.status === 422 && code === 'VALIDATION') {
        const fields = fieldErrorsFrom(response.body);
        const mapped: FieldErrors = {};
        if (fields.flightsFunding) mapped.flightsFunding = fields.flightsFunding;
        if (fields.lodgingFunding) mapped.lodgingFunding = fields.lodgingFunding;
        setSchoolErrors(mapped);
        setBanner({ kind: 'error', text: String(response.body.error ?? 'Revisa los datos del colegio.') });
        setSchoolFocusRequest((n) => n + 1);
        return;
      }
      setBanner({ kind: 'error', text: 'No pudimos guardar los datos del colegio. Inténtalo de nuevo.' });
    } finally {
      schoolSavingRef.current = false;
      setSchoolSaving(false);
    }
  };

  /* ------------------------------------------------------------- Pasantes */

  const save = async () => {
    if (!editor || !roster || anyWriteInFlight()) return;
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
      if (response.status === 422 && code === 'SCHOOL_DATA_MISSING') {
        // F01: the school's answer is not saved (e.g. another tab's view).
        setBanner({ kind: 'error', text: SCHOOL_REQUIRED_TEXT });
        void load();
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
    if (!roster || anyWriteInFlight()) return;
    const token = tokenRef.current;
    if (!token) return;
    if (!fundingSaved) {
      setBanner({ kind: 'error', text: SCHOOL_REQUIRED_TEXT });
      return;
    }
    if (dirty || schoolDirty) {
      setBanner({
        kind: 'error',
        text: 'Guarda o cancela los cambios abiertos (ficha o datos del colegio) antes de enviar la nómina.',
      });
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
      if (response.status === 422 && response.body.code === 'SCHOOL_DATA_MISSING') {
        setBanner({ kind: 'error', text: SCHOOL_REQUIRED_TEXT });
        void load();
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
  const canFinalize =
    participants.length > 0 && roster.status === 'open' && fundingSaved && !dirty && !schoolDirty && !writeBusy;

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
                ? 'La nómina está disponible para el equipo FNE. No se envían correos. Si corriges una ficha o los datos del colegio, la nómina vuelve a edición y deberás enviarla otra vez.'
                : display === 'reopened'
                  ? `Se envió por última vez el ${formatInstant(roster.lastSubmittedAt)}. Tras los cambios, envíala nuevamente para que FNE vea la versión final.`
                  : 'Guarda los datos del colegio y cada ficha y, cuando la nómina esté completa, pulsa «Enviar nómina a FNE».'}
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
                aria-required="true"
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand_primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent"
              />
              <span>
                {INTAKE_ACKNOWLEDGEMENT_TEXT}
                <RequiredMark />
              </span>
            </label>
            {ackError ? (
              <p id="intake-error-ack" data-testid="intake-error-acknowledged" className="mt-1 font-medium text-red-700">
                {ackError}
              </p>
            ) : null}
          </div>

          {/* FX-2: while another coordinator write is in flight, the school
              section's controls are disabled (native fieldset), matching the
              handler guard. Its own "Guardando…" still reflects only its own save. */}
          <fieldset
            disabled={saving || finalizing}
            data-testid="intake-school-fieldset"
            className="m-0 min-w-0 border-0 p-0"
          >
            <SchoolDataForm
              schoolName={roster.schoolName}
              programName={roster.programName}
              draft={schoolDraft}
              errors={schoolErrors}
              saving={schoolSaving}
              dirty={schoolDirty}
              saved={fundingSaved}
              justSaved={schoolJustSaved}
              notice={schoolNotice}
              focusRequest={schoolFocusRequest}
              onChange={(draft) => {
                setSchoolJustSaved(false);
                setSchoolDraft(draft);
              }}
              onSubmit={() => void saveSchool()}
            />
          </fieldset>
        </section>

        <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
          <section aria-labelledby="intake-list-title" className="order-2 lg:order-1 lg:col-span-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="intake-list-title" className="font-mont text-xl font-bold">
                Pasantes{' '}
                <span className="text-base font-semibold text-gray-600" data-testid="intake-count">
                  ({participants.length}/{ROSTER_MAX_PARTICIPANTS})
                </span>
              </h2>
              <button
                type="button"
                data-testid="intake-add"
                onClick={openCreate}
                disabled={!fundingSaved || writeBusy || full || editor?.mode === 'create'}
                className="min-h-[40px] rounded-md bg-brand_accent px-3 py-1.5 text-sm font-semibold text-brand_primary hover:bg-brand_accent_hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Agregar persona
              </button>
            </div>
            {!fundingSaved ? (
              <p
                data-testid="intake-school-required"
                className="mb-3 rounded-md border border-brand_accent bg-brand_accent/20 p-3 text-sm font-medium"
              >
                {SCHOOL_REQUIRED_TEXT}
              </p>
            ) : null}
            <ParticipantList
              participants={participants}
              program={roster.program}
              editingId={editor?.mode === 'edit' ? editor.participantId : null}
              disabled={writeBusy || !fundingSaved}
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
              <p className="mt-2 text-xs text-gray-600" data-testid="intake-finalize-hint">
                {!fundingSaved
                  ? 'Guarda los datos del colegio antes de enviar.'
                  : schoolDirty
                    ? 'Guarda o descarta los cambios en los datos del colegio antes de enviar.'
                    : dirty
                      ? 'Guarda o cancela la ficha abierta antes de enviar.'
                      : 'Al enviar, la nómina queda disponible para el equipo FNE. No se envían correos.'}
              </p>
            </div>
          </section>

          <section className="order-1 lg:order-2 lg:col-span-7">
            {editor ? (
              <div className="rounded-lg border-2 border-brand_primary p-4">
                {/* FX-2: the ficha's controls are disabled while a school save or
                    a send is in flight, matching the handler guard. */}
                <fieldset
                  disabled={schoolSaving || finalizing}
                  data-testid="intake-form-fieldset"
                  className="m-0 min-w-0 border-0 p-0"
                >
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
                </fieldset>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                <p className="text-base" data-testid="intake-editor-closed">
                  {justSaved ? (
                    <span data-testid="intake-save-state" data-state="saved" className="font-semibold">
                      Guardado.{' '}
                    </span>
                  ) : null}
                  {!fundingSaved
                    ? 'Guarda primero los datos del colegio; luego podrás agregar pasantes.'
                    : full
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
