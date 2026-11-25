import React from 'react';
import { ChevronLeft, ChevronRight, Filter, Tag } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../ui/kit';
import { getStatusBadge } from '../../../lib/utils/session-ui-helpers';
import type { SessionStatus } from '../../../lib/types/consultor-sessions.types';
import { statusTone } from '../sessionTextNuevo';
import { H2, PAGE, TOUCH, TOUCH_TEXT, WRAP } from './adminNuevoStyles';

/**
 * «Clasificar Sesiones» in the new look (redesign 6S, release SC), drawn only for an account that chose
 * it. It draws the page's own state and calls the page's own handlers: the same request per choice and
 * page, the same selection rules, the same words in today's order. Differences of form only: a
 * `PageHeader`, the info banner as a `Notice`, labelled kit fields, the kit's rows piece (it scrolls inside
 * its own box on a phone) and
 * the selection bar as a light panel that stays at the bottom of the screen.
 */

export interface BulkTagSession {
  id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
  schools: { id: number; name: string } | null;
}

export interface BulkTagNuevoProps {
  sessions: BulkTagSession[];
  total: number;
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  hourTypes: Array<{ id: string; key: string; display_name: string }>;
  selectedHourTypeKey: string;
  setSelectedHourTypeKey: (value: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  saving: boolean;
  filterDateFrom: string;
  setFilterDateFrom: (value: string) => void;
  filterDateTo: string;
  setFilterDateTo: (value: string) => void;
  filterSchoolId: string;
  setFilterSchoolId: (value: string) => void;
  schools: Array<{ id: number; name: string }>;
  handleToggleSelect: (id: string) => void;
  handleSelectAll: () => void;
  handleBulkTag: () => void;
  // Method form: the page passes its own functions, typed with its own (wider) session type.
  getFacilitatorName(session: BulkTagSession): string;
  formatDate(dateStr: string | null): string;
}

/**
 * A tick box with a 44 px target on a phone (the box itself stays its size): the whole area is the
 * box's own label, so pressing anywhere in it ticks the box, once, as pressing the box does. The box's
 * name stays its `aria-label`.
 */
function TickBox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="inline-flex items-center justify-center max-sm:h-11 max-sm:w-11">
      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-brand_primary" {...props} />
    </label>
  );
}

export default function BulkTagNuevo(props: BulkTagNuevoProps) {
  const {
    sessions,
    total,
    page,
    totalPages,
    setPage,
    hourTypes,
    selectedHourTypeKey,
    setSelectedHourTypeKey,
    selectedIds,
    setSelectedIds,
    saving,
    filterDateFrom,
    setFilterDateFrom,
    filterDateTo,
    setFilterDateTo,
    filterSchoolId,
    setFilterSchoolId,
    schools,
    handleToggleSelect,
    handleSelectAll,
    handleBulkTag,
    getFacilitatorName,
    formatDate,
  } = props;

  return (
    <div className={PAGE} data-testid="bulk-tag-nuevo">
      <PageHeader
        icon={<Tag className="h-6 w-6" />}
        title="Clasificar Sesiones"
        description="Asignar tipo de hora a sesiones históricas sin clasificar"
      />

      <Notice tone="neutral">
        Las sesiones clasificadas aquí aparecerán en reportes pero <strong>NO</strong> afectarán los saldos de horas del contrato.
      </Notice>

      <Card>
        <CardBody className="grid gap-3">
          <h2 className={`flex items-center gap-2 ${H2}`}>
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filtros
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Fecha desde">
              <Input
                id="filter-date-from"
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                className={TOUCH}
              />
            </Field>
            <Field label="Fecha hasta">
              <Input
                id="filter-date-to"
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                className={TOUCH}
              />
            </Field>
            <Field label="Colegio">
              <Select
                id="filter-school"
                value={filterSchoolId}
                onChange={(e) => { setFilterSchoolId(e.target.value); setPage(1); }}
                className={TOUCH}
              >
                <option value="">Todos los colegios</option>
                {schools.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3">
        <p className="text-sm text-gray-600">{total} sesión(es) sin clasificar</p>
        {/* The rows scroll inside their own box on a phone, so the tick-all box in their head stays in view. */}
        <Table
          footer={
            totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-gray-200 p-4">
                <span className="text-sm text-gray-600">
                  Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setSelectedIds(new Set()); setPage((p) => Math.max(1, p - 1)); }}
                    disabled={page === 1}
                    aria-label="Página anterior"
                    className={TOUCH}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setSelectedIds(new Set()); setPage((p) => Math.min(totalPages, p + 1)); }}
                    disabled={page === totalPages}
                    aria-label="Página siguiente"
                    className={TOUCH}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null
          }
        >
          <TableHead>
            <TableRow>
              <TableHeaderCell>
                <TickBox
                  checked={sessions.length > 0 && selectedIds.size === sessions.length}
                  onChange={handleSelectAll}
                  aria-label="Seleccionar todas las sesiones"
                />
              </TableHeaderCell>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Título</TableHeaderCell>
              <TableHeaderCell>Colegio</TableHeaderCell>
              <TableHeaderCell>Consultor</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-600">
                  No hay sesiones sin clasificar con los filtros actuales
                </TableCell>
              </TableRow>
            ) : (
              sessions.map((session) => {
                const badge = getStatusBadge(session.status as SessionStatus);
                const selected = selectedIds.has(session.id);
                return (
                  <TableRow key={session.id} selected={selected}>
                    <TableCell label="Seleccionar">
                      <TickBox
                        checked={selected}
                        onChange={() => handleToggleSelect(session.id)}
                        aria-label={`Seleccionar sesión ${session.title}`}
                      />
                    </TableCell>
                    <TableCell label="Fecha">{formatDate(session.scheduled_date)}</TableCell>
                    <TableCell label="Título" className="break-words">
                      {session.title}
                    </TableCell>
                    <TableCell label="Colegio">{session.schools?.name ?? '—'}</TableCell>
                    <TableCell label="Consultor">{getFacilitatorName(session)}</TableCell>
                    <TableCell label="Estado">
                      <Badge tone={statusTone(session.status as SessionStatus)}>{badge.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 z-10">
          <Card className="border-t-[3px] border-t-brand_accent">
            <CardBody className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-brand_primary">{selectedIds.size} sesión(es) seleccionada(s)</span>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Select
                  value={selectedHourTypeKey}
                  onChange={(e) => setSelectedHourTypeKey(e.target.value)}
                  aria-label="Tipo de hora para clasificación"
                  className={`min-w-[180px] max-w-full ${TOUCH}`}
                >
                  <option value="">Seleccione tipo de hora</option>
                  {hourTypes.map((ht) => (
                    <option key={ht.key} value={ht.key}>
                      {ht.display_name}
                    </option>
                  ))}
                </Select>
                <Button variant="primary" onClick={handleBulkTag} disabled={saving || !selectedHourTypeKey} className={WRAP}>
                  <Tag aria-hidden="true" />
                  <span className={TOUCH_TEXT}>{saving ? 'Clasificando...' : 'Clasificar Seleccionadas'}</span>
                </Button>
              </div>
              <Button variant="quiet" onClick={() => setSelectedIds(new Set())} className={TOUCH}>
                Deseleccionar
              </Button>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
