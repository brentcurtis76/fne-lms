import React from 'react';
import { Briefcase, Calendar, ExternalLink, Mail } from 'lucide-react';
import { Badge, Button, Dialog } from '../ui/kit';
import type { UserProfile } from '../../types/roles';
import { getExternalSchoolLabel } from '../../constants/externalSchools';
import { formatMemberDate, memberProfileRows, memberProfileText } from './memberProfileText';

/**
 * The new look's member profile pop-up (redesign 6C), on the kit's `Dialog`. The name, initial, role
 * label, date text and which rows show come from `./memberProfileText`, which today's markup reads too.
 * The rows «Colegio», «Generación» and «Comunidad» are not drawn (approved with the mock-up: the panel
 * never sends the objects they need).
 */
export function MemberProfileNuevo({
  isOpen,
  onClose,
  member,
  isCurrentUser,
}: {
  isOpen: boolean;
  onClose: () => void;
  member: UserProfile;
  isCurrentUser: boolean;
}) {
  const { memberRole, roleLabel, fullName, initials } = memberProfileText(member);
  const rows = memberProfileRows(member, memberRole);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      eyebrow="Mi Comunidad de Crecimiento"
      title={
        <>
          {fullName}
          {isCurrentUser && <span className="text-brand_accent_text"> (Tú)</span>}
        </>
      }
      data-testid="member-profile-dialog"
      footer={
        <>
          <Button variant="outline" onClick={onClose} data-testid="member-profile-close">
            Cerrar
          </Button>
          <Button href={`/user/${member.id}`} onClick={onClose} data-testid="member-profile-full">
            Ver Perfil Completo
            <ExternalLink aria-hidden="true" />
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt={fullName}
            className={`h-14 w-14 flex-none rounded-full object-cover ${isCurrentUser ? 'ring-2 ring-brand_accent ring-offset-2' : ''}`}
          />
        ) : (
          <span
            className={`flex h-14 w-14 flex-none items-center justify-center rounded-full text-lg font-bold ${
              isCurrentUser ? 'bg-brand_accent text-brand_primary' : 'bg-brand_primary text-white'
            }`}
          >
            {initials}
          </span>
        )}
        {memberRole ? (
          <Badge tone="accent" plain>
            {roleLabel}
          </Badge>
        ) : (
          <Badge tone="neutral" plain>
            {roleLabel}
          </Badge>
        )}
      </div>

      <dl className="grid gap-3">
        {rows.email && (
          <div className="min-w-0">
            <dt className="flex items-center gap-2 text-xs text-gray-600">
              <Mail aria-hidden="true" className="h-4 w-4 flex-none" />
              Correo electrónico
            </dt>
            <dd className="truncate pl-6 text-sm font-medium text-brand_primary">{member.email}</dd>
          </div>
        )}
        {rows.externalSchool && (
          <div className="min-w-0">
            <dt className="flex items-center gap-2 text-xs text-gray-600">
              <Briefcase aria-hidden="true" className="h-4 w-4 flex-none" />
              Escuela externa
            </dt>
            <dd className="truncate pl-6 text-sm font-medium text-brand_primary">
              {getExternalSchoolLabel(member.external_school_affiliation)}
            </dd>
          </div>
        )}
        {rows.memberSince && (
          <div className="min-w-0">
            <dt className="flex items-center gap-2 text-xs text-gray-600">
              <Calendar aria-hidden="true" className="h-4 w-4 flex-none" />
              Miembro desde
            </dt>
            <dd className="pl-6 text-sm font-medium text-brand_primary">{formatMemberDate(member.created_at)}</dd>
          </div>
        )}
      </dl>
    </Dialog>
  );
}

export default MemberProfileNuevo;
