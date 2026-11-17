/**
 * The member profile pop-up's pure pieces, one copy for both looks (redesign 6C): the name with its
 * fallbacks, the initial, the role and its label, the date text, and which rows show. Moved word for
 * word out of `MemberProfileModal.tsx`; today's markup and the new look's markup both read them.
 */
import { ROLE_NAMES, UserRoleType, UserProfile } from '../../types/roles';

/** The member's role, its label (or «Sin rol asignado»), the full name (or «Usuario»), the initial. */
export function memberProfileText(member: UserProfile) {
  const memberRole = member.user_roles?.[0]?.role_type as UserRoleType | undefined;
  const roleLabel = memberRole ? ROLE_NAMES[memberRole] : 'Sin rol asignado';
  const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Usuario';
  const initials = (member.first_name?.charAt(0) || 'U').toUpperCase();
  return { memberRole, roleLabel, fullName, initials };
}

/** «{d} de {mes} de {yyyy}», or «No disponible» without a date. */
export const formatMemberDate = (dateString?: string) => {
  if (!dateString) return 'No disponible';
  const date = new Date(dateString);
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
};

/**
 * Which rows of details show, under today's conditions. `school`, `generation` and `community` need
 * the named objects, which the panel never sends (only their ids): the new look does not draw them.
 */
export function memberProfileRows(member: UserProfile, memberRole: UserRoleType | undefined) {
  return {
    email: Boolean(member.email),
    school: Boolean(member.school),
    externalSchool: Boolean(memberRole === 'consultor' && member.external_school_affiliation),
    generation: Boolean(member.generation),
    community: Boolean(member.community),
    memberSince: Boolean(member.created_at),
  };
}
