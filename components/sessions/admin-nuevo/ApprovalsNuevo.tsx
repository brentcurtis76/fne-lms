import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardBody, EmptyState, Field, PageHeader, Tab, TabList, TabPanel, Tabs, Textarea } from '../../ui/kit';
import type { BadgeTone } from '../../ui/kit';
import { H2, PAGE, TOUCH } from './adminNuevoStyles';

/**
 * «Aprobaciones de Sesiones» in the new look (redesign 6S, release SC), drawn only for an account that
 * chose it. It draws the page's own state and calls the page's own handlers: the same requests, the
 * same tab state (not in the address), the same notes per card, the same words, in today's order.
 * Differences of form only: a `PageHeader`, the kit's tabs and cards.
 */

export type ApprovalsStatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export interface ApprovalRequest {
  id: string;
  changes: unknown;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  consultor_sessions: { title: string; session_date: string } | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
}

export interface ApprovalsNuevoProps {
  editRequests: ApprovalRequest[];
  statusFilter: ApprovalsStatusFilter;
  setStatusFilter: (value: ApprovalsStatusFilter) => void;
  actionInProgress: boolean;
  reviewNotes: Record<string, string>;
  setReviewNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleApprove: (requestId: string) => void;
  handleReject: (requestId: string) => void;
  normalizeChangesPayload: (raw: unknown) => Record<string, { old: unknown; new: unknown }>;
  formatFieldLabel: (field: string) => string;
  formatValue: (field: string, value: unknown) => string;
}

const TABS: { id: ApprovalsStatusFilter; label: string; icon: typeof Clock }[] = [
  { id: 'pending', label: 'Pendientes', icon: Clock },
  { id: 'approved', label: 'Aprobadas', icon: CheckCircle },
  { id: 'rejected', label: 'Rechazadas', icon: XCircle },
  { id: 'all', label: 'Todas', icon: Calendar },
];

const STATUS: Record<ApprovalRequest['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  approved: { label: 'Aprobada', tone: 'success' },
  rejected: { label: 'Rechazada', tone: 'error' },
};

function emptyText(statusFilter: ApprovalsStatusFilter): string {
  return statusFilter === 'pending'
    ? 'No hay solicitudes pendientes'
    : statusFilter === 'approved'
    ? 'No hay solicitudes aprobadas'
    : statusFilter === 'rejected'
    ? 'No hay solicitudes rechazadas'
    : 'No hay solicitudes de cambio';
}

function RequestCard({ request, props }: { request: ApprovalRequest; props: ApprovalsNuevoProps }) {
  const { actionInProgress, reviewNotes, setReviewNotes, handleApprove, handleReject, normalizeChangesPayload, formatFieldLabel, formatValue } =
    props;
  const parsedChanges = normalizeChangesPayload(request.changes);
  const status = STATUS[request.status] ?? STATUS.rejected;
  return (
    <Card>
      <CardBody className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid min-w-0 gap-1">
            <h3 className="break-words text-lg font-semibold text-brand_primary">
              {request.consultor_sessions?.title || 'Sesión sin título'}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
              <span>
                Fecha de sesión:{' '}
                {request.consultor_sessions?.session_date
                  ? format(parseISO(request.consultor_sessions.session_date), 'dd MMM yyyy', {
                      locale: es,
                    })
                  : 'N/A'}
              </span>
              <span aria-hidden="true">•</span>
              <span>
                Solicitado por:{' '}
                {request.profiles ? `${request.profiles.first_name} ${request.profiles.last_name}` : 'Usuario desconocido'}
              </span>
              <span aria-hidden="true">•</span>
              <span>{format(parseISO(request.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}</span>
            </div>
          </div>
          <Badge tone={status.tone} className="self-start">
            {status.label}
          </Badge>
        </div>

        <div className="grid gap-3 rounded bg-gray-50 p-4">
          <h4 className={H2}>Cambios propuestos:</h4>
          <div className="grid gap-2">
            {Object.keys(parsedChanges).length === 0 ? (
              <p className="text-sm text-amber-700">Formato de cambios inválido</p>
            ) : (
              Object.keys(parsedChanges).map((field) => {
                const change = parsedChanges[field];
                return (
                  <div key={field} className="text-sm">
                    <div className="font-semibold text-brand_primary">{formatFieldLabel(field)}:</div>
                    <div className="ml-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-words text-red-600 line-through">{formatValue(field, change.old)}</span>
                      <span aria-hidden="true" className="text-gray-600">
                        →
                      </span>
                      <span className="break-words font-semibold text-green-600">{formatValue(field, change.new)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {request.reason && (
          <div className="grid gap-1">
            <h4 className={H2}>Razón:</h4>
            <p className="break-words text-sm text-brand_primary">{request.reason}</p>
          </div>
        )}

        {request.status === 'pending' && (
          <Field label="Notas (opcional para aprobar, requerido para rechazar)">
            <Textarea
              value={reviewNotes[request.id] || ''}
              onChange={(e) => setReviewNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
              rows={2}
              placeholder="Ingrese notas para el consultor..."
            />
          </Field>
        )}

        {request.status === 'pending' && (
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="danger-outline" onClick={() => handleReject(request.id)} disabled={actionInProgress} className={TOUCH}>
              <XCircle aria-hidden="true" />
              Rechazar
            </Button>
            <Button variant="default" onClick={() => handleApprove(request.id)} disabled={actionInProgress} className={TOUCH}>
              <CheckCircle aria-hidden="true" />
              Aprobar
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function ApprovalsNuevo(props: ApprovalsNuevoProps) {
  const { editRequests, statusFilter, setStatusFilter } = props;
  return (
    <div className={PAGE} data-testid="approvals-nuevo">
      <PageHeader
        title="Aprobaciones de Sesiones"
        description="Revise y apruebe o rechace solicitudes de cambio de sesiones de consultores"
      />

      <Tabs
        value={statusFilter}
        onValueChange={(value) => setStatusFilter(value as ApprovalsStatusFilter)}
        className="grid grid-cols-[minmax(0,1fr)] gap-4"
      >
        <TabList label="Estado de las solicitudes">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <Tab key={tab.id} value={tab.id} className={TOUCH}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </Tab>
            );
          })}
        </TabList>
        {TABS.map((tab) => (
          <TabPanel key={tab.id} value={tab.id}>
            {editRequests.length === 0 ? (
              <Card>
                <EmptyState icon={<Clock className="h-6 w-6" />} title={emptyText(statusFilter)} />
              </Card>
            ) : (
              <div className="grid gap-4">
                {editRequests.map((request) => (
                  <RequestCard key={request.id} request={request} props={props} />
                ))}
              </div>
            )}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
