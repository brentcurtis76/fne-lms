/**
 * The `/pasantias` lead form — the client for the frozen A5 contract.
 *
 * `POST /api/pasantias/lead` owns every rule about what a well-formed lead is;
 * this component never restates one. Client-side validation calls the SAME
 * `validateLeadSubmission` the route calls, so a problem caught here and the
 * same problem caught on the server render the identical es-CL sentence, and a
 * cap changed in `lib/pasantias/leads.ts` moves both sides at once.
 *
 * D-12: the two consents are separate purposes with separate evidence. Two
 * checkboxes, two names, no shared state and no "select all". The required one
 * is posted as a strict boolean `true` (the route rejects `'on'`), and the
 * optional one ships unchecked and stays that way unless someone clicks it.
 *
 * January 2027 (PASANT-B003): every submission is about exactly ONE program.
 * The choice is a required radio group, first in the form; a page CTA may
 * preselect it (`requestedProgram`), and the visitor can always change it.
 * Interest in both programs is two submissions with the same address — the
 * confirmation offers the other program for exactly that.
 *
 * Truthful copy (contract §6, DEC-07): nothing here says an e-mail was or will
 * be sent. Success is shown only after the route answered that the submission
 * was stored, and it hands over the two shared documents directly.
 *
 * No cohort fact is written here as a literal — `COHORT_ID` and the program
 * registry are imported, and the copy deliberately names no date, no school and
 * no city, because `__tests__/pages/pasantias-hardcoded-cohort.test.ts` scans
 * this directory along with the page. `cohort-commercial.ts` is never imported
 * (D-01) and there is no price, amount or currency anywhere in this file (D-02).
 */
import React, { useEffect, useRef, useState } from 'react';

import {
  COHORT_ID,
  COHORT_PROGRAMS,
  type ProgramId,
} from '../../lib/pasantias/cohort-public';
import {
  CONSENT_MARKETING_TEXT,
  CONSENT_PROCESSING_TEXT,
  PRIVACY_POLICY_LINK_LABEL,
  PRIVACY_POLICY_PATH,
} from '../../lib/pasantias/consent';
import {
  LEAD_FIELD_LIMITS,
  LEAD_NUM_PEOPLE_MAX,
  LEAD_NUM_PEOPLE_MIN,
  validateLeadSubmission,
} from '../../lib/pasantias/leads';
import { normalizeText } from '../../lib/signups';

const LEAD_ENDPOINT = '/api/pasantias/lead';
/** Both documents cover both programs; there is one of each. */
export const FICHA_HREF = '/api/pasantias/ficha';
export const BROCHURE_HREF = '/api/pasantias/brochure';

/** Everything that is not a checkbox or the honeypot, in DOM order. */
const TEXT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'institution',
  'roleTitle',
  'phone',
  'numPeople',
  'message',
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

/**
 * Where focus goes on a failed submit: the first invalid control in DOM order.
 * The program choice is first in the form and first here; the consent checkbox
 * is last in both, so it only takes focus when every field above it is fine.
 */
const FOCUS_ORDER: readonly string[] = ['program', ...TEXT_FIELDS, 'consent'];

/**
 * Every validation key this form can actually SHOW. A key outside this list has
 * no control, no `<p id="…-error">` and no entry in `FOCUS_ORDER`, so setting it
 * alone would leave a visitor pressing a button that does nothing at all.
 * `hasUnrenderableError` is what stops that from being possible.
 */
const RENDERED_ERROR_FIELDS: readonly string[] = ['program', ...TEXT_FIELDS, 'consent'];

/** The DOM id of one program's radio button. */
function programInputId(program: ProgramId): string {
  return `program-${program}`;
}

/**
 * Whether these errors contain at least one key the form cannot render. True
 * for anything the visitor never typed — the `utm_*` values, `sourcePath`, and
 * `cohort` as it arrives from the route when a cached page posts against a
 * retired cohort.
 */
function hasUnrenderableError(fieldErrors: Record<string, string>): boolean {
  return Object.keys(fieldErrors).some((field) => !RENDERED_ERROR_FIELDS.includes(field));
}

/**
 * Attribution the validator would refuse is DROPPED rather than posted, exactly
 * as A5's `sanitizeSourcePath` drops an unusable `source_path`: nobody TYPES a
 * `utm_*` value, so an error against one reaches a form with nowhere to render
 * it. Over the cap is unusable. Not truncated — a cut campaign name is a wrong
 * attribution recorded as if it were right. Losing one lead's attribution is the
 * cheap failure; losing the lead is not.
 *
 * The length test runs on `normalizeText`'d input because that is what the
 * validator measures; the value itself is passed through untouched so the server
 * still sees exactly what the URL carried.
 */
function usableUtm(value: string): string {
  return normalizeText(value).length > LEAD_FIELD_LIMITS.utm ? '' : value;
}

interface FormState extends Record<TextField, string> {
  /** The ONE program this submission is about; '' until the visitor picks one. */
  program: ProgramId | '';
  consent: boolean;
  marketingOptIn: boolean;
  /** Honeypot. Empty for a human; the route silently drops a filled one. */
  website: string;
}

const INITIAL_FORM: FormState = {
  // Nothing is preselected on first render: a choice is the visitor's, or a
  // CTA's they clicked (see `requestedProgram`).
  program: '',
  firstName: '',
  lastName: '',
  email: '',
  institution: '',
  roleTitle: '',
  phone: '',
  numPeople: '',
  message: '',
  consent: false,
  // D-12: unchecked on first render, and nothing in this file ever flips it.
  marketingOptIn: false,
  website: '',
};

interface UtmParams {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

const NO_UTM: UtmParams = { utmSource: '', utmMedium: '', utmCampaign: '' };

/* Exported so the tests assert against the copy itself rather than a retyped
   copy of it. */
export const GENERIC_ERROR =
  'No pudimos enviar tu solicitud. Intenta nuevamente en unos minutos o escríbenos por WhatsApp.';

/**
 * Shown when the form holds an error it cannot attach to any control. Recargar
 * is the actual remedy for the case that reaches this in practice: a cached page
 * posting against a cohort that is no longer running.
 */
export const UNRENDERABLE_ERROR =
  'No pudimos procesar tu solicitud. Recarga la página e inténtalo nuevamente; si el problema persiste, escríbenos por WhatsApp.';

/**
 * What the form says before anything is sent. It promises what happens on this
 * page — a registration and the documents — and nothing about e-mail.
 */
export const PRE_SUBMIT_COPY =
  'Elige tu programa y completa tus datos para registrar tu interés. Al enviarlo podrás descargar de inmediato la ficha y el programa completo.';

/** The confirmation's lead sentence, shown only after the route stored it. */
export const SUCCESS_TITLE = 'Solicitud registrada';

/* --------------------------------------------------------------- styling */
/* Dark-on-brand_primary, matching the tokens `pages/pasantias.tsx` uses for
   this section. No new palette, no remote font, no CDN asset (A6r [A5]). */

const CONTROL_BASE =
  'w-full rounded-lg border bg-white/[0.08] px-[14px] py-3 text-[15px] leading-[1.3] text-white transition duration-[180ms] placeholder:text-white/45 focus:outline-none focus:ring-[3px]';

function controlClasses(invalid: boolean): string {
  return `${CONTROL_BASE} ${
    invalid
      ? 'border-red-300 focus:border-red-300 focus:ring-red-300/[0.28]'
      : 'border-white/30 focus:border-brand_accent focus:ring-brand_accent/[0.35]'
  }`;
}

/** One program option's card: accent when chosen, red while the choice is missing. */
function programOptionClasses(selected: boolean, invalid: boolean): string {
  let state = 'border-white/30 bg-white/[0.08]';
  if (selected) state = 'border-brand_accent bg-white/[0.12]';
  else if (invalid) state = 'border-red-300 bg-white/[0.08]';
  return `flex cursor-pointer items-start gap-3 rounded-lg border px-[14px] py-3 text-[14px] leading-[1.45] transition duration-[180ms] ${state}`;
}

const CHECKBOX_CLASSES =
  'mt-[3px] h-5 w-5 shrink-0 cursor-pointer accent-brand_accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand_accent/[0.35]';

const SUBMIT_CLASSES =
  'inline-flex h-[52px] w-full items-center justify-center rounded-lg border border-brand_accent bg-brand_accent px-6 text-[15px] font-semibold tracking-[.08em] text-brand_primary transition-colors duration-200 hover:border-brand_accent_hover hover:bg-brand_accent_hover disabled:cursor-not-allowed disabled:opacity-[.55]';

/* ------------------------------------------------------------------ bits */

function Field({
  id,
  label,
  optional,
  error,
  full,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <label htmlFor={id} className="mb-[6px] block text-[13px] font-semibold text-white/[0.88]">
        {label}
        {optional && <span className="font-normal text-white/55"> (opcional)</span>}
      </label>
      {children}
      {error && (
        <p
          id={`${id}-error`}
          className="mt-[6px] text-[13px] leading-[1.45] text-red-200"
          data-testid={`pasantias-lead-error-${id}`}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The processing sentence with its one mention of the privacy notice turned
 * into a link. Split on the exported label rather than hand-writing the two
 * halves: a copy change in `consent.ts` then moves the link with it instead of
 * silently leaving a sentence with no link in it.
 */
function ProcessingConsentLabel() {
  const index = CONSENT_PROCESSING_TEXT.indexOf(PRIVACY_POLICY_LINK_LABEL);
  if (index < 0) {
    return <>{CONSENT_PROCESSING_TEXT}</>;
  }
  return (
    <>
      {CONSENT_PROCESSING_TEXT.slice(0, index)}
      <a
        href={PRIVACY_POLICY_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand_accent underline underline-offset-2"
        data-testid="pasantias-consent-privacy-link"
      >
        {PRIVACY_POLICY_LINK_LABEL}
      </a>
      {CONSENT_PROCESSING_TEXT.slice(index + PRIVACY_POLICY_LINK_LABEL.length)}
    </>
  );
}

/* ------------------------------------------------------------- component */

/**
 * A program a page CTA asked for. `nonce` changes on every click, so clicking
 * the same CTA again re-applies it after the visitor changed the choice.
 */
export interface ProgramRequest {
  program: ProgramId;
  nonce: number;
}

export interface LeadFormProps {
  /** The latest program a CTA on the page selected, if any. */
  requestedProgram?: ProgramRequest | null;
}

export default function LeadForm({ requestedProgram = null }: LeadFormProps = {}) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** The program of the stored submission; null while the form is showing. */
  const [submittedProgram, setSubmittedProgram] = useState<ProgramId | null>(null);
  const submitted = submittedProgram !== null;
  const [utm, setUtm] = useState<UtmParams>(NO_UTM);
  const successRef = useRef<HTMLDivElement | null>(null);

  /**
   * Back to the form for another submission about `program`, keeping what the
   * person typed. Both consents start over unchecked: each submission is its
   * own consent evidence (D-12), so a tick given for the first one is never
   * silently reused for the second.
   */
  const startSubmission = (program: ProgramId) => {
    setForm((current) => ({ ...current, program, consent: false, marketingOptIn: false }));
    setErrors({});
    setFormError('');
    setSubmittedProgram(null);
  };

  // A CTA on the page picked a program. Applied only when the request changes,
  // so the visitor's own later choice stands until they click a CTA again.
  useEffect(() => {
    if (!requestedProgram) return;
    if (submittedProgram !== null) {
      startSubmission(requestedProgram.program);
      return;
    }
    setForm((current) => ({ ...current, program: requestedProgram.program }));
    setErrors((current) => {
      if (!current.program) return current;
      const next = { ...current };
      delete next.program;
      return next;
    });
    // Only a new request re-applies; the submitted state is read, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProgram?.nonce, requestedProgram?.program]);

  // Attribution, read once on mount: `getServerSideProps` never sees the query
  // the way the browser has it after a client-side navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    // Each value is judged on its own: one unusable parameter must not cost the
    // other two.
    setUtm({
      utmSource: usableUtm(params.get('utm_source') ?? ''),
      utmMedium: usableUtm(params.get('utm_medium') ?? ''),
      utmCampaign: usableUtm(params.get('utm_campaign') ?? ''),
    });
  }, []);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field as string]) return current;
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  };

  const focusFirstInvalid = (fieldErrors: Record<string, string>) => {
    const first = FOCUS_ORDER.find((field) => fieldErrors[field]);
    if (!first) return;
    // The program error belongs to a radio group: focus the chosen radio, or
    // the first one when nothing is chosen yet.
    const id =
      first === 'program'
        ? programInputId(form.program || COHORT_PROGRAMS[0].id)
        : first;
    document.getElementById(id)?.focus();
  };

  /**
   * The one way field errors are ever applied, from client validation and from
   * a 400 alike: no error may be invisible, so anything this form cannot render
   * also raises the form-level message.
   */
  const applyFieldErrors = (fieldErrors: Record<string, string>) => {
    setErrors(fieldErrors);
    setFormError(hasUnrenderableError(fieldErrors) ? UNRENDERABLE_ERROR : '');
    focusFirstInvalid(fieldErrors);
  };

  const buildBody = () => ({
    cohort: COHORT_ID,
    // Exactly one program, as the route requires; '' (nothing chosen) is what
    // the shared validator reports as "Elige un programa."
    program: form.program,
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    institution: form.institution,
    phone: form.phone,
    roleTitle: form.roleTitle,
    numPeople: form.numPeople,
    message: form.message,
    // Strictly boolean, both of them: the route refuses `'on'` and treats
    // anything that is not `true` as an absent consent.
    consent: form.consent === true,
    marketingOptIn: form.marketingOptIn === true,
    sourcePath:
      typeof window === 'undefined'
        ? ''
        : `${window.location.pathname}${window.location.search}`,
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium,
    utmCampaign: utm.utmCampaign,
    website: form.website,
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const body = buildBody();

    // The route's own validator, so a client-caught problem and a server-caught
    // one are the same sentence. Nothing is posted until it passes.
    const result = validateLeadSubmission(body);
    if (!result.ok) {
      applyFieldErrors(result.errors);
      return;
    }

    setErrors({});
    setFormError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        fields?: Record<string, string>;
      };

      // Success means the route said it stored the submission — a 2xx alone
      // (an empty or unexpected body) is not that, and is treated as a failure
      // the person can retry with everything still filled in.
      if (response.ok && payload.success === true) {
        setSubmittedProgram(form.program || null);
        return;
      }

      if (response.ok) {
        setFormError(GENERIC_ERROR);
        return;
      }

      if (response.status === 400 && payload.fields && Object.keys(payload.fields).length > 0) {
        applyFieldErrors(payload.fields);
        return;
      }

      // 429 / 500 / 503, an unparseable body and anything else: the component's
      // own sentence, never the route's. The route returns generic es-CL strings
      // today, but the contract gives these statuses to the component, and
      // rendering the server's copy would leave that true only by luck. Every
      // value the person typed stays exactly where it is.
      setFormError(GENERIC_ERROR);
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Move focus to the confirmation once the form it replaces is gone, so a
  // keyboard or screen-reader user is not left on a control that vanished.
  useEffect(() => {
    if (submitted) {
      successRef.current?.focus();
    }
  }, [submitted]);

  if (submittedProgram !== null) {
    const chosen = COHORT_PROGRAMS.find((program) => program.id === submittedProgram);
    const other = COHORT_PROGRAMS.find((program) => program.id !== submittedProgram);

    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="rounded-2xl border border-white/20 bg-brand_primary p-6 text-white sm:p-8 lg:self-start"
        data-testid="pasantias-lead-success"
      >
        <h3 className="m-0 text-[22px] font-bold tracking-[-.01em] text-white">{SUCCESS_TITLE}</h3>
        <p
          className="mt-3 text-[15px] leading-[1.6] text-white/80"
          data-testid="pasantias-lead-success-program"
        >
          Gracias. Registramos tu interés en {chosen?.name}. Descarga ahora la información de los
          programas:
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <a
            href={FICHA_HREF}
            className="inline-flex h-[52px] items-center justify-center rounded-lg border border-brand_accent bg-brand_accent px-6 text-[15px] font-semibold tracking-[.08em] text-brand_primary transition-colors duration-200 hover:border-brand_accent_hover hover:bg-brand_accent_hover"
            data-testid="pasantias-lead-ficha"
          >
            Ficha de los programas (PDF)
          </a>
          <a
            href={BROCHURE_HREF}
            className="inline-flex h-[52px] items-center justify-center rounded-lg border border-white/50 px-6 text-[15px] font-semibold tracking-[.08em] text-white transition-colors duration-200 hover:bg-white/[0.12]"
            data-testid="pasantias-lead-brochure"
          >
            Programa completo con valores (PDF)
          </a>
        </div>
        {other && (
          <p className="mt-6 text-[14px] leading-[1.6] text-white/75">
            ¿También te interesa {other.name}? Registra otra solicitud con el mismo correo.{' '}
            <button
              type="button"
              onClick={() => startSubmission(other.id)}
              className="font-semibold text-brand_accent underline underline-offset-2"
              data-testid="pasantias-lead-other-program"
            >
              Registrar interés en {other.name}
            </button>
          </p>
        )}
      </div>
    );
  }

  const describedBy = (field: string) => (errors[field] ? `${field}-error` : undefined);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-white/20 bg-brand_primary p-6 text-white sm:p-8 lg:self-start"
      data-testid="pasantias-lead-form"
    >
      <p className="text-[15px] leading-[1.6] text-white/80" data-testid="pasantias-lead-intro">
        {PRE_SUBMIT_COPY}
      </p>

      {/*
        The program choice: required, one of two, never preselected by the form
        itself. A native radio group, so arrow keys move the choice and Tab
        enters and leaves the group as one stop. Its error is rendered under the
        group and announced through `aria-describedby` on both radios.
      */}
      <fieldset
        className="mt-6"
        aria-describedby={describedBy('program')}
        data-testid="pasantias-lead-program"
      >
        <legend className="mb-[6px] block text-[13px] font-semibold text-white/[0.88]">
          Programa
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COHORT_PROGRAMS.map((program) => (
            <label
              key={program.id}
              htmlFor={programInputId(program.id)}
              className={programOptionClasses(
                form.program === program.id,
                Boolean(errors.program)
              )}
            >
              <input
                id={programInputId(program.id)}
                name="program"
                type="radio"
                value={program.id}
                checked={form.program === program.id}
                onChange={() => updateField('program', program.id)}
                className={CHECKBOX_CLASSES}
                aria-describedby={describedBy('program')}
                data-testid={`pasantias-lead-program-${program.id}`}
              />
              <span>
                <span className="block font-semibold text-white">{program.name}</span>
                <span className="block text-white/70">{program.audience}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.program && (
          <p
            id="program-error"
            className="mt-[6px] text-[13px] leading-[1.45] text-red-200"
            data-testid="pasantias-lead-error-program"
          >
            {errors.program}
          </p>
        )}
      </fieldset>

      {/*
        Honeypot. Off-screen rather than `display:none` so a bot that skips
        hidden inputs still fills it, and out of the tab order and the
        accessibility tree so nobody who is filling the form honestly can ever
        reach it. Its value is posted like any other field.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="website">Sitio web</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => updateField('website', event.target.value)}
          data-testid="pasantias-lead-website"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-[18px] sm:grid-cols-2">
        <Field id="firstName" label="Nombre" error={errors.firstName}>
          <input
            id="firstName"
            name="firstName"
            type="text"
            maxLength={LEAD_FIELD_LIMITS.firstName}
            autoComplete="given-name"
            value={form.firstName}
            onChange={(event) => updateField('firstName', event.target.value)}
            className={controlClasses(Boolean(errors.firstName))}
            aria-invalid={errors.firstName ? true : undefined}
            aria-describedby={describedBy('firstName')}
            data-testid="pasantias-lead-first-name"
          />
        </Field>

        <Field id="lastName" label="Apellido" error={errors.lastName}>
          <input
            id="lastName"
            name="lastName"
            type="text"
            maxLength={LEAD_FIELD_LIMITS.lastName}
            autoComplete="family-name"
            value={form.lastName}
            onChange={(event) => updateField('lastName', event.target.value)}
            className={controlClasses(Boolean(errors.lastName))}
            aria-invalid={errors.lastName ? true : undefined}
            aria-describedby={describedBy('lastName')}
            data-testid="pasantias-lead-last-name"
          />
        </Field>

        <Field id="email" label="Correo electrónico" full error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            maxLength={LEAD_FIELD_LIMITS.email}
            autoComplete="email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            className={controlClasses(Boolean(errors.email))}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy('email')}
            data-testid="pasantias-lead-email"
          />
        </Field>

        <Field id="institution" label="Colegio o institución" full error={errors.institution}>
          <input
            id="institution"
            name="institution"
            type="text"
            maxLength={LEAD_FIELD_LIMITS.institution}
            autoComplete="organization"
            value={form.institution}
            onChange={(event) => updateField('institution', event.target.value)}
            className={controlClasses(Boolean(errors.institution))}
            aria-invalid={errors.institution ? true : undefined}
            aria-describedby={describedBy('institution')}
            data-testid="pasantias-lead-institution"
          />
        </Field>

        <Field id="roleTitle" label="Cargo" optional error={errors.roleTitle}>
          <input
            id="roleTitle"
            name="roleTitle"
            type="text"
            maxLength={LEAD_FIELD_LIMITS.roleTitle}
            autoComplete="organization-title"
            value={form.roleTitle}
            onChange={(event) => updateField('roleTitle', event.target.value)}
            className={controlClasses(Boolean(errors.roleTitle))}
            aria-invalid={errors.roleTitle ? true : undefined}
            aria-describedby={describedBy('roleTitle')}
            data-testid="pasantias-lead-role-title"
          />
        </Field>

        <Field id="phone" label="Teléfono" optional error={errors.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            maxLength={LEAD_FIELD_LIMITS.phone}
            autoComplete="tel"
            value={form.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            className={controlClasses(Boolean(errors.phone))}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={describedBy('phone')}
            data-testid="pasantias-lead-phone"
          />
        </Field>

        <Field id="numPeople" label="Personas que viajarían" optional error={errors.numPeople}>
          <input
            id="numPeople"
            name="numPeople"
            type="number"
            inputMode="numeric"
            min={LEAD_NUM_PEOPLE_MIN}
            max={LEAD_NUM_PEOPLE_MAX}
            value={form.numPeople}
            onChange={(event) => updateField('numPeople', event.target.value)}
            className={controlClasses(Boolean(errors.numPeople))}
            aria-invalid={errors.numPeople ? true : undefined}
            aria-describedby={describedBy('numPeople')}
            data-testid="pasantias-lead-num-people"
          />
        </Field>

        <Field id="message" label="Mensaje" optional full error={errors.message}>
          {/*
            No `maxLength` here, deliberately, and it is the one control without
            one. `LEAD_FIELD_LIMITS.message` is 1000, and a `maxlength="1000"`
            attribute puts the digit string `1000` into the rendered HTML, which
            is the retired €1.000 programme fee that
            `tests/e2e/pasantias-page.spec.ts`'s D-02 scan refuses to let reach
            this page. The cap is not lost: `validateLeadSubmission` enforces it
            on both sides and renders `LEAD_VALIDATION_MESSAGES.tooLong(1000)`
            against this field. Weakening the D-02 pattern to buy back an
            attribute was the alternative and was not taken.
          */}
          <textarea
            id="message"
            name="message"
            rows={3}
            value={form.message}
            onChange={(event) => updateField('message', event.target.value)}
            className={controlClasses(Boolean(errors.message))}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={describedBy('message')}
            data-testid="pasantias-lead-message"
          />
        </Field>
      </div>

      {/* D-12: two purposes, two controls, no shared state between them. */}
      <div className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="consent"
            className="flex cursor-pointer items-start gap-3 text-[13.5px] leading-[1.5] text-white/[0.88]"
          >
            <input
              id="consent"
              name="consent"
              type="checkbox"
              checked={form.consent}
              onChange={(event) => updateField('consent', event.target.checked)}
              className={CHECKBOX_CLASSES}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={describedBy('consent')}
              data-testid="pasantias-consent"
            />
            <span>
              <ProcessingConsentLabel />
            </span>
          </label>
          {errors.consent && (
            <p
              id="consent-error"
              className="mt-[6px] text-[13px] leading-[1.45] text-red-200"
              data-testid="pasantias-lead-error-consent"
            >
              {errors.consent}
            </p>
          )}
        </div>

        <label
          htmlFor="marketingOptIn"
          className="flex cursor-pointer items-start gap-3 text-[13.5px] leading-[1.5] text-white/70"
        >
          <input
            id="marketingOptIn"
            name="marketingOptIn"
            type="checkbox"
            checked={form.marketingOptIn}
            onChange={(event) => updateField('marketingOptIn', event.target.checked)}
            className={CHECKBOX_CLASSES}
            data-testid="pasantias-marketing-optin"
          />
          <span>{CONSENT_MARKETING_TEXT}</span>
        </label>
      </div>

      {formError && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-red-300/60 bg-red-500/[0.12] px-4 py-3 text-[13.5px] leading-[1.5] text-red-100"
          data-testid="pasantias-lead-form-error"
        >
          {formError}
        </p>
      )}

      <div className="mt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={SUBMIT_CLASSES}
          data-testid="pasantias-lead-submit"
        >
          {isSubmitting ? 'Enviando…' : 'Registrar mi interés'}
        </button>
      </div>
    </form>
  );
}
