'use client';

import React from 'react';
import { X, Mail, User, Building2, Users, Calendar, ExternalLink, Briefcase } from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ROLE_NAMES, UserRoleType, UserProfile } from '../../types/roles';
import { getExternalSchoolLabel } from '../../constants/externalSchools';

interface MemberProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: UserProfile | null;
  isCurrentUser?: boolean;
}

export function MemberProfileModal({
  isOpen,
  onClose,
  member,
  isCurrentUser = false,
}: MemberProfileModalProps) {
  if (!member) return null;

  const memberRole = member.user_roles?.[0]?.role_type as UserRoleType | undefined;
  const roleLabel = memberRole ? ROLE_NAMES[memberRole] : 'Sin rol asignado';
  const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Usuario';
  const initials = (member.first_name?.charAt(0) || 'U').toUpperCase();

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No disponible';
    const date = new Date(dateString);
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] bg-white p-0 overflow-hidden">
        {/* Header with avatar and name */}
        <div className="bg-brand_primary p-6 text-center">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt={fullName}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-4 border-brand_accent"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand_accent flex items-center justify-center mx-auto mb-3 border-4 border-brand_accent/50">
              <span className="text-2xl font-bold text-brand_primary">
                {initials}
              </span>
            </div>
          )}
          <h2 className="text-xl font-bold text-white">
            {fullName}
            {isCurrentUser && (
              <span className="ml-2 text-sm font-normal text-brand_accent">(Tú)</span>
            )}
          </h2>
          <span className="inline-block mt-2 px-3 py-1 bg-brand_accent text-brand_primary text-sm font-medium rounded-full">
            {roleLabel}
          </span>
        </div>

        {/* Profile details */}
        <div className="p-6 space-y-4">
          {/* Email */}
          {member.email && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Mail className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Correo electrónico</p>
                <p className="text-sm font-medium text-gray-900 truncate">{member.email}</p>
              </div>
            </div>
          )}

          {/* School */}
          {member.school && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Building2 className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Colegio</p>
                <p className="text-sm font-medium text-gray-900 truncate">{member.school.name}</p>
              </div>
            </div>
          )}

          {/* External School Affiliation - Only for Consultants */}
          {memberRole === 'consultor' && member.external_school_affiliation && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Briefcase className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Escuela externa</p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {getExternalSchoolLabel(member.external_school_affiliation)}
                </p>
              </div>
            </div>
          )}

          {/* Generation */}
          {member.generation && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Users className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Generación</p>
                <p className="text-sm font-medium text-gray-900 truncate">{member.generation.name}</p>
              </div>
            </div>
          )}

          {/* Community */}
          {member.community && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Comunidad</p>
                <p className="text-sm font-medium text-gray-900 truncate">{member.community.name}</p>
              </div>
            </div>
          )}

          {/* Member since */}
          {member.created_at && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Calendar className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Miembro desde</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(member.created_at)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer with action */}
        <div className="px-6 pb-6 pt-2 border-t border-gray-100">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cerrar
            </button>
            <Link
              href={`/user/${member.id}`}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-brand_primary bg-brand_accent rounded-lg hover:bg-brand_accent_hover transition-colors flex items-center justify-center gap-2"
              onClick={onClose}
            >
              Ver Perfil Completo
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MemberProfileModal;
