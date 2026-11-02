import React, { useEffect, useRef } from 'react';
import type { SchoolDraft } from '../../lib/pasantias/participants/form';
import { FUNDING_LABELS, FUNDING_SOURCES } from '../../lib/pasantias/participants/types';
import type { FieldErrors } from '../../lib/pasantias/participants/validation';
import { RequiredMark } from './ParticipantForm';

/**
 * F01 — "Datos del colegio": Pasajes and Estadía (Costo SEP / Costo Colegio),
 * answered ONCE for this roster (one school × one program — what the link
 * reaches), never per person and never copied from another program.
 *
 * The selects start on "Selecciona…" until the school saves; afterwards they
 * show the saved answers. Nothing is ever pre-chosen for the school.
 */
const SELECT =
  'mt-1 block w-full rounded-md border bg-white px-3 py-2 text-base text-brand_primary shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:bg-gray-100';

export interface SchoolDataFormProps {
  schoolName: string;
  programName: string;
  draft: SchoolDraft;
  errors: FieldErrors;
  saving: boolean;
  dirty: boolean;
  /** Whether the school has a saved answer at all. */
  saved: boolean;
  justSaved: boolean;
  notice: string | null;
  /** Bumped by the page whenever focus must move to the first invalid select. */
  focusRequest: number;
  onChange: (draft: SchoolDraft) => void;
  onSubmit: () => void;
}

export default function SchoolDataForm({
  schoolName,
  programName,
  draft,
  errors,
  saving,
  dirty,
  saved,
  justSaved,
  notice,
  focusRequest,
  onChange,
  onSubmit,
}: SchoolDataFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusRequest === 0) return;
    const id = errors.flightsFunding
      ? 'intake-school-flights'
      : errors.lodgingFunding
        ? 'intake-school-lodging'
        : null;
    if (id) formRef.current?.querySelector<HTMLElement>(`#${id}`)?.focus();
  }, [focusRequest]);

  const state = saving
    ? { key: 'saving', text: 'Guardando…' }
    : dirty
      ? { key: 'unsaved', text: 'Cambios sin guardar' }
      : justSaved
        ? { key: 'saved', text: 'Guardado' }
        : saved
          ? { key: 'stored', text: 'Datos guardados' }
          : { key: 'missing', text: 'Pendiente' };

  const select = (
    field: 'flightsFunding' | 'lodgingFunding',
    id: string,
    testId: string,
    errorTestId: string,
    label: string
  ) => {
    const errorElementId = `${id}-error`;
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-semibold">
          {label}
          <RequiredMark />
        </label>
        <select
          id={id}
          data-testid={testId}
          value={draft[field]}
          onChange={(e) => onChange({ ...draft, [field]: e.target.value as SchoolDraft[typeof field] })}
          aria-invalid={Boolean(errors[field])}
          aria-describedby={errors[field] ? errorElementId : undefined}
          aria-required="true"
          className={`${SELECT} ${errors[field] ? 'border-red-600' : 'border-gray-300'}`}
        >
          <option value="">Selecciona…</option>
          {FUNDING_SOURCES.map((source) => (
            <option key={source} value={source}>
              {FUNDING_LABELS[source]}
            </option>
          ))}
        </select>
        {errors[field] ? (
          <p id={errorElementId} data-testid={errorTestId} className="mt-1 text-sm font-medium text-red-700">
            {errors[field]}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <section
      data-testid="intake-school-section"
      aria-labelledby="intake-school-title"
      className="rounded-lg border border-gray-200 p-4"
    >
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="intake-school-title" className="font-mont text-xl font-bold">
            Datos del colegio
          </h2>
          <span
            data-testid="intake-school-state"
            data-state={state.key}
            className={`text-sm font-semibold ${dirty || !saved ? 'text-brand_accent_text' : 'text-gray-700'}`}
          >
            {state.text}
          </span>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-gray-600">Colegio: </dt>
            <dd className="inline font-medium">{schoolName}</dd>
          </div>
          <div>
            <dt className="inline text-gray-600">Programa: </dt>
            <dd className="inline font-medium">{programName}</dd>
          </div>
        </dl>
        <p className="text-sm text-gray-700">
          Indica una sola vez, para todo el colegio, quién cubre el costo de los pasajes y de la estadía. Se
          aplica a todos los pasantes de esta nómina. Los campos marcados «Obligatorio» deben completarse.
        </p>

        {notice ? (
          <p
            role="alert"
            data-testid="intake-school-notice"
            className="rounded-md border border-brand_accent bg-brand_accent/20 p-3 text-sm font-medium"
          >
            {notice}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {select('flightsFunding', 'intake-school-flights', 'intake-school-flights', 'intake-error-schoolFlightsFunding', 'Pasajes')}
          {select('lodgingFunding', 'intake-school-lodging', 'intake-school-lodging', 'intake-error-schoolLodgingFunding', 'Estadía')}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            data-testid="intake-school-save"
            disabled={saving}
            aria-disabled={saving}
            className="min-h-[44px] rounded-md bg-brand_primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand_gray_dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar datos del colegio'}
          </button>
        </div>
      </form>
    </section>
  );
}
