import React from 'react';
import { FileText, Mail } from 'lucide-react';
import { PROGRAM_IDS, programById } from '../../lib/pasantias/cohort-public';
import { displayRut } from '../../lib/pasantias/participants/rut';
import { FOCUS_LABELS, FUNDING_LABELS } from '../../lib/pasantias/participants/types';
import {
  dietaryText,
  shortDate,
  type PanelFilters as Filters,
  type PaymentFilter,
} from '../../lib/pasantias/panel/client';
import {
  FLIGHT_LABELS,
  FLIGHT_STATUSES,
  LODGING_LABELS,
  LODGING_STATUSES,
  type BulkField,
  type FlightStatus,
  type LodgingStatus,
  type Logistics,
  type PanelRoster,
  type PanelRow,
  type PanelSummary,
} from '../../lib/pasantias/panel/types';

export const FIELD =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:bg-gray-100';
export const PRIMARY =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md bg-brand_primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand_gray_dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const SECONDARY =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:cursor-not-allowed disabled:opacity-50';
const CELL_SELECT =
  'block w-full min-w-[7.5rem] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent disabled:bg-gray-100';
const CHECK = 'h-5 w-5 accent-brand_primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent';

/* ------------------------------------------------------------------- tiles */

function Tile({ testId, label, value, total, hint }: { testId: string; label: string; value: number; total: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid={testId}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</p>
      <p className="mt-1 font-mont text-2xl font-bold">
        <span data-testid={`${testId}-value`}>{value}</span>
        <span className="text-base font-semibold text-gray-600"> de {total}</span>
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-600">{hint}</p> : null}
    </div>
  );
}

export function SummaryTiles({ summary }: { summary: PanelSummary }) {
  const total = summary.travellers;
  return (
    <section aria-label="Resumen de la cohorte" className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="panel-summary">
      <div className="rounded-lg border border-gray-200 bg-white p-4" data-testid="panel-tile-travellers">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Pasantes</p>
        <p className="mt-1 font-mont text-2xl font-bold" data-testid="panel-tile-travellers-value">
          {total}
        </p>
        <p className="mt-1 text-xs text-gray-600">
          {summary.schools} {summary.schools === 1 ? 'colegio' : 'colegios'}
        </p>
      </div>
      <Tile
        testId="panel-tile-flight"
        label="Pasajes pagados"
        value={summary.flightPaid}
        total={total}
        hint={`${summary.flightPurchased} comprados`}
      />
      <Tile
        testId="panel-tile-lodging"
        label="Alojamiento pagado"
        value={summary.lodgingPaid}
        total={total}
        hint={`${summary.lodgingReserved} reservados`}
      />
      <Tile testId="panel-tile-deposit" label="Abono 50% recibido" value={summary.depositReceived} total={total} />
      <Tile testId="panel-tile-balance" label="Saldo 50% recibido" value={summary.balanceReceived} total={total} />
    </section>
  );
}

/* ----------------------------------------------------------------- filters */

export function PanelFilters({
  filters,
  rosters,
  onChange,
  onClear,
  active,
}: {
  filters: Filters;
  rosters: PanelRoster[];
  onChange: (next: Filters) => void;
  onClear: () => void;
  active: boolean;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  return (
    <section aria-label="Filtros" className="rounded-lg border border-gray-200 bg-white p-4" data-testid="panel-filters">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="md:col-span-3 lg:col-span-2">
          <label htmlFor="panel-filter-search" className="block text-xs font-semibold text-gray-700">
            Buscar por nombre, RUT o pasaporte
          </label>
          <input
            id="panel-filter-search"
            data-testid="panel-filter-search"
            type="search"
            autoComplete="off"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            className={`mt-1 ${FIELD}`}
          />
        </div>
        <div>
          <label htmlFor="panel-filter-roster" className="block text-xs font-semibold text-gray-700">
            Colegio
          </label>
          <select
            id="panel-filter-roster"
            data-testid="panel-filter-roster"
            value={filters.rosterId}
            onChange={(e) => set('rosterId', e.target.value)}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">Todos</option>
            {rosters.map((roster) => (
              <option key={roster.id} value={roster.id}>
                {roster.schoolName} · {roster.programName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="panel-filter-program" className="block text-xs font-semibold text-gray-700">
            Programa
          </label>
          <select
            id="panel-filter-program"
            data-testid="panel-filter-program"
            value={filters.program}
            onChange={(e) => set('program', e.target.value)}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">Todos</option>
            {PROGRAM_IDS.map((id) => (
              <option key={id} value={id}>
                {programById(id).name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="panel-filter-flight" className="block text-xs font-semibold text-gray-700">
            Pasaje
          </label>
          <select
            id="panel-filter-flight"
            data-testid="panel-filter-flight"
            value={filters.flight}
            onChange={(e) => set('flight', e.target.value as Filters['flight'])}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">Todos</option>
            {FLIGHT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FLIGHT_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="panel-filter-lodging" className="block text-xs font-semibold text-gray-700">
            Alojamiento
          </label>
          <select
            id="panel-filter-lodging"
            data-testid="panel-filter-lodging"
            value={filters.lodging}
            onChange={(e) => set('lodging', e.target.value as Filters['lodging'])}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">Todos</option>
            {LODGING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LODGING_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="panel-filter-payment" className="block text-xs font-semibold text-gray-700">
            Pago del programa
          </label>
          <select
            id="panel-filter-payment"
            data-testid="panel-filter-payment"
            value={filters.payment}
            onChange={(e) => set('payment', e.target.value as PaymentFilter)}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">Todos</option>
            <option value="deposit_pending">Abono 50% pendiente</option>
            <option value="balance_pending">Saldo 50% pendiente</option>
            <option value="all_received">Todo recibido</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" data-testid="panel-filter-clear" onClick={onClear} disabled={!active} className={SECONDARY}>
            Limpiar filtros
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- bulk bar */

export interface BulkChoice {
  field: BulkField;
  value: string | boolean;
}

const BULK_OPTIONS: { key: string; label: string; choice: BulkChoice }[] = [
  ...FLIGHT_STATUSES.map((status) => ({
    key: `flightStatus:${status}`,
    label: `Pasaje: ${FLIGHT_LABELS[status]}`,
    choice: { field: 'flightStatus' as BulkField, value: status as string | boolean },
  })),
  ...LODGING_STATUSES.map((status) => ({
    key: `lodgingStatus:${status}`,
    label: `Alojamiento: ${LODGING_LABELS[status]}`,
    choice: { field: 'lodgingStatus' as BulkField, value: status as string | boolean },
  })),
  { key: 'depositReceived:true', label: 'Abono 50%: recibido', choice: { field: 'depositReceived', value: true } },
  { key: 'depositReceived:false', label: 'Abono 50%: pendiente', choice: { field: 'depositReceived', value: false } },
  { key: 'balanceReceived:true', label: 'Saldo 50%: recibido', choice: { field: 'balanceReceived', value: true } },
  { key: 'balanceReceived:false', label: 'Saldo 50%: pendiente', choice: { field: 'balanceReceived', value: false } },
];

export function BulkBar({
  count,
  choiceKey,
  busy,
  onChoiceKey,
  onApply,
  onClear,
}: {
  count: number;
  choiceKey: string;
  busy: boolean;
  onChoiceKey: (key: string) => void;
  onApply: (choice: BulkChoice) => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  const chosen = BULK_OPTIONS.find((option) => option.key === choiceKey);
  return (
    <section
      aria-label="Cambio masivo"
      data-testid="panel-bulk"
      className="flex flex-col gap-3 rounded-lg border-2 border-brand_accent bg-brand_accent/10 p-3 md:flex-row md:items-end"
    >
      <p className="text-sm font-semibold md:pb-2" data-testid="panel-bulk-count">
        {count} {count === 1 ? 'persona seleccionada' : 'personas seleccionadas'}
      </p>
      <div className="md:w-72">
        <label htmlFor="panel-bulk-choice" className="block text-xs font-semibold text-gray-700">
          Marcar a todas como
        </label>
        <select
          id="panel-bulk-choice"
          data-testid="panel-bulk-choice"
          value={choiceKey}
          onChange={(e) => onChoiceKey(e.target.value)}
          className={`mt-1 ${FIELD}`}
        >
          <option value="">Selecciona…</option>
          {BULK_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        data-testid="panel-bulk-apply"
        disabled={!chosen || busy}
        onClick={() => chosen && onApply(chosen.choice)}
        className={PRIMARY}
      >
        {busy ? 'Aplicando…' : 'Aplicar'}
      </button>
      <button type="button" data-testid="panel-bulk-clear" onClick={onClear} disabled={busy} className={SECONDARY}>
        Quitar selección
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------- table */

export function PanelTable({
  rows,
  rosters,
  selected,
  busyIds,
  onToggle,
  onToggleAll,
  onOpen,
  onQuickChange,
}: {
  rows: PanelRow[];
  rosters: PanelRoster[];
  selected: Set<string>;
  busyIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (id: string) => void;
  onQuickChange: (row: PanelRow, change: Partial<Logistics>) => void;
}) {
  const byId = new Map(rosters.map((roster) => [roster.id, roster]));
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.participant.id));
  const TH = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-600';
  const TD = 'px-3 py-2 align-top';

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm" data-testid="panel-table">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-3 py-2">
              <input
                type="checkbox"
                data-testid="panel-select-all"
                aria-label="Seleccionar todas las personas de la lista"
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                className={CHECK}
              />
            </th>
            <th scope="col" className={TH}>Persona</th>
            <th scope="col" className={TH}>Colegio</th>
            <th scope="col" className={TH}>Viaje</th>
            <th scope="col" className={TH}>Foco y alimentación</th>
            <th scope="col" className={TH}>Pasaje</th>
            <th scope="col" className={TH}>Alojamiento</th>
            <th scope="col" className={TH}>Pago del programa</th>
            <th scope="col" className={TH}>Documentos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const p = row.participant;
            const l = row.logistics;
            const roster = byId.get(row.rosterId);
            const busy = busyIds.has(p.id);
            const fullName = `${p.firstNames} ${p.lastNames}`;
            return (
              <tr key={p.id} data-testid={`panel-row-${p.id}`} data-name={fullName} className={selected.has(p.id) ? 'bg-brand_accent/10' : undefined}>
                <td className={TD}>
                  <input
                    type="checkbox"
                    data-testid={`panel-select-${p.id}`}
                    aria-label={`Seleccionar a ${fullName}`}
                    checked={selected.has(p.id)}
                    onChange={(e) => onToggle(p.id, e.target.checked)}
                    className={CHECK}
                  />
                </td>
                <td className={TD}>
                  <button
                    type="button"
                    data-testid={`panel-open-${p.id}`}
                    onClick={() => onOpen(p.id)}
                    className="text-left font-semibold text-brand_primary underline decoration-brand_accent decoration-2 underline-offset-2 hover:text-brand_gray_dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent"
                  >
                    {fullName}
                  </button>
                  <p className="whitespace-nowrap text-xs text-gray-700">RUT {displayRut(p.rut)}</p>
                  <p className="whitespace-nowrap text-xs text-gray-700">Pasaporte {p.passportNumber ?? '—'}</p>
                </td>
                <td className={TD}>
                  <p className="font-medium">{roster?.schoolName ?? '—'}</p>
                  <p className="text-xs text-gray-700">{roster?.programName ?? ''}</p>
                  <p className="text-xs text-gray-700" data-testid={`panel-funding-${p.id}`}>
                    {roster?.schoolFunding
                      ? `Pasajes: ${FUNDING_LABELS[roster.schoolFunding.flightsFunding]} · Estadía: ${FUNDING_LABELS[roster.schoolFunding.lodgingFunding]}`
                      : 'Costos sin definir por el colegio'}
                  </p>
                </td>
                <td className={`${TD} whitespace-nowrap text-xs`}>
                  <p>Llegada {shortDate(p.arrivalDate)}</p>
                  <p>Regreso {shortDate(p.departureDate)}</p>
                </td>
                <td className={`${TD} text-xs`}>
                  <p>{p.focus ? FOCUS_LABELS[p.focus] : 'Foco sin indicar'}</p>
                  <p className="text-gray-700">{p.dietaryRestrictions.length > 0 ? dietaryText(p) : 'Alimentación sin indicar'}</p>
                </td>
                <td className={TD}>
                  <select
                    data-testid={`panel-flight-${p.id}`}
                    aria-label={`Pasaje de ${fullName}`}
                    value={l.flightStatus}
                    disabled={busy}
                    onChange={(e) => onQuickChange(row, { flightStatus: e.target.value as FlightStatus })}
                    className={CELL_SELECT}
                  >
                    {FLIGHT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {FLIGHT_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={TD}>
                  <select
                    data-testid={`panel-lodging-${p.id}`}
                    aria-label={`Alojamiento de ${fullName}`}
                    value={l.lodgingStatus}
                    disabled={busy}
                    onChange={(e) => onQuickChange(row, { lodgingStatus: e.target.value as LodgingStatus })}
                    className={CELL_SELECT}
                  >
                    {LODGING_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {LODGING_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={TD}>
                  <label className="flex items-center gap-2 whitespace-nowrap text-xs">
                    <input
                      type="checkbox"
                      data-testid={`panel-deposit-${p.id}`}
                      checked={l.depositReceived}
                      disabled={busy}
                      onChange={(e) => onQuickChange(row, { depositReceived: e.target.checked })}
                      className={CHECK}
                    />
                    Abono 50%
                  </label>
                  <label className="mt-1 flex items-center gap-2 whitespace-nowrap text-xs">
                    <input
                      type="checkbox"
                      data-testid={`panel-balance-${p.id}`}
                      checked={l.balanceReceived}
                      disabled={busy}
                      onChange={(e) => onQuickChange(row, { balanceReceived: e.target.checked })}
                      className={CHECK}
                    />
                    Saldo 50%
                  </label>
                </td>
                <td className={`${TD} whitespace-nowrap text-xs`}>
                  <p className="flex items-center gap-1" data-testid={`panel-docs-${p.id}`}>
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {row.documentCount} {row.documentCount === 1 ? 'documento' : 'documentos'}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-gray-700" data-testid={`panel-letter-${p.id}`}>
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {row.hasLetter ? 'Carta generada' : 'Sin carta'}
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
