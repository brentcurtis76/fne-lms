import React from 'react';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Grid,
  Link2,
  List,
  MoreVertical,
  Plus,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Textarea,
  buttonClasses,
} from '../../ui/kit';
import { getStatusBadge, getStatusColor } from '../../../lib/utils/session-ui-helpers';
import type { SessionStatus } from '../../../lib/types/consultor-sessions.types';
import { statusTone } from '../sessionTextNuevo';
import { H2, LABEL, PAGE, TOUCH, TOUCH_TEXT, WRAP } from './adminNuevoStyles';

/**
 * «Sesiones de Consultoría» (`/admin/sessions`) in the new look (redesign 6S, release SC), drawn only for
 * an account that chose it. It draws the page's own state and calls the page's own handlers: the same
 * requests (the list's filters, view and dates), the same address-bar filters, the same row menu, the
 * same words in today's order. The rows of «Lista» come through the page's own list piece, which keeps
 * the ledger read of the cancelled rows and the menu's Escape and outside-click rules where they are;
 * this file only draws them. Differences of form: a `PageHeader`, kit cards, fields and rows (cards on
 * a phone), and the cancel pop-up as the kit's `Dialog` (Escape, X and «Cerrar» close it; the focus goes
 * back to the row's «⋮»).
 */

export type AdminViewMode = 'list' | 'month' | 'week';

export interface AdminSessionRow {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: SessionStatus;
  recurrence_group_id: string | null;
  session_number: number | null;
  schools: { name: string } | null;
  growth_communities: { name: string } | null;
  session_facilitators: unknown[];
}

export type LedgerMark = { status: 'penalizada' | 'devuelta'; admin_override: boolean };

/** What the page's list piece hands over: its ledger marks and its row menu. */
export interface ListPieceState {
  cancellationMap: Map<string, LedgerMark>;
  dropdownOpen: string | null;
  setDropdownOpen: (id: string | null) => void;
}

export interface AdminSessionsListNuevoProps {
  stats: { total: number; programada: number; pendiente: number };
  viewMode: AdminViewMode;
  setViewMode: (mode: AdminViewMode) => void;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  sessions: AdminSessionRow[];
  schools: Array<{ id: number; name: string }>;
  communities: Array<{ id: string; name: string }>;
  consultants: Array<{ id: string; first_name: string; last_name: string }>;
  filters: Record<'school_id' | 'growth_community_id' | 'consultant_id' | 'status' | 'date_from' | 'date_to', string>;
  handleFilterChange: (key: string, value: string) => void;
  openNewSession: () => void;
  handleViewSession: (sessionId: string) => void;
  handleApprove: (sessionId: string) => void;
  handleCancelClick: (sessionId: string) => void;
  /**
   * The place of the page's own list piece in this view. The page renders that piece once for both
   * views and moves it here (components/sessions/admin-nuevo/keptNode), so a change of view does not
   * mount it again; its rows are drawn by `AdminSessionsRowsNuevo`.
   */
  listPlace: (place: HTMLElement | null) => void;
  /** The row whose menu opened the cancel pop-up (written by the rows, read here when it closes). */
  cancelOpener: React.MutableRefObject<string | null>;
  showCancelModal: boolean;
  cancellationReason: string;
  setCancellationReason: (value: string) => void;
  actionInProgress: boolean;
  /** Today's «Cerrar»: closes the pop-up, empties the box, forgets the row. */
  closeCancelModal: () => void;
  handleCancelSubmit: () => void;
  // Method form: the page passes its own helpers, typed with its own (wider) row type.
  getFacilitatorNames(facilitators: never[]): string;
  getSeriesInfo(session: AdminSessionRow): string | null;
  formatDateShort(dateString: string): string;
  formatTime(timeString: string): string;
}

function StatusBadge({ status }: { status: SessionStatus }) {
  return <Badge tone={statusTone(status)}>{getStatusBadge(status).label}</Badge>;
}

function LedgerBadges({ mark }: { mark: LedgerMark | undefined }) {
  if (!mark) return null;
  return (
    <>
      <Badge tone={mark.status === 'penalizada' ? 'error' : 'success'} plain>
        {mark.status === 'penalizada' ? 'Penalizada' : 'Devuelta'}
      </Badge>
      {mark.admin_override && (
        <Badge tone="neutral" plain>
          Admin
        </Badge>
      )}
    </>
  );
}

const MENU_ITEM =
  'flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold transition-colors hover:bg-gray-100 focus:outline-none focus-visible:bg-gray-100 motion-reduce:transition-none max-sm:min-h-[44px]';

/**
 * The new look's rows of «Lista», for the page's list piece to draw (its `renderNuevo`). A row's
 * «Cancelar» writes the row down (`cancelOpener`) so the focus can go back to its «⋮» when the pop-up
 * closes.
 */
export function AdminSessionsRowsNuevo({ state, props }: { state: ListPieceState; props: AdminSessionsListNuevoProps }) {
  const onCancelRow = (sessionId: string) => {
    props.cancelOpener.current = sessionId;
    props.handleCancelClick(sessionId);
  };
  return <ListTable state={state} props={props} onCancelRow={onCancelRow} />;
}

/** The rows of «Lista», drawn from the page's list piece. */
function ListTable({
  state,
  props,
  onCancelRow,
}: {
  state: ListPieceState;
  props: AdminSessionsListNuevoProps;
  onCancelRow: (sessionId: string) => void;
}) {
  const { sessions, handleViewSession, handleApprove, getFacilitatorNames, getSeriesInfo, formatDateShort, formatTime } = props;
  const { cancellationMap, dropdownOpen, setDropdownOpen } = state;
  return (
    <Table stackOnPhone>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Fecha</TableHeaderCell>
          <TableHeaderCell>Hora</TableHeaderCell>
          <TableHeaderCell>Título</TableHeaderCell>
          <TableHeaderCell>Colegio</TableHeaderCell>
          <TableHeaderCell>Comunidad</TableHeaderCell>
          <TableHeaderCell>Consultor(es)</TableHeaderCell>
          <TableHeaderCell>Estado</TableHeaderCell>
          <TableHeaderCell>Serie</TableHeaderCell>
          <TableHeaderCell align="right">Acciones</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sessions.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} primary className="py-8 text-center text-gray-600">
              No se encontraron sesiones
            </TableCell>
          </TableRow>
        ) : (
          sessions.map((session) => {
            const names = getFacilitatorNames(session.session_facilitators as never[]);
            return (
              <TableRow key={session.id} className="cursor-pointer" onClick={() => handleViewSession(session.id)}>
                <TableCell label="Fecha">{formatDateShort(session.session_date)}</TableCell>
                <TableCell label="Hora">
                  {formatTime(session.start_time)} - {formatTime(session.end_time)}
                  <span className="ml-1 text-xs text-gray-600">(Chile)</span>
                </TableCell>
                <TableCell primary className="font-semibold">
                  <span className="break-words">{session.title}</span>
                </TableCell>
                <TableCell label="Colegio">{session.schools?.name || '-'}</TableCell>
                <TableCell label="Comunidad">{session.growth_communities?.name || '-'}</TableCell>
                <TableCell label="Consultor(es)" title={names}>
                  <span className="break-words">{names}</span>
                </TableCell>
                <TableCell label="Estado">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <StatusBadge status={session.status} />
                    {session.status === 'cancelada' && <LedgerBadges mark={cancellationMap.get(session.id)} />}
                  </span>
                </TableCell>
                <TableCell label="Serie">
                  {session.recurrence_group_id && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {getSeriesInfo(session)}
                    </span>
                  )}
                </TableCell>
                <TableCell label="Acciones" align="right" className="relative">
                  <button
                    type="button"
                    data-row-menu={session.id}
                    aria-label={`Acciones de ${session.title}`}
                    aria-expanded={dropdownOpen === session.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen(dropdownOpen === session.id ? null : session.id);
                    }}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-brand_primary transition-colors hover:bg-brand_primary/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent motion-reduce:transition-none sm:h-9 sm:w-9"
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {dropdownOpen === session.id && (
                    <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded border border-gray-200 bg-white text-left shadow-lg">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewSession(session.id);
                          setDropdownOpen(null);
                        }}
                        className={`${MENU_ITEM} text-brand_primary`}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        Ver detalle
                      </button>
                      {(session.status === 'borrador' || session.status === 'pendiente_aprobacion') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(session.id);
                            setDropdownOpen(null);
                          }}
                          className={`${MENU_ITEM} text-green-600`}
                        >
                          <CheckCircle className="h-4 w-4" aria-hidden="true" />
                          Aprobar
                        </button>
                      )}
                      {session.status !== 'completada' && session.status !== 'cancelada' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelRow(session.id);
                            setDropdownOpen(null);
                          }}
                          className={`${MENU_ITEM} text-red-600`}
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          Cancelar
                        </button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function sessionsByDate(sessions: AdminSessionRow[]) {
  return sessions.reduce((acc, session) => {
    const date = session.session_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(session);
    return acc;
  }, {} as Record<string, AdminSessionRow[]>);
}

/** An arrow of «Mes» / «Semana». */
function Arrow({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="outline" aria-label={label} onClick={onClick} className={TOUCH}>
      {children}
    </Button>
  );
}

/** One session as a line of an agenda (the phone's month, both widths of the week). */
function AgendaLine({
  session,
  props,
  when,
}: {
  session: AdminSessionRow;
  props: AdminSessionsListNuevoProps;
  when: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => props.handleViewSession(session.id)}
      className="flex w-full min-w-0 flex-col gap-1 rounded border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="grid min-w-0 gap-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="break-words font-semibold text-brand_primary">{session.title}</span>
          {session.recurrence_group_id && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              {props.getSeriesInfo(session)}
            </span>
          )}
        </span>
        <span className="text-sm text-gray-600">{when}</span>
      </span>
      <span className="flex-none">
        <StatusBadge status={session.status} />
      </span>
    </button>
  );
}

function MonthNuevo({ props }: { props: AdminSessionsListNuevoProps }) {
  const { sessions, currentDate, setCurrentDate, handleViewSession, handleFilterChange, setViewMode, formatDateShort, formatTime } = props;
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const byDate = sessionsByDate(sessions);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Arrow label="Mes anterior" onClick={() => setCurrentDate(addMonths(currentDate, -1))}>
          <ChevronLeft aria-hidden="true" />
        </Arrow>
        <h3 className={`${H2} text-center`}>{format(currentDate, 'MMMM yyyy', { locale: es })}</h3>
        <Arrow label="Mes siguiente" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          <ChevronRight aria-hidden="true" />
        </Arrow>
      </div>

      {/* Phone: an agenda */}
      <div className="grid gap-3 md:hidden">
        {sessions.length === 0 ? (
          <div className="py-6 text-center text-gray-600">No hay sesiones este mes</div>
        ) : (
          sessions.map((session) => (
            <AgendaLine
              key={session.id}
              session={session}
              props={props}
              when={
                <>
                  {formatDateShort(session.session_date)} • {formatTime(session.start_time)} - {formatTime(session.end_time)}
                  {session.schools?.name && <span className="block">{session.schools.name}</span>}
                </>
              }
            />
          ))
        )}
      </div>

      {/* Desktop: the month's days */}
      <div className="hidden grid-cols-7 gap-1 md:grid">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
          <div key={day} className={`py-2 text-center ${LABEL}`}>
            {day}
          </div>
        ))}
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const daySessions = byDate[dateKey] || [];
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          return (
            <div
              key={dateKey}
              className={`min-h-20 min-w-0 rounded border border-gray-200 p-1 ${isCurrentMonth ? 'bg-white' : 'bg-gray-50'}`}
            >
              <div className="mb-1 text-xs font-semibold text-gray-600">{day.getDate()}</div>
              <div className="grid gap-1">
                {daySessions.slice(0, 2).map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => handleViewSession(session.id)}
                    className="w-full min-w-0 rounded p-1 text-left text-xs transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent motion-reduce:transition-none"
                    title={session.title}
                  >
                    <div className="truncate border-l-2 pl-2" style={{ borderColor: getStatusColor(session.status) }}>
                      <span className="font-semibold text-brand_primary">{formatTime(session.start_time)}</span>{' '}
                      <span className="truncate text-gray-600">{session.title}</span>
                    </div>
                  </button>
                ))}
                {daySessions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      // As today: only this day's sessions, in «Lista».
                      handleFilterChange('date_from', dateKey);
                      handleFilterChange('date_to', dateKey);
                      setViewMode('list');
                    }}
                    className="w-full rounded px-1 py-1 text-left text-xs font-semibold text-brand_primary underline decoration-brand_accent underline-offset-2 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand_accent"
                  >
                    +{daySessions.length - 2} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekNuevo({ props }: { props: AdminSessionsListNuevoProps }) {
  const { sessions, currentDate, setCurrentDate, formatTime } = props;
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const byDate = sessionsByDate(sessions);

  const days = (empty: string) =>
    weekDays.map((day) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const daySessions = byDate[dateKey] || [];
      return (
        <div key={dateKey} className="grid gap-2">
          <h4 className={`${LABEL} capitalize`}>{format(day, 'EEEE, dd MMMM', { locale: es })}</h4>
          {daySessions.length === 0 ? (
            <p className="pl-4 text-sm text-gray-600">{empty}</p>
          ) : (
            <div className="grid gap-2">
              {daySessions.map((session) => (
                <AgendaLine
                  key={session.id}
                  session={session}
                  props={props}
                  when={
                    <>
                      {formatTime(session.start_time)} - {formatTime(session.end_time)}
                      <span className="ml-1 text-xs text-gray-600">(Chile)</span> | {session.schools?.name}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Arrow label="Semana anterior" onClick={() => setCurrentDate(addWeeks(currentDate, -1))}>
          <ChevronLeft aria-hidden="true" />
        </Arrow>
        <h3 className={`${H2} text-center`}>
          {format(weekStart, 'dd MMM', { locale: es })} - {format(weekEnd, 'dd MMM yyyy', { locale: es })}
        </h3>
        <Arrow label="Semana siguiente" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
          <ChevronRight aria-hidden="true" />
        </Arrow>
      </div>
      <div className="grid gap-4 md:hidden">{days('No hay sesiones')}</div>
      <div className="hidden gap-6 md:grid">{days('No hay sesiones programadas')}</div>
    </div>
  );
}

const VIEWS: { id: AdminViewMode; label: string; icon: typeof List }[] = [
  { id: 'list', label: 'Lista', icon: List },
  { id: 'month', label: 'Mes', icon: Grid },
  { id: 'week', label: 'Semana', icon: CalendarIcon },
];

export default function AdminSessionsListNuevo(props: AdminSessionsListNuevoProps) {
  const {
    stats,
    viewMode,
    setViewMode,
    sessions,
    schools,
    communities,
    consultants,
    filters,
    handleFilterChange,
    openNewSession,
    listPlace,
    cancelOpener,
    showCancelModal,
    cancellationReason,
    setCancellationReason,
    actionInProgress,
    closeCancelModal,
    handleCancelSubmit,
  } = props;

  // The row whose menu opened the cancel pop-up (`cancelOpener`, written by the rows): the focus goes
  // back to its «⋮» when the pop-up closes (the menu itself has closed by then), found again by the
  // row's id.
  const wasOpen = React.useRef(showCancelModal);
  React.useEffect(() => {
    if (wasOpen.current && !showCancelModal && cancelOpener.current) {
      const id = cancelOpener.current;
      cancelOpener.current = null;
      const button = Array.from(document.querySelectorAll<HTMLElement>('[data-row-menu]')).find((b) => b.dataset.rowMenu === id);
      button?.focus();
    }
    wasOpen.current = showCancelModal;
  }, [showCancelModal, cancelOpener]);

  const icalHref = `/api/sessions/ical?${new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  ).toString()}`;

  return (
    <div className={PAGE} data-testid="admin-sessions-nuevo">
      <PageHeader
        icon={<CalendarIcon className="h-6 w-6" />}
        title="Sesiones de Consultoría"
        description="Gestión de sesiones con consultores externos e internos"
      />

      {/* The three numbers */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['Total Sesiones', stats.total],
          ['Programadas', stats.programada],
          ['Pendientes', stats.pendiente],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardBody className="grid gap-1">
              <span className={LABEL}>{label}</span>
              <span className="text-2xl font-extrabold text-brand_primary">{value}</span>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="grid gap-5">
          {/* The views and «Nueva Sesión» */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Vista">
              {VIEWS.map((view) => {
                const Icon = view.icon;
                const on = viewMode === view.id;
                return (
                  <Button key={view.id} variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={() => setViewMode(view.id)} className={TOUCH}>
                    <Icon aria-hidden="true" />
                    {view.label}
                  </Button>
                );
              })}
            </div>
            <Button variant="primary" onClick={openNewSession} className={TOUCH}>
              <Plus aria-hidden="true" />
              Nueva Sesión
            </Button>
          </div>

          {/* Filters */}
          <div className="grid gap-3 rounded bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={`flex items-center gap-2 ${H2}`}>
                <Filter className="h-4 w-4" aria-hidden="true" />
                Filtros
              </h2>
              {sessions.length > 0 && (
                <a href={icalHref} download className={`${buttonClasses({ variant: 'outline' })} ${TOUCH}`}>
                  <CalendarPlus aria-hidden="true" />
                  Exportar Calendario
                </a>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Select
                aria-label="Colegio"
                value={filters.school_id}
                onChange={(e) => handleFilterChange('school_id', e.target.value)}
                className={TOUCH}
              >
                <option value="">Todos los colegios</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Comunidad"
                value={filters.growth_community_id}
                onChange={(e) => handleFilterChange('growth_community_id', e.target.value)}
                className={TOUCH}
              >
                <option value="">Todas las comunidades</option>
                {communities.map((community) => (
                  <option key={community.id} value={community.id}>
                    {community.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Consultor"
                value={filters.consultant_id}
                onChange={(e) => handleFilterChange('consultant_id', e.target.value)}
                className={TOUCH}
              >
                <option value="">Todos los consultores</option>
                {consultants.map((consultant) => (
                  <option key={consultant.id} value={consultant.id}>
                    {consultant.first_name} {consultant.last_name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Estado"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className={TOUCH}
              >
                <option value="">Todos los estados</option>
                <option value="borrador">Borrador</option>
                <option value="pendiente_aprobacion">Pendiente Aprobación</option>
                <option value="programada">Programada</option>
                <option value="en_progreso">En Progreso</option>
                <option value="pendiente_informe">Pendiente Informe</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </Select>
              {viewMode === 'list' && (
                <>
                  <Field label="Desde">
                    <Input
                      type="date"
                      value={filters.date_from}
                      onChange={(e) => handleFilterChange('date_from', e.target.value)}
                      placeholder="Desde"
                      className={TOUCH}
                    />
                  </Field>
                  <Field label="Hasta">
                    <Input
                      type="date"
                      value={filters.date_to}
                      onChange={(e) => handleFilterChange('date_to', e.target.value)}
                      placeholder="Hasta"
                      className={TOUCH}
                    />
                  </Field>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          {/* In «Lista» the page's list piece sits here, in a place of its own (`listPlace`) that holds
              nothing else. */}
          <div className="min-w-0">
            {viewMode === 'list' && <div ref={listPlace} style={{ display: 'contents' }} />}
            {viewMode === 'month' && <MonthNuevo props={props} />}
            {viewMode === 'week' && <WeekNuevo props={props} />}
          </div>
        </CardBody>
      </Card>

      <Dialog
        open={showCancelModal}
        onClose={closeCancelModal}
        title="Cancelar Sesión"
        data-testid="admin-sessions-cancel-dialog"
        footer={
          <>
            <Button variant="outline" onClick={closeCancelModal} disabled={actionInProgress} className={WRAP}>
              <span className={TOUCH_TEXT}>Cerrar</span>
            </Button>
            <Button variant="danger" onClick={handleCancelSubmit} disabled={actionInProgress || !cancellationReason.trim()} className={WRAP}>
              <span className={TOUCH_TEXT}>Confirmar Cancelación</span>
            </Button>
          </>
        }
      >
        <p>Por favor, ingrese la razón de la cancelación:</p>
        <Textarea
          value={cancellationReason}
          onChange={(e) => setCancellationReason(e.target.value)}
          rows={4}
          placeholder="Razón de cancelación..."
          aria-label="Cancelar Sesión"
        />
      </Dialog>
    </div>
  );
}
