import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  CalendarClock,
  CheckCircle,
  Clock,
  FileText,
  Filter,
  Users,
  XCircle,
} from 'lucide-react';
import HelpButton from '../../tutorials/HelpButton';
import LoadingSkeleton from '../../common/LoadingSkeleton';
import ExportDropdown from '../../reports/ExportDropdown';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
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
} from '../../ui/kit';
import { getStatusBadge, getStatusColor } from '../../../lib/utils/session-ui-helpers';
import type { SessionStatus } from '../../../lib/types/consultor-sessions.types';
import { withAlpha } from '../../../lib/colorAlpha';
import { statusTone } from '../sessionTextNuevo';

/**
 * «Reportes de Sesiones» (`/consultor/sessions/reports`) in the new look (redesign 6S, release SC), drawn
 * only for an account that chose it. It draws the page's own state (the role, the analytics answer, the
 * filters) and calls the page's own setters and router move, in today's order and with today's words:
 * the header (with the help button), the filters, the seven numbers, the charts (two of them for the
 * admin only), the recent sessions with their export. Nothing here asks the server: the page does.
 * The chart pieces are the page's own lazy ones, passed in, so the charts still load only in the browser.
 */

/** The new look's chart series, in the owner's order: black, intense yellow, mid grey (brand kit values). */
const SERIE_1 = '#0a0a0a';
const SERIE_2 = '#f59e0b';
const SERIE_3 = '#6b7280';

const MODALITY_SERIES: Record<string, string> = {
  presencial: SERIE_1,
  online: SERIE_2,
  hibrida: SERIE_3,
};

const H2 = 'font-mont text-[0.8125rem] font-bold uppercase tracking-[0.1em] text-brand_primary';
const LABEL = 'font-mont text-[0.625rem] font-bold uppercase tracking-[0.14em] text-gray-600';

export interface ReportsData {
  kpis: {
    total_sessions: number;
    completed_sessions: number;
    cancelled_sessions: number;
    completion_rate: number;
    total_hours_scheduled: number;
    total_hours_actual: number;
    avg_attendance_rate: number;
    sessions_pending_report: number;
    upcoming_sessions: number;
  };
  status_distribution: { status: string; count: number }[];
  modality_distribution: { modality: string; count: number }[];
  sessions_by_month: { month: string; total: number; completed: number; cancelled: number }[];
  sessions_by_school: { school_id: number; school_name: string; total: number; completed: number }[];
  attendance_trends: { month: string; avg_attendance_rate: number; total_expected: number; total_attended: number }[];
  top_consultants?: { user_id: string; name: string; sessions_led: number; avg_attendance: number }[];
  recent_sessions: {
    id: string;
    title: string;
    session_date: string;
    status: SessionStatus;
    school_name: string;
    gc_name: string;
    attendance_rate: number | null;
  }[];
}

/** The page's lazy chart pieces (recharts, loaded in the browser only). */
export type ChartPieces = Record<
  | 'BarChart'
  | 'Bar'
  | 'PieChart'
  | 'Pie'
  | 'Cell'
  | 'AreaChart'
  | 'Area'
  | 'XAxis'
  | 'YAxis'
  | 'CartesianGrid'
  | 'Tooltip'
  | 'Legend'
  | 'ResponsiveContainer',
  React.ComponentType<any>
>;

export interface ReportsNuevoProps {
  /** `empty`: today's empty screen (header, filters, the two sentences); `page`: the whole report. */
  mode: 'empty' | 'page';
  isAdmin: boolean;
  analyticsData: ReportsData | null;
  dataLoading: boolean;
  isMobile: boolean;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  schoolFilter: string;
  onSchoolFilterChange: (value: string) => void;
  consultantFilter: string;
  onConsultantFilterChange: (value: string) => void;
  charts: ChartPieces;
  onOpenSession: (id: string) => void;
}

function formatMonthLabel(month: string): string {
  try {
    return format(parseISO(month + '-01'), 'MMM yyyy', { locale: es });
  } catch {
    return month;
  }
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded border border-brand_primary/[0.12] bg-white px-3 py-2 text-[0.8125rem] text-brand_primary">
      <p className="font-bold">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2 w-2 flex-none rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function Kpi({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardBody className="flex items-start justify-between gap-3">
        <span className="grid min-w-0 gap-1">
          <span className={`${LABEL} break-words`}>{title}</span>
          <span className="text-2xl font-extrabold text-brand_primary">{value}</span>
        </span>
        <span aria-hidden="true" className="flex-none text-brand_primary [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      </CardBody>
    </Card>
  );
}

function ChartCard({ title, ariaLabel, children }: { title: string; ariaLabel: string; children: React.ReactNode }) {
  return (
    <Card aria-label={ariaLabel}>
      <CardBody className="grid min-w-0 gap-4">
        <h2 className={H2}>{title}</h2>
        <div className="min-w-0">{children}</div>
      </CardBody>
    </Card>
  );
}

export default function ReportsNuevo(props: ReportsNuevoProps) {
  const { mode, isAdmin, analyticsData, dataLoading, isMobile, charts, onOpenSession } = props;
  const { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = charts;

  const header = (
    <PageHeader
      icon={<BarChart3 className="h-6 w-6" />}
      title="Reportes de Sesiones"
      description={
        isAdmin ? 'Estadísticas y métricas de todas las sesiones de consultoría' : 'Estadísticas y métricas de tus sesiones de consultoría'
      }
      actions={<HelpButton sectionId="mis-reportes" />}
    />
  );

  const schools = analyticsData?.sessions_by_school || [];
  const consultants = analyticsData?.top_consultants || [];
  const filters = (
    <Card>
      <CardBody className="grid gap-3">
        <h2 className={`flex items-center gap-2 ${H2}`}>
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filtros
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Desde">
            <Input id="date-from" type="date" value={props.dateFrom} onChange={(e) => props.onDateFromChange(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input id="date-to" type="date" value={props.dateTo} onChange={(e) => props.onDateToChange(e.target.value)} />
          </Field>
          <Field label="Escuela">
            <Select id="school-filter" value={props.schoolFilter} onChange={(e) => props.onSchoolFilterChange(e.target.value)}>
              <option value="">Todas</option>
              {schools.map((s) => (
                <option key={s.school_id} value={s.school_id}>
                  {s.school_name}
                </option>
              ))}
            </Select>
          </Field>
          {isAdmin && consultants.length > 0 && (
            <Field label="Consultor">
              <Select id="consultant-filter" value={props.consultantFilter} onChange={(e) => props.onConsultantFilterChange(e.target.value)}>
                <option value="">Todos</option>
                {consultants.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </CardBody>
    </Card>
  );

  const shell = (body: React.ReactNode) => (
    <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 lg:px-8" data-testid="reports-nuevo">
      {header}
      {filters}
      {body}
    </div>
  );

  if (mode === 'empty') {
    return shell(
      <EmptyState
        headingLevel={2}
        icon={<BarChart3 strokeWidth={1.25} />}
        title="No hay sesiones en el período seleccionado"
        description="No hay sesiones que coincidan con los filtros seleccionados. Intenta ajustar los filtros para ver más resultados."
      />
    );
  }

  if (dataLoading) {
    return shell(
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="chart" />
          ))}
        </div>
      </div>
    );
  }

  if (!analyticsData) return shell(null);

  const { kpis } = analyticsData;
  const chartHeight = isMobile ? 256 : 320;
  const monthlyData = analyticsData.sessions_by_month.map((item) => ({
    ...item,
    label: formatMonthLabel(item.month),
    other: item.total - item.completed - item.cancelled,
  }));
  const statusData = analyticsData.status_distribution.map((item) => ({
    ...item,
    name: getStatusBadge(item.status as SessionStatus).label,
    fill: getStatusColor(item.status as SessionStatus),
  }));
  const modalityData = analyticsData.modality_distribution.map((item) => ({
    ...item,
    name: item.modality.charAt(0).toUpperCase() + item.modality.slice(1),
    fill: MODALITY_SERIES[item.modality] || SERIE_3,
  }));
  const attendanceData = analyticsData.attendance_trends.map((item) => ({ ...item, label: formatMonthLabel(item.month) }));
  const axisTick = { fontSize: 12 };

  const recent = analyticsData.recent_sessions;
  const exportData = recent.map((s) => ({
    Fecha: s.session_date,
    Título: s.title,
    Escuela: s.school_name,
    Comunidad: s.gc_name,
    Estado: getStatusBadge(s.status).label,
    Asistencia: s.attendance_rate !== null ? `${s.attendance_rate}%` : 'N/A',
  }));

  return shell(
    <>
      {/* The seven numbers in today's two rows: two per row on a phone, one under 360 px. */}
      <div className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
          <Kpi title="Total Sesiones" value={kpis.total_sessions} icon={<Calendar />} />
          <Kpi title="Tasa de Completación" value={`${kpis.completion_rate}%`} icon={<CheckCircle />} />
          <Kpi title="Horas Programadas" value={`${kpis.total_hours_scheduled}h`} icon={<Clock />} />
          <Kpi title="Asistencia Promedio" value={`${kpis.avg_attendance_rate}%`} icon={<Users />} />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3">
          <Kpi title="Pendientes de Informe" value={kpis.sessions_pending_report} icon={<FileText />} />
          <Kpi title="Próximas Sesiones" value={kpis.upcoming_sessions} icon={<CalendarClock />} />
          <Kpi title="Sesiones Canceladas" value={kpis.cancelled_sessions} icon={<XCircle />} />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <ChartCard title="Sesiones por Mes" ariaLabel="Sesiones por Mes - Gráfico de barras">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={axisTick} angle={isMobile ? -45 : 0} textAnchor={isMobile ? 'end' : 'middle'} />
              <YAxis tick={axisTick} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="completed" stackId="a" fill={SERIE_1} name="Completadas" />
              <Bar dataKey="cancelled" stackId="a" fill={SERIE_2} name="Canceladas" />
              <Bar dataKey="other" stackId="a" fill={SERIE_3} name="Otras" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribución por Estado" ariaLabel="Distribución por Estado - Gráfico circular">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" labelLine={false} label={renderPieLabel} outerRadius={isMobile ? 80 : 100} dataKey="count" nameKey="name">
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribución por Modalidad" ariaLabel="Distribución por Modalidad - Gráfico circular">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie data={modalityData} cx="50%" cy="50%" labelLine={false} label={renderPieLabel} outerRadius={isMobile ? 80 : 100} dataKey="count" nameKey="name">
                {modalityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tendencia de Asistencia" ariaLabel="Tendencia de Asistencia - Gráfico de área">
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={axisTick} angle={isMobile ? -45 : 0} textAnchor={isMobile ? 'end' : 'middle'} />
              <YAxis domain={[0, 100]} tick={axisTick} unit="%" />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="avg_attendance_rate" stroke={SERIE_1} fill={withAlpha(SERIE_2, '33')} name="Asistencia (%)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {isAdmin && analyticsData.sessions_by_school.length > 0 && (
          <ChartCard title="Sesiones por Escuela" ariaLabel="Sesiones por Escuela - Gráfico de barras horizontal">
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={analyticsData.sessions_by_school} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={axisTick} />
                <YAxis type="category" dataKey="school_name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="total" fill={SERIE_1} name="Total" />
                <Bar dataKey="completed" fill={SERIE_2} name="Completadas" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {isAdmin && analyticsData.top_consultants && analyticsData.top_consultants.length > 0 && (
          <ChartCard title="Top Consultores" ariaLabel="Top Consultores - Gráfico de barras horizontal">
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={analyticsData.top_consultants} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={axisTick} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="sessions_led" fill={SERIE_1} name="Sesiones dirigidas" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {recent.length > 0 && (
        <section className="grid gap-3" aria-labelledby="reportes-recientes">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="reportes-recientes" className={H2}>
              Sesiones Recientes
            </h2>
            <ExportDropdown tabName="Sesiones Recientes" data={exportData} headers={['Fecha', 'Título', 'Escuela', 'Comunidad', 'Estado', 'Asistencia']} />
          </div>
          <Table stackOnPhone>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Título</TableHeaderCell>
                <TableHeaderCell>Escuela</TableHeaderCell>
                <TableHeaderCell>Comunidad</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Asistencia</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recent.map((session) => {
                const badge = getStatusBadge(session.status);
                return (
                  <TableRow
                    key={session.id}
                    className="cursor-pointer focus:outline-none focus-visible:bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand_accent"
                    tabIndex={0}
                    role="link"
                    onClick={() => onOpenSession(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenSession(session.id);
                      }
                    }}
                  >
                    <TableCell label="Fecha">{format(parseISO(session.session_date), 'dd MMM yyyy', { locale: es })}</TableCell>
                    <TableCell primary className="font-semibold">
                      {session.title}
                    </TableCell>
                    <TableCell label="Escuela">{session.school_name}</TableCell>
                    <TableCell label="Comunidad">{session.gc_name}</TableCell>
                    <TableCell label="Estado">
                      <Badge tone={statusTone(session.status)}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell label="Asistencia">{session.attendance_rate !== null ? `${session.attendance_rate}%` : '-'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}
    </>
  );
}

/** Today's «Acceso Denegado» (the user's data could not be read), in the new look. */
export function ReportsErrorNuevo({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="mx-auto grid max-w-md px-4 py-16" data-testid="reports-nuevo-error">
      <Card>
        <CardBody className="grid justify-items-center gap-3 text-center">
          <AlertCircle className="h-12 w-12 text-red-600" aria-hidden="true" />
          <h2 className="text-xl font-extrabold text-brand_primary">Acceso Denegado</h2>
          <p className="text-[0.8125rem] text-gray-600">{message}</p>
          <Button variant="default" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al Dashboard
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
