import React, { useEffect, useRef } from 'react';
import type { ProgramId } from '../../lib/pasantias/cohort-public';
import {
  arrivalOptions,
  departureOptions,
  programDateRangeLabel,
} from '../../lib/pasantias/participants/dates';
import type { ParticipantDraft } from '../../lib/pasantias/participants/form';
import {
  DIETARY_DISPLAY_ORDER,
  DIETARY_LABELS,
  FOCUS_CODES,
  FOCUS_LABELS,
  FUNDING_LABELS,
  FUNDING_SOURCES,
  type DietaryCode,
} from '../../lib/pasantias/participants/types';
import type { FieldErrors } from '../../lib/pasantias/participants/validation';

/** Visual order of the fields; the first one with an error receives focus. */
export const FORM_FIELD_ORDER = [
  'firstNames',
  'lastNames',
  'rut',
  'passportNumber',
  'flightsFunding',
  'lodgingFunding',
  'arrivalDate',
  'departureDate',
  'focus',
  'dietaryRestrictions',
  'dietaryOther',
] as const;

export function fieldId(name: string): string {
  return name === 'dietaryRestrictions' ? `intake-field-dietary-${DIETARY_DISPLAY_ORDER[0]}` : `intake-field-${name}`;
}

function errorId(name: string): string {
  return `intake-error-${name}`;
}

const INPUT =
  'mt-1 block w-full rounded-md border bg-white px-3 py-2 text-base text-brand_primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:bg-gray-100';

function inputClass(invalid: boolean): string {
  return `${INPUT} ${invalid ? 'border-red-600' : 'border-gray-300'}`;
}

function Required() {
  return (
    <span className="ml-0.5 text-red-700" aria-hidden="true">
      ★
    </span>
  );
}

function Label({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold">
      {children}
      {required ? <Required /> : null}
      {required ? <span className="sr-only"> (obligatorio)</span> : null}
    </label>
  );
}

function FieldError({ name, errors }: { name: string; errors: FieldErrors }) {
  if (!errors[name]) return null;
  return (
    <p id={errorId(name)} data-testid={`intake-error-${name}`} className="mt-1 text-sm font-medium text-red-700">
      {errors[name]}
    </p>
  );
}

function describedBy(name: string, errors: FieldErrors, hintId?: string): string | undefined {
  const ids = [hintId, errors[name] ? errorId(name) : undefined].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-gray-200 p-4">
      <legend className="px-1 font-mont text-base font-semibold">{legend}</legend>
      <div className="mt-2 space-y-4">{children}</div>
    </fieldset>
  );
}

export interface ParticipantFormProps {
  program: ProgramId;
  mode: 'create' | 'edit';
  draft: ParticipantDraft;
  errors: FieldErrors;
  saving: boolean;
  dirty: boolean;
  justSaved: boolean;
  notice: string | null;
  /** Bumped by the page whenever focus must move to the first invalid field. */
  focusRequest: number;
  onChange: (draft: ParticipantDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function ParticipantForm({
  program,
  mode,
  draft,
  errors,
  saving,
  dirty,
  justSaved,
  notice,
  focusRequest,
  onChange,
  onSubmit,
  onCancel,
}: ParticipantFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest === 0) return;
    const first = FORM_FIELD_ORDER.find((name) => errors[name]);
    if (!first) return;
    const element = formRef.current?.querySelector<HTMLElement>(`#${fieldId(first)}`);
    element?.focus();
  }, [focusRequest]);

  const set = <K extends keyof ParticipantDraft>(key: K, value: ParticipantDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const toggleDietary = (code: DietaryCode, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...draft.dietaryRestrictions, code])).sort()
      : draft.dietaryRestrictions.filter((c) => c !== code);
    // Unchecking "Otra" clears its detail, so no hidden text is ever sent.
    onChange({
      ...draft,
      dietaryRestrictions: next as DietaryCode[],
      dietaryOther: code === 'otra' && !checked ? '' : draft.dietaryOther,
    });
  };

  const hasOtra = draft.dietaryRestrictions.includes('otra');
  const arrivals = arrivalOptions(program);
  const departures = departureOptions(program);
  const saveState = saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : justSaved ? 'Guardado' : '';

  return (
    <form
      ref={formRef}
      noValidate
      data-testid="intake-form"
      aria-labelledby="intake-form-title"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="intake-form-title" className="font-mont text-xl font-bold">
          {mode === 'create' ? 'Nueva ficha' : 'Editar ficha'}
        </h2>
        <span
          data-testid="intake-save-state"
          data-state={saving ? 'saving' : dirty ? 'unsaved' : justSaved ? 'saved' : 'idle'}
          className={`text-sm font-semibold ${dirty ? 'text-brand_accent_text' : 'text-gray-700'}`}
        >
          {saveState}
        </span>
      </div>
      <p className="text-sm text-gray-700">
        Los campos con <span className="text-red-700">★</span> son obligatorios.
      </p>

      {notice ? (
        <p
          role="alert"
          data-testid="intake-form-notice"
          className="rounded-md border border-brand_accent bg-brand_accent/20 p-3 text-sm font-medium"
        >
          {notice}
        </p>
      ) : null}

      <Fieldset legend="Datos personales">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={fieldId('firstNames')} required>
              Nombres
            </Label>
            <input
              id={fieldId('firstNames')}
              data-testid="intake-first-names"
              type="text"
              autoComplete="off"
              maxLength={120}
              value={draft.firstNames}
              onChange={(e) => set('firstNames', e.target.value)}
              aria-invalid={Boolean(errors.firstNames)}
              aria-describedby={describedBy('firstNames', errors)}
              aria-required="true"
              className={inputClass(Boolean(errors.firstNames))}
            />
            <FieldError name="firstNames" errors={errors} />
          </div>
          <div>
            <Label htmlFor={fieldId('lastNames')} required>
              Apellidos
            </Label>
            <input
              id={fieldId('lastNames')}
              data-testid="intake-last-names"
              type="text"
              autoComplete="off"
              maxLength={120}
              value={draft.lastNames}
              onChange={(e) => set('lastNames', e.target.value)}
              aria-invalid={Boolean(errors.lastNames)}
              aria-describedby={describedBy('lastNames', errors)}
              aria-required="true"
              className={inputClass(Boolean(errors.lastNames))}
            />
            <FieldError name="lastNames" errors={errors} />
          </div>
          <div>
            <Label htmlFor={fieldId('rut')} required>
              RUT
            </Label>
            <input
              id={fieldId('rut')}
              data-testid="intake-rut"
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={20}
              placeholder="12.345.678-5"
              value={draft.rut}
              onChange={(e) => set('rut', e.target.value)}
              aria-invalid={Boolean(errors.rut)}
              aria-describedby={describedBy('rut', errors, 'intake-hint-rut')}
              aria-required="true"
              className={inputClass(Boolean(errors.rut))}
            />
            <p id="intake-hint-rut" className="mt-1 text-xs text-gray-600">
              Con dígito verificador. Puedes escribirlo con o sin puntos.
            </p>
            <FieldError name="rut" errors={errors} />
          </div>
          <div>
            <Label htmlFor={fieldId('passportNumber')}>N° de pasaporte (opcional)</Label>
            <input
              id={fieldId('passportNumber')}
              data-testid="intake-passport"
              type="text"
              autoComplete="off"
              maxLength={30}
              value={draft.passportNumber}
              onChange={(e) => set('passportNumber', e.target.value)}
              aria-invalid={Boolean(errors.passportNumber)}
              aria-describedby={describedBy('passportNumber', errors, 'intake-hint-passport')}
              className={inputClass(Boolean(errors.passportNumber))}
            />
            <p id="intake-hint-passport" className="mt-1 text-xs text-gray-600">
              Si aún no lo tiene, déjalo en blanco.
            </p>
            <FieldError name="passportNumber" errors={errors} />
          </div>
        </div>
      </Fieldset>

      <Fieldset legend="Viaje y financiamiento">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={fieldId('flightsFunding')} required>
              Pasajes
            </Label>
            <select
              id={fieldId('flightsFunding')}
              data-testid="intake-flights-funding"
              value={draft.flightsFunding}
              onChange={(e) => set('flightsFunding', e.target.value as ParticipantDraft['flightsFunding'])}
              aria-invalid={Boolean(errors.flightsFunding)}
              aria-describedby={describedBy('flightsFunding', errors)}
              aria-required="true"
              className={inputClass(Boolean(errors.flightsFunding))}
            >
              <option value="">Selecciona…</option>
              {FUNDING_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {FUNDING_LABELS[source]}
                </option>
              ))}
            </select>
            <FieldError name="flightsFunding" errors={errors} />
          </div>
          <div>
            <Label htmlFor={fieldId('lodgingFunding')} required>
              Estadía
            </Label>
            <select
              id={fieldId('lodgingFunding')}
              data-testid="intake-lodging-funding"
              value={draft.lodgingFunding}
              onChange={(e) => set('lodgingFunding', e.target.value as ParticipantDraft['lodgingFunding'])}
              aria-invalid={Boolean(errors.lodgingFunding)}
              aria-describedby={describedBy('lodgingFunding', errors)}
              aria-required="true"
              className={inputClass(Boolean(errors.lodgingFunding))}
            >
              <option value="">Selecciona…</option>
              {FUNDING_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {FUNDING_LABELS[source]}
                </option>
              ))}
            </select>
            <FieldError name="lodgingFunding" errors={errors} />
          </div>
        </div>
        <p id="intake-hint-dates" className="text-sm text-gray-700">
          El programa se realiza del {programDateRangeLabel(program)}. Las fechas de llegada y regreso son
          opcionales: elige la que corresponda o deja «Sin indicar».
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={fieldId('arrivalDate')}>Llegada a Barcelona (opcional)</Label>
            <select
              id={fieldId('arrivalDate')}
              data-testid="intake-arrival-date"
              value={draft.arrivalDate}
              onChange={(e) => set('arrivalDate', e.target.value)}
              aria-invalid={Boolean(errors.arrivalDate)}
              aria-describedby={describedBy('arrivalDate', errors, 'intake-hint-dates')}
              className={inputClass(Boolean(errors.arrivalDate))}
            >
              <option value="">Sin indicar</option>
              {arrivals.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError name="arrivalDate" errors={errors} />
          </div>
          <div>
            <Label htmlFor={fieldId('departureDate')}>Regreso desde Barcelona (opcional)</Label>
            <select
              id={fieldId('departureDate')}
              data-testid="intake-departure-date"
              value={draft.departureDate}
              onChange={(e) => set('departureDate', e.target.value)}
              aria-invalid={Boolean(errors.departureDate)}
              aria-describedby={describedBy('departureDate', errors, 'intake-hint-dates')}
              className={inputClass(Boolean(errors.departureDate))}
            >
              <option value="">Sin indicar</option>
              {departures.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError name="departureDate" errors={errors} />
          </div>
          <div>
            <Label htmlFor={fieldId('focus')}>Foco (opcional)</Label>
            <select
              id={fieldId('focus')}
              data-testid="intake-focus"
              value={draft.focus}
              onChange={(e) => set('focus', e.target.value as ParticipantDraft['focus'])}
              aria-invalid={Boolean(errors.focus)}
              aria-describedby={describedBy('focus', errors)}
              className={inputClass(Boolean(errors.focus))}
            >
              <option value="">Sin indicar</option>
              {FOCUS_CODES.map((code) => (
                <option key={code} value={code}>
                  {FOCUS_LABELS[code]}
                </option>
              ))}
            </select>
            <FieldError name="focus" errors={errors} />
          </div>
        </div>
      </Fieldset>

      <Fieldset legend="Alimentación">
        <div
          role="group"
          aria-labelledby="intake-dietary-label"
          aria-describedby={describedBy('dietaryRestrictions', errors, 'intake-hint-dietary')}
        >
          <p id="intake-dietary-label" className="text-sm font-semibold">
            Restricciones alimentarias (opcional)
          </p>
          <p id="intake-hint-dietary" className="mt-1 text-xs text-gray-600">
            Marca todas las que correspondan. Si no marcas ninguna, queda como «no indicado».
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DIETARY_DISPLAY_ORDER.map((code) => (
              <label key={code} className="flex min-h-[40px] items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                <input
                  id={`intake-field-dietary-${code}`}
                  data-testid={`intake-dietary-${code}`}
                  type="checkbox"
                  checked={draft.dietaryRestrictions.includes(code)}
                  onChange={(e) => toggleDietary(code, e.target.checked)}
                  aria-invalid={Boolean(errors.dietaryRestrictions)}
                  className="h-5 w-5 accent-brand_primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent"
                />
                {DIETARY_LABELS[code]}
              </label>
            ))}
          </div>
          <FieldError name="dietaryRestrictions" errors={errors} />
        </div>
        {hasOtra ? (
          <div>
            <Label htmlFor={fieldId('dietaryOther')} required>
              Detalle de «Otra restricción»
            </Label>
            <input
              id={fieldId('dietaryOther')}
              data-testid="intake-dietary-other"
              type="text"
              autoComplete="off"
              // UTF-16 units; 400 admits 200 code points of any plane. The 200 code-point
              // rule itself is the shared validator's.
              maxLength={400}
              value={draft.dietaryOther}
              onChange={(e) => set('dietaryOther', e.target.value)}
              aria-invalid={Boolean(errors.dietaryOther)}
              aria-describedby={describedBy('dietaryOther', errors)}
              aria-required="true"
              className={inputClass(Boolean(errors.dietaryOther))}
            />
            <FieldError name="dietaryOther" errors={errors} />
          </div>
        ) : (
          <FieldError name="dietaryOther" errors={errors} />
        )}
      </Fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          data-testid="intake-cancel"
          onClick={onCancel}
          disabled={saving}
          className="min-h-[44px] rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          data-testid="intake-save"
          disabled={saving}
          aria-disabled={saving}
          className="min-h-[44px] rounded-md bg-brand_primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand_gray_dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Guardando…' : mode === 'create' ? 'Guardar ficha' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
