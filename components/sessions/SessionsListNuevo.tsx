import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, CalendarPlus, Clock, Filter as FilterIcon, Link2, MapPin, Users, X } from 'lucide-react';
import HelpButton from '../tutorials/HelpButton';
import { Badge, Button, Card, CardBody, Count, Field, Input, PageHeader, Select, Tab, TabList, TabPanel, Tabs, buttonClasses } from '../ui/kit';
import { getStatusBadge, formatTime, getModalityIcon } from '../../lib/utils/session-ui-helpers';
import { todayInChile } from '../../lib/utils/session-timezone';
import { agendaGroups, rowHelperText, statusTone } from './sessionTextNuevo';
import type { SessionListItem } from './SessionsList.types';
import type { SessionsList, SessionsListDecisions } from '../../hooks/useSessionsList';

/**
 * «Mis Sesiones» in the new look (redesign 6S, release SB), drawn only for an account that chose it.
 * It draws what `useSessionsList()` gives it and the decisions the page worked out with `list.decide()`,
 * exactly as today's view (`SessionsListClasico`): the same filters, the same calls, the same rows. The
 * approved differences (inventory, «Mis Sesiones» list): two tabs with counts in place of two columns;
 * agenda rows that are real links, grouped «Esta semana» / «Próximas» / «Pasadas»; «Otras…» rows not
 * dimmed; own «Pendiente Informe» / «En Progreso» rows say what they need with today's helper words;
 * «Exportar Calendario» in the header as a secondary button; «Cargar más» an outline button.
 */

const H2 = 'font-mont text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-brand_primary';
const LABEL = 'font-mont text-[0.625rem] font-bold uppercase tracking-[0.14em] text-gray-600';
// B6: this list's tab row on a phone (the kit's row is not changed for other screens).
const NARROW_ROW = 'max-sm:flex-wrap';
const NARROW_TAB = 'max-sm:max-w-full max-sm:whitespace-normal';

/**
 * «jue», «19», «nov»: the parts of a row's date mark (no abbreviation dot), and «2030» only when the
 * session's year is not the year of `today` (the same Chile date the list uses for «Hoy»).
 */
function dateBlock(date: string, today: string) {
  const day = parseISO(date);
  const strip = (text: string) => text.replace('.', '');
  const year = date.slice(0, 4);
  return {
    weekday: strip(format(day, 'EEE', { locale: es })),
    day: format(day, 'dd'),
    month: strip(format(day, 'MMM', { locale: es })),
    year: year === today.slice(0, 4) ? null : year,
  };
}

/**
 * How long the list waits for its first answer before it opens on «Mis Sesiones» anyway (the answer
 * failed, or it came before this view was drawn and had no rows). An answer that comes later never moves
 * the person.
 */
const OPENING_WAIT_MS = 4000;

/**
 * B6: the tab the list opens on, decided once, when the first load has settled: «Otras…» when «Mis
 * Sesiones» has no session and «Otras…» has at least one, otherwise «Mis Sesiones». This view can be
 * drawn while the sessions' first answer is still pending; so the first load counts as settled when
 * there are rows, or when the hook has put a new sessions array since this view was drawn (its answer,
 * even an empty one). Until then no tab is selected and no panel is drawn, so nothing flashes from one
 * tab to the other. A tab the person presses is kept; later data (filters, «Cargar más») never moves them.
 */
function useOpeningTab(list: SessionsList): [string, (value: string) => void] {
  const { sessions, mySessions, otherSessions } = list;
  const sessionsAtMount = React.useRef(sessions);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const settled = sessions.length > 0 || sessions !== sessionsAtMount.current;
  const opening = mySessions.length === 0 && otherSessions.length > 0 ? 'otras' : 'mias';
  const current = pinned ?? (settled ? opening : '');

  React.useEffect(() => {
    if (pinned === null && settled) setPinned((value) => value ?? opening);
  }, [pinned, settled, opening]);

  const waiting = pinned === null && !settled;
  React.useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setPinned((value) => value ?? 'mias'), OPENING_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  return [current, setPinned];
}

function AgendaRow({
  session,
  own,
  today,
  list,
}: {
  session: SessionListItem;
  own: boolean;
  today: string;
  list: SessionsList;
}) {
  const { seriesNumberShown, isCancelled, ledgerOf, openSession } = list;
  const badge = getStatusBadge(session.status);
  const block = dateBlock(session.session_date, today);
  const isToday = session.session_date === today;
  const needs = own ? rowHelperText(session.status) : null;
  const ledger = isCancelled(session) ? ledgerOf(session.id) : undefined;

  return (
    <a
      href={`/consultor/sessions/${session.id}`}
      aria-label={`Ver detalles de ${session.title}`}
      onClick={(event) => {
        // A plain click goes where today's card goes, the same way (the router); a click that asks for
        // a new tab or window is left to the browser.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        openSession(session.id);
      }}
      className="flex min-w-0 items-start gap-3 px-4 py-3 no-underline transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand_accent motion-reduce:transition-none sm:gap-4"
    >
      <span
        aria-hidden="true"
        className={`flex w-14 flex-none flex-col items-center rounded border px-1 py-1.5 text-center leading-tight ${
          isToday ? 'border-brand_accent bg-brand_accent/20' : 'border-gray-200 bg-white'
        }`}
      >
        <span className={LABEL}>{isToday ? 'Hoy' : block.weekday}</span>
        <span className="text-xl font-extrabold text-brand_primary">{block.day}</span>
        <span className={LABEL}>{block.month}</span>
        {block.year && <span className={LABEL}>{block.year}</span>}
        <span className="mt-0.5 text-xs text-gray-600">{formatTime(session.start_time)}</span>
      </span>

      <span className="grid min-w-0 flex-1 gap-1 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-brand_primary">{session.title}</span>
            {seriesNumberShown(session) && (
              <span className="flex flex-none items-center gap-1 text-xs text-gray-600">
                <Link2 className="h-3 w-3" aria-hidden="true" />
                <span>#{session.session_number}</span>
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4 flex-none" aria-hidden="true" />
              <span>
                {formatTime(session.start_time)} - {formatTime(session.end_time)}
                <span className="ml-1 text-xs text-gray-600">(Chile)</span>
              </span>
            </span>
            <span className="flex items-center gap-1">
              {getModalityIcon(session.modality)}
              <span className="capitalize">{session.modality}</span>
            </span>
          </span>
          {(session.schools || session.growth_communities) && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
              {session.schools && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 flex-none" aria-hidden="true" />
                  <span className="min-w-0 break-words">{session.schools.name}</span>
                </span>
              )}
              {session.growth_communities && (
                <span className="flex min-w-0 items-center gap-1">
                  <Users className="h-3 w-3 flex-none" aria-hidden="true" />
                  <span className="min-w-0 break-words">{session.growth_communities.name}</span>
                </span>
              )}
            </span>
          )}
        </span>

        <span className="flex flex-wrap items-center gap-1 sm:max-w-[45%] sm:flex-none sm:flex-col sm:items-end">
          <span className="flex flex-wrap items-center gap-1 sm:justify-end">
            <Badge tone={statusTone(session.status)}>{badge.label}</Badge>
            {ledger?.status && (
              <>
                <Badge tone={ledger.status === 'penalizada' ? 'error' : 'success'} plain>
                  {ledger.status === 'penalizada' ? 'Penalizada' : 'Devuelta'}
                </Badge>
                {ledger.admin_override && (
                  <Badge tone="neutral" plain>
                    Admin
                  </Badge>
                )}
              </>
            )}
          </span>
          {needs && <span className="text-xs text-amber-700 sm:text-right">{needs}</span>}
        </span>
      </span>
    </a>
  );
}

function Agenda({
  rows,
  own,
  empty,
  today,
  list,
  idPrefix,
}: {
  rows: SessionListItem[];
  own: boolean;
  empty: string;
  today: string;
  list: SessionsList;
  idPrefix: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">{empty}</div>
    );
  }
  return (
    <div className="grid gap-5">
      {agendaGroups(rows, today).map((group) => (
        <section key={group.id} className="grid gap-2" aria-labelledby={`${idPrefix}-${group.id}`}>
          <h3 id={`${idPrefix}-${group.id}`} className={`flex items-center gap-2 ${H2}`}>
            {group.title}
            <span className="font-sans text-xs font-medium normal-case tracking-normal text-gray-600">{group.rows.length}</span>
          </h3>
          <Card className="divide-y divide-gray-200">
            {group.rows.map((session) => (
              <AgendaRow key={session.id} session={session} own={own} today={today} list={list} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

export default function SessionsListNuevo({
  list,
  decisions,
}: {
  list: SessionsList;
  decisions: SessionsListDecisions;
}) {
  const {
    totalSessions,
    filters,
    allSchools,
    handleClearFilters,
    handleLoadMore,
    mySessions,
    otherSessions,
    nextSessionCountdown,
    pendingReportsCount,
    icalHref,
    changeSchoolFilter,
    changeStatusFilter,
    changeDateFromFilter,
    changeDateToFilter,
  } = list;
  const { showExportCalendar, noMySessions, noOtherSessions, showLoadMore } = decisions;
  // The groups need the date of today in Chile (the sessions' own calendar).
  const today = todayInChile(new Date());
  const [tab, setTab] = useOpeningTab(list);

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 lg:px-8" data-testid="sessions-list-nuevo">
      <PageHeader
        icon={<Calendar className="h-6 w-6" />}
        title="Mis Sesiones"
        description="Vista de sesiones de consultoría asignadas"
        actions={
          <>
            {showExportCalendar && (
              <a href={icalHref()} download className={buttonClasses({ variant: 'outline' })}>
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Exportar Calendario
              </a>
            )}
            <HelpButton sectionId="mis-sesiones" />
          </>
        }
      />

      {/* The three numbers */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody className="grid gap-1">
            <span className={LABEL}>Total Sesiones</span>
            <span className="text-2xl font-extrabold text-brand_primary">{totalSessions}</span>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="grid gap-1">
            <span className={LABEL}>Informes Pendientes</span>
            <span className={`text-2xl font-extrabold ${pendingReportsCount > 0 ? 'text-amber-700' : 'text-brand_primary'}`}>
              {pendingReportsCount}
            </span>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="grid gap-1">
            <span className={LABEL}>Próxima Sesión</span>
            <span className="text-2xl font-extrabold text-brand_primary">{nextSessionCountdown}</span>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="grid gap-3">
          <h2 className={`flex items-center gap-2 ${H2}`}>
            <FilterIcon className="h-4 w-4" aria-hidden="true" />
            Filtros
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <Field label="Filtrar por colegio">
              <Select value={filters.school_id} onChange={changeSchoolFilter}>
                <option value="">Todos</option>
                {allSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Filtrar por estado">
              <Select value={filters.status} onChange={changeStatusFilter}>
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="pendiente_aprobacion">Pendiente Aprobación</option>
                <option value="programada">Programada</option>
                <option value="en_progreso">En Progreso</option>
                <option value="pendiente_informe">Pendiente Informe</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </Select>
            </Field>
            <Field label="Fecha desde">
              <Input type="date" value={filters.date_from} onChange={changeDateFromFilter} />
            </Field>
            <Field label="Fecha hasta">
              <Input type="date" value={filters.date_to} onChange={changeDateToFilter} />
            </Field>
            <Button variant="quiet" onClick={handleClearFilters} className="justify-self-start">
              <X className="h-4 w-4" aria-hidden="true" />
              Limpiar filtros
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* The two lists as tabs, each the full width */}
      {/* Below 640 px the row wraps and a tab's words may break, so both tabs and both counts stay in view. */}
      <Tabs value={tab} onValueChange={setTab} className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <TabList label="Listas de sesiones" className={NARROW_ROW}>
          <Tab value="mias" className={NARROW_TAB}>
            Mis Sesiones <Count value={mySessions.length} />
          </Tab>
          <Tab value="otras" className={NARROW_TAB}>
            Otras Sesiones en Mis Colegios <Count value={otherSessions.length} />
          </Tab>
        </TabList>
        <TabPanel value="mias">
          <Agenda
            rows={noMySessions ? [] : mySessions}
            own
            empty="No está asignado como facilitador en ninguna sesión"
            today={today}
            list={list}
            idPrefix="grupo-mias"
          />
        </TabPanel>
        <TabPanel value="otras">
          <Agenda
            rows={noOtherSessions ? [] : otherSessions}
            own={false}
            empty="No hay otras sesiones en sus colegios asignados"
            today={today}
            list={list}
            idPrefix="grupo-otras"
          />
        </TabPanel>
      </Tabs>

      {showLoadMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
