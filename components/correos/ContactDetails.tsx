import React from 'react';
import { Badge, Card, CardBody, CardHeader, CardTitle, Notice, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../ui/kit';
import type { ContactDetail } from '../../lib/correos/contacts';
import { LEGAL_BASIS_LABELS } from '../../lib/correos/reason';
import {
  BLOCK_REASON_LABELS,
  JOINED_VIA_LABELS,
  STATE_LABELS,
  UNSUBSCRIBED_BY_LABELS,
  formatDate,
  labelFor,
} from '../../lib/correos/labels';

const STATE_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  subscribed: 'success',
  pending: 'warning',
  unsubscribed: 'neutral',
};

/**
 * One person, as an admin sees them: who they are, the recorded reason and its date, each list with its state,
 * and whether they are blocked and why. Every value is drawn as plain text (a name beginning with `=` or holding
 * HTML shows exactly as typed).
 */
export function ContactDetails({ contact }: { contact: ContactDetail }) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-6" data-testid="correos-persona">
      {contact.block.blocked ? (
        <Notice tone="error" title="Bloqueada." data-testid="correos-persona-bloqueo">
          {labelFor(BLOCK_REASON_LABELS, contact.block.reason, 'Bloqueada')}
          {contact.block.since ? ` (desde el ${formatDate(contact.block.since)})` : ''}. No se le puede volver a agregar ni escribir.
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-600">Correo</dt>
              <dd className="break-all font-semibold text-gray-900" data-testid="correos-persona-correo">
                {contact.email ?? 'Borrado'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">Nombre</dt>
              <dd className="text-gray-900" data-testid="correos-persona-nombre">
                {name || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">Organización</dt>
              <dd className="text-gray-900" data-testid="correos-persona-organizacion">
                {contact.organization || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">Cómo llegó</dt>
              <dd className="text-gray-900">{labelFor(JOINED_VIA_LABELS, contact.source)}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Permiso registrado</dt>
              <dd className="text-gray-900" data-testid="correos-persona-motivo">
                {labelFor(LEGAL_BASIS_LABELS as Record<string, string>, contact.legal_basis)}
                {contact.consent_notice_version ? ` (aviso ${contact.consent_notice_version})` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-gray-600">Fecha del permiso</dt>
              <dd className="text-gray-900" data-testid="correos-persona-fecha">
                {formatDate(contact.basis_recorded_at)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-600">Nota sobre el permiso</dt>
              <dd className="whitespace-pre-wrap text-gray-900">{contact.basis_note || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Bloqueada</dt>
              <dd className="text-gray-900" data-testid="correos-persona-bloqueada">
                {contact.block.blocked ? `Sí: ${labelFor(BLOCK_REASON_LABELS, contact.block.reason, 'bloqueada')}` : 'No'}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <section aria-labelledby="correos-persona-listas-titulo">
        <h2 id="correos-persona-listas-titulo" className="mb-3 text-base font-semibold text-gray-900">
          Listas
        </h2>
        {contact.memberships.length === 0 ? (
          <p className="text-sm text-gray-700">No está en ninguna lista.</p>
        ) : (
          <Table stackOnPhone aria-label="Listas de la persona">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Lista</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Permiso</TableHeaderCell>
                <TableHeaderCell>Fecha del permiso</TableHeaderCell>
                <TableHeaderCell>Cómo llegó</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contact.memberships.map((member) => (
                <TableRow key={member.list_id} data-testid="correos-persona-lista" data-list-name={member.list_name}>
                  <TableCell primary label="Lista">
                    <span className="font-semibold">{member.list_name}</span>
                  </TableCell>
                  <TableCell label="Estado">
                    <Badge tone={STATE_TONE[member.state] ?? 'neutral'} data-testid="correos-persona-lista-estado">
                      {labelFor(STATE_LABELS, member.state)}
                    </Badge>
                    {member.state === 'unsubscribed' && member.unsubscribed_by ? (
                      <span className="ml-2 text-xs text-gray-600">
                        {labelFor(UNSUBSCRIBED_BY_LABELS, member.unsubscribed_by, '')}, {formatDate(member.unsubscribed_at)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell label="Permiso">{labelFor(LEGAL_BASIS_LABELS as Record<string, string>, member.legal_basis)}</TableCell>
                  <TableCell label="Fecha del permiso">{formatDate(member.basis_recorded_at)}</TableCell>
                  <TableCell label="Cómo llegó">{labelFor(JOINED_VIA_LABELS, member.joined_via)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
