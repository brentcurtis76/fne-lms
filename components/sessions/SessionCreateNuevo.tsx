import React from 'react';
import { Calendar, Save, Send } from 'lucide-react';
import { Button, Checkbox, ConfirmDialog, Field, Input, Notice, PageHeader, Radio, Select, Textarea } from '../ui/kit';
import type { SessionCreate, SessionCreateDecisions } from '../../hooks/useSessionCreate';
import { CREATE_FIELD_IDS, formChecks, type CreateCheckFailure, type CreateCheckKey } from './sessionCreateChecks';
import { SectionNuevo } from './create-nuevo/SectionNuevo';
import { ConsultantsNuevo } from './create-nuevo/ConsultantsNuevo';
import { RecurrenceNuevo } from './create-nuevo/RecurrenceNuevo';
import { HoursNuevo } from './create-nuevo/HoursNuevo';
import { FIELD_ROW, ROW_FIELD } from './create-nuevo/fieldRow';
import { SummaryNuevo, summaryFacts } from './create-nuevo/SummaryNuevo';
import {
  CHECKS_TITLE,
  DRAFTS_LEFT_TEXT,
  HOUR_PAIR_REFUSAL,
  MODALITY_LABELS,
  splitConfirmText,
  type DraftsLeft,
} from './create-nuevo/createNuevoText';

/**
 * Send-back B9, point 3: the date and time fields keep their own width (the browser does not narrow
 * them below their content), so their row takes as many columns of at least 11rem as fit and wraps
 * the rest to further rows. Every row of fields keeps its boxes in line (create-nuevo/fieldRow).
 */

/**
 * The new look's admin form «Programar Sesión» (redesign 6, release SB), drawn by
 * `pages/admin/sessions/create.tsx` when `useLook()` answers `nuevo`. It reads the SAME
 * `useSessionCreate()` result and the SAME decisions as today's view (`SessionCreateClasico`): the
 * same fields with today's names, labels, placeholders and defaults, the same handlers, the same data
 * calls and request bodies (draft through `handleSaveDraft`, «Programar» through the hook's
 * `scheduleConfirmedSession`, the part of today's handler after its question).
 *
 * Approved with the mock-up (inventory 06-sesiones.md, the form's list), in this view only:
 *  1. A real form: Enter in a text field opens the confirmation, a pop-up («Cancelar» and the page's
 *     own «Programar …» label) in place of the browser's question; Enter in a text area makes a line;
 *     every other button is `type="button"`.
 *  2. All failed checks at once (`formChecks`, today's order and words), in a box at the top with a
 *     link to each field and the same message beside the field; no toast for them and no request.
 *     They are worked out at each press of «Programar» or «Guardar borrador» (and Enter), not live.
 *  3. When «Programar» created the session(s) and the approval then failed: today's error toast AND a
 *     notice that the drafts exist.
 *  4. When the server refuses «Programar» because only one of «Tipo de Hora» and «Contrato» was
 *     chosen: today's toast AND the server's message under the two selects, until either changes.
 * And as shown: six numbered cards, the «Resumen» card with the buttons and a small «Cancelar» to
 * /admin/sessions, «Híbrida», the series box without blue, the hours with a decimal comma.
 */
export default function SessionCreateNuevo({
  sessionCreate,
  decisions,
}: {
  sessionCreate: SessionCreate;
  decisions: SessionCreateDecisions;
}) {
  const {
    schools,
    communities,
    formData,
    facilitators,
    isRecurring,
    recurrenceFrequency,
    recurrenceCount,
    customDates,
    previewDates,
    selectedHourTypeKey,
    selectedContratoId,
    submitting,
    handleInputChange,
    handleModalityChange,
    handleSaveDraft,
    scheduleConfirmedSession,
    scheduleConfirmText,
    chooseSingleSession,
    chooseRecurringSeries,
    handleZoomManagedChange,
  } = sessionCreate;
  const {
    zoomManagedAvailable,
    spainTimePreview,
    communitySelectDisabled,
    showConsultants,
    earliestDate,
    showRecurrence,
    showMeetingFields,
    showZoomManagedHelp,
    showManualMeetingFields,
    showLocation,
    showSeriesCountInButtons,
    draftDisabled,
    scheduleDisabled,
  } = decisions;

  // The failed checks of the last press; the pop-up; the drafts notice; which button is working.
  const [failures, setFailures] = React.useState<CreateCheckFailure[]>([]);
  const [presses, setPresses] = React.useState(0);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [draftsLeft, setDraftsLeft] = React.useState<DraftsLeft | null>(null);
  const [working, setWorking] = React.useState<'draft' | 'schedule' | null>(null);
  // The server's refusal of a half-chosen hours pair, shown under the two selects until either changes.
  const [pairRefusal, setPairRefusal] = React.useState<string | null>(null);
  const checksRef = React.useRef<HTMLDivElement>(null);
  const draftsRef = React.useRef<HTMLDivElement>(null);

  // Send-back B10, point 3: a field's errors go as soon as that field is changed (beside it and in the
  // box; the box goes with its last line). Nothing is checked while typing: errors only appear at a press.
  const clearFailures = React.useCallback((keys: CreateCheckKey[]) => {
    setFailures((current) => {
      const left = current.filter((f) => !keys.includes(f.key));
      return left.length === current.length ? current : left;
    });
  }, []);
  const facilitatorsKey = facilitators.map((f) => `${f.user_id}:${f.facilitator_role}:${f.is_lead ? 1 : 0}`).join('|');
  const customDatesKey = customDates.join('|');
  React.useEffect(() => clearFailures(['school']), [formData.school_id, clearFailures]);
  React.useEffect(() => clearFailures(['community']), [formData.growth_community_id, clearFailures]);
  React.useEffect(() => clearFailures(['title']), [formData.title, clearFailures]);
  React.useEffect(() => clearFailures(['date']), [formData.session_date, clearFailures]);
  // Both time checks read both times, so a change of either time clears both.
  React.useEffect(() => clearFailures(['times', 'endAfterStart']), [formData.start_time, formData.end_time, clearFailures]);
  React.useEffect(() => clearFailures(['meetingLink']), [formData.meeting_link, clearFailures]);
  React.useEffect(() => clearFailures(['location']), [formData.location, clearFailures]);
  React.useEffect(() => clearFailures(['facilitators', 'lead']), [facilitatorsKey, clearFailures]);
  React.useEffect(() => clearFailures(['customDates']), [customDatesKey, clearFailures]);
  React.useEffect(() => clearFailures(['recurrenceCount']), [recurrenceCount, clearFailures]);

  // The facilitators' two errors sit by the facilitators' field while it is drawn (a school is chosen),
  // else by «Colegio».
  const placed = failures.map((f) =>
    f.key === 'facilitators' || f.key === 'lead'
      ? { ...f, fieldId: showConsultants ? CREATE_FIELD_IDS.consultants : CREATE_FIELD_IDS.school }
      : f
  );
  const messagesFor = (fieldId: string) => placed.filter((f) => f.fieldId === fieldId).map((f) => f.message);
  const messageFor = (fieldId: string) => {
    const found = messagesFor(fieldId);
    return found.length > 0 ? found.join(' · ') : undefined;
  };

  /** The checks, at a press: true when none failed. A refused press brings the box into sight. */
  const passesChecks = () => {
    const found = formChecks({ formData, facilitators, isRecurring, recurrenceFrequency, recurrenceCount, customDates });
    setFailures(found);
    setPresses((n) => n + 1);
    return found.length === 0;
  };

  React.useEffect(() => {
    if (presses === 0) return;
    const box = checksRef.current;
    if (!box) return;
    if (typeof box.scrollIntoView === 'function') box.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    box.focus({ preventScroll: true });
  }, [presses]);

  // How many times the pair of hours selects has changed. A refusal answers the pair as it was sent: when
  // the pair has changed since (even back to the same values), the refusal is ignored.
  const pairChanges = React.useRef(0);
  React.useEffect(() => {
    pairChanges.current += 1;
    setPairRefusal(null);
  }, [selectedHourTypeKey, selectedContratoId]);

  React.useEffect(() => {
    const notice = draftsRef.current;
    if (!draftsLeft || !notice || typeof notice.scrollIntoView !== 'function') return;
    notice.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }, [draftsLeft]);

  // Enter in a text field, or «Programar sesión»: the checks, then the pop-up.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (scheduleDisabled) return;
    if (!passesChecks()) return;
    setConfirmOpen(true);
  };

  const onDraft = () => {
    if (!passesChecks()) return;
    setDraftsLeft(null);
    setWorking('draft');
    handleSaveDraft();
  };

  const onConfirm = () => {
    setConfirmOpen(false);
    setDraftsLeft(null);
    setWorking('schedule');
    setPairRefusal(null);
    const kind: DraftsLeft = isRecurring ? 'serie' : 'una';
    const onlyOneChosen = Boolean(selectedHourTypeKey) !== Boolean(selectedContratoId);
    const pairSent = pairChanges.current;
    scheduleConfirmedSession({
      onDraftsLeft: () => setDraftsLeft(kind),
      onCreateRefused: (message) => {
        if (pairChanges.current !== pairSent) return;
        if (onlyOneChosen && message === HOUR_PAIR_REFUSAL) setPairRefusal(message);
      },
    });
  };

  const sessionCount = isRecurring ? previewDates.length : 1;
  const question = splitConfirmText(scheduleConfirmText(sessionCount));
  const scheduleLabel = showSeriesCountInButtons() ? `Programar serie (${previewDates.length} sesiones)` : 'Programar sesión';
  const draftLabel = showSeriesCountInButtons()
    ? `Guardar serie como borrador (${previewDates.length} sesiones)`
    : 'Guardar borrador';
  const facts = summaryFacts(sessionCreate);

  return (
    <div className="px-4 pb-10 pt-[18px] lg:px-7 lg:pt-6" data-testid="session-create-nuevo">
      <div className="mx-auto grid max-w-[1180px] gap-5">
        <PageHeader
          icon={<Calendar className="h-6 w-6" />}
          title="Programar Sesión"
          description="Crear una nueva sesión de consultoría para una comunidad de crecimiento"
        />

        <form
          noValidate
          onSubmit={onSubmit}
          aria-labelledby="create-session-form-title"
          className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_344px]"
          data-testid="session-create-nuevo-form"
        >
          <span id="create-session-form-title" className="sr-only">
            Programar Sesión
          </span>
          <div className="grid min-w-0 gap-4">
            <p className="text-[0.8125rem] text-gray-600">* Campos obligatorios</p>

            {failures.length > 0 && (
              <Notice
                ref={checksRef}
                tone="error"
                tabIndex={-1}
                title={CHECKS_TITLE}
                className="scroll-mt-24 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent"
                data-testid="session-create-nuevo-checks"
              >
                <ul className="mt-1 grid list-disc gap-[2px] pl-[1.1em]">
                  {placed.map((failure) => (
                    <li key={failure.key}>
                      <a
                        href={`#${failure.fieldId}`}
                        onClick={(e) => {
                          e.preventDefault();
                          moveTo(failure.fieldId);
                        }}
                        className="text-red-600 underline decoration-red-600/45 underline-offset-2 hover:decoration-red-600"
                      >
                        {failure.message}
                      </a>
                    </li>
                  ))}
                </ul>
              </Notice>
            )}

            {draftsLeft && (
              <Notice ref={draftsRef} tone="warning" className="scroll-mt-24" data-testid="session-create-nuevo-drafts-left">
                {DRAFTS_LEFT_TEXT[draftsLeft]}
              </Notice>
            )}

            {/* 1 · school, community, consultants */}
            <SectionNuevo id="create-session-s1" n={1} title="Colegio y consultores">
              <div className={`${FIELD_ROW} grid-cols-[minmax(0,1fr)] md:grid-cols-2`}>
                <Field label="Colegio" required error={messageFor(CREATE_FIELD_IDS.school)} className={ROW_FIELD}>
                  <Select
                    id={CREATE_FIELD_IDS.school}
                    name="school_id"
                    value={formData.school_id}
                    onChange={handleInputChange}
                    className="scroll-mt-24"
                  >
                    <option value={0}>Seleccione un colegio</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Comunidad de Crecimiento" required error={messageFor(CREATE_FIELD_IDS.community)} className={ROW_FIELD}>
                  <Select
                    id={CREATE_FIELD_IDS.community}
                    name="growth_community_id"
                    value={formData.growth_community_id}
                    onChange={handleInputChange}
                    disabled={communitySelectDisabled}
                    className="scroll-mt-24"
                  >
                    <option value="">Seleccione una comunidad</option>
                    {communities.map((community) => (
                      <option key={community.id} value={community.id}>
                        {community.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {showConsultants && (
                <ConsultantsNuevo
                  sessionCreate={sessionCreate}
                  decisions={decisions}
                  messages={messagesFor(CREATE_FIELD_IDS.consultants)}
                />
              )}
            </SectionNuevo>

            {/* 2 · what */}
            <SectionNuevo id="create-session-s2" n={2} title="Datos de la sesión">
              <Field label="Título de la Sesión" required error={messageFor(CREATE_FIELD_IDS.title)}>
                <Input
                  id={CREATE_FIELD_IDS.title}
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  maxLength={200}
                  placeholder="Ej: Sesión de planificación trimestral"
                  className="scroll-mt-24"
                />
              </Field>
              <div className={`${FIELD_ROW} grid-cols-[minmax(0,1fr)] md:grid-cols-2`}>
                <Field label="Descripción" className={ROW_FIELD}>
                  <Textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Descripción de la sesión..."
                  />
                </Field>
                <Field label="Objetivos" className={ROW_FIELD}>
                  <Textarea
                    name="objectives"
                    value={formData.objectives}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder="Objetivos de la sesión..."
                  />
                </Field>
              </div>
            </SectionNuevo>

            {/* 3 · when */}
            <SectionNuevo id="create-session-s3" n={3} title="Fecha y hora">
              <div className={`${FIELD_ROW} grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))]`}>
                <Field label="Fecha" required error={messageFor(CREATE_FIELD_IDS.date)} className={ROW_FIELD}>
                  <Input
                    id={CREATE_FIELD_IDS.date}
                    type="date"
                    name="session_date"
                    value={formData.session_date}
                    onChange={handleInputChange}
                    min={earliestDate}
                    className="scroll-mt-24"
                  />
                </Field>
                <Field
                  label={
                    <>
                      Hora de inicio <span className="font-normal text-gray-600">(hora Chile)</span>
                    </>
                  }
                  required
                  error={messageFor(CREATE_FIELD_IDS.start)}
                  className={ROW_FIELD}
                >
                  <Input
                    id={CREATE_FIELD_IDS.start}
                    type="time"
                    name="start_time"
                    value={formData.start_time}
                    onChange={handleInputChange}
                    className="scroll-mt-24"
                  />
                </Field>
                <Field
                  label={
                    <>
                      Hora de término <span className="font-normal text-gray-600">(hora Chile)</span>
                    </>
                  }
                  required
                  error={messageFor(CREATE_FIELD_IDS.end)}
                  className={ROW_FIELD}
                >
                  <Input
                    id={CREATE_FIELD_IDS.end}
                    type="time"
                    name="end_time"
                    value={formData.end_time}
                    onChange={handleInputChange}
                    className="scroll-mt-24"
                  />
                </Field>
              </div>
              {/* The Spain line: worked out by the hook through the owner module, never here. */}
              {spainTimePreview && (
                <p data-testid="create-session-spain-preview" className="text-[0.8125rem] text-gray-600">
                  En España: <span className="font-semibold text-brand_primary">{spainTimePreview}</span>
                </p>
              )}
            </SectionNuevo>

            {/* 4 · single or series */}
            <SectionNuevo id="create-session-s4" n={4} title="Tipo de sesión">
              <div role="radiogroup" aria-labelledby="create-session-s4" className="flex flex-wrap gap-x-6 gap-y-3">
                <Radio name="create-session-kind" checked={!isRecurring} onChange={chooseSingleSession} label="Sesión única" />
                <Radio name="create-session-kind" checked={isRecurring} onChange={chooseRecurringSeries} label="Serie recurrente" />
              </div>
              {showRecurrence && (
                <RecurrenceNuevo
                  sessionCreate={sessionCreate}
                  decisions={decisions}
                  countMessage={messageFor(CREATE_FIELD_IDS.recurrenceCount)}
                  customDatesMessage={messageFor(CREATE_FIELD_IDS.customDates)}
                />
              )}
            </SectionNuevo>

            {/* 5 · where */}
            <SectionNuevo
              id="create-session-s5"
              n={5}
              title={
                <>
                  Modalidad{' '}
                  <span aria-hidden="true" className="text-red-600">
                    *
                  </span>
                </>
              }
            >
              <div role="radiogroup" aria-labelledby="create-session-s5" className="flex flex-wrap gap-x-6 gap-y-3">
                {(['presencial', 'online', 'hibrida'] as const).map((mod) => (
                  <Radio
                    key={mod}
                    name="modality"
                    value={mod}
                    checked={formData.modality === mod}
                    onChange={() => handleModalityChange(mod)}
                    label={MODALITY_LABELS[mod]}
                  />
                ))}
              </div>

              {showMeetingFields && (
                <>
                  {zoomManagedAvailable && (
                    <div className="grid gap-[6px]">
                      <Checkbox
                        name="is_zoom_managed"
                        data-testid="session-zoom-managed"
                        checked={formData.is_zoom_managed}
                        onChange={handleZoomManagedChange}
                        label="Generar reunión Zoom"
                      />
                      {showZoomManagedHelp() && (
                        <p data-testid="session-zoom-managed-help" className="pl-[calc(18px+0.6em)] text-xs text-gray-600">
                          GENERA crea la reunión y su enlace cuando se apruebe la sesión.
                        </p>
                      )}
                    </div>
                  )}

                  {showManualMeetingFields() && (
                    <div className={`${FIELD_ROW} grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`}>
                      <Field label="Enlace de reunión" required error={messageFor(CREATE_FIELD_IDS.meetingLink)} className={ROW_FIELD}>
                        <Input
                          id={CREATE_FIELD_IDS.meetingLink}
                          type="url"
                          name="meeting_link"
                          value={formData.meeting_link}
                          onChange={handleInputChange}
                          placeholder="https://zoom.us/j/123456789"
                          className="scroll-mt-24"
                        />
                      </Field>
                      <Field label="Proveedor de reunión" className={ROW_FIELD}>
                        <Select name="meeting_provider" value={formData.meeting_provider} onChange={handleInputChange}>
                          <option value="">Auto-detectar</option>
                          <option value="zoom">Zoom</option>
                          <option value="google_meet">Google Meet</option>
                          <option value="teams">Microsoft Teams</option>
                          <option value="otro">Otro</option>
                        </Select>
                      </Field>
                    </div>
                  )}
                </>
              )}

              {showLocation && (
                <Field label="Ubicación" required error={messageFor(CREATE_FIELD_IDS.location)}>
                  <Input
                    id={CREATE_FIELD_IDS.location}
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="Ej: Sala de profesores"
                    className="scroll-mt-24"
                  />
                </Field>
              )}
            </SectionNuevo>

            {/* 6 · hours */}
            <SectionNuevo id="create-session-s6" n={6} title="Horas y contrato">
              <HoursNuevo sessionCreate={sessionCreate} decisions={decisions} pairRefusal={pairRefusal} />
            </SectionNuevo>
          </div>

          <SummaryNuevo sessionCreate={sessionCreate} decisions={decisions}>
            <Button
              type="submit"
              variant="primary"
              disabled={scheduleDisabled}
              loading={submitting && working === 'schedule'}
            >
              {!(submitting && working === 'schedule') && <Send aria-hidden="true" />}
              {scheduleLabel}
            </Button>
            <Button variant="outline" onClick={onDraft} disabled={draftDisabled} loading={submitting && working === 'draft'}>
              {!(submitting && working === 'draft') && <Save aria-hidden="true" />}
              {draftLabel}
            </Button>
            <Button variant="quiet" size="sm" href="/admin/sessions" disabled={submitting}>
              Cancelar
            </Button>
          </SummaryNuevo>
        </form>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={question.title}
        message={
          <>
            <p>{question.body}</p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded border border-brand_primary/[0.12] bg-white px-[14px] py-3 text-sm">
              <dt className="font-semibold">Colegio</dt>
              <dd className="[overflow-wrap:anywhere]">{facts.schoolName}</dd>
              <dt className="font-semibold">Comunidad</dt>
              <dd className="[overflow-wrap:anywhere]">{facts.communityName}</dd>
              <dt className="font-semibold">{facts.dateTerm}</dt>
              <dd>{facts.dateText}</dd>
              <dt className="font-semibold">Horario</dt>
              <dd>
                {formData.start_time} a {formData.end_time} <span className="text-gray-600">(hora Chile)</span>
              </dd>
            </dl>
          </>
        }
        confirmLabel={
          <>
            <Send aria-hidden="true" />
            {scheduleLabel}
          </>
        }
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
        onCancel={() => setConfirmOpen(false)}
        data-testid="session-create-nuevo-confirm"
      />
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** A link of the checks' box: the field comes into sight and takes the focus. */
function moveTo(fieldId: string) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  if (typeof field.scrollIntoView === 'function') {
    field.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }
  field.focus({ preventScroll: true });
}
