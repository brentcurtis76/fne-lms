/**
 * The texts of a member of the growth community, one copy for both views of «Mi Panel» (redesign
 * 6B). Moved word for word out of today's markup (`PanelClasico.tsx`), which calls it as the new
 * view does. Worked out only where the markup worked them out: the initial for each avatar drawn,
 * the tile's texts for each tile drawn (the partner school's label is asked only for a consultor
 * with an affiliation, as the markup asked it).
 */
import { ROLE_NAMES, UserRoleType, UserProfile } from '../../types/roles';
import { getExternalSchoolLabel } from '../../constants/externalSchools';

/** The letter on an avatar without a photo. */
export const memberInitial = (member: UserProfile) => member.first_name?.charAt(0) || 'U';

/** A member tile's texts: the full name (with its fallbacks), the role's label, the partner school, «Tú». */
export function memberTile(member: UserProfile, viewerId: string | undefined) {
  const memberRole = member.user_roles?.[0]?.role_type as UserRoleType | undefined;
  const roleLabel = memberRole ? ROLE_NAMES[memberRole] : null;
  const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ') || (member as any).name || 'Usuario';
  const showsExternalSchool = memberRole === 'consultor' && member.external_school_affiliation;
  const externalSchoolLabel = showsExternalSchool ? getExternalSchoolLabel(member.external_school_affiliation!) : null;
  const isViewer = member.id === viewerId;
  return { memberRole, roleLabel, fullName, showsExternalSchool, externalSchoolLabel, isViewer };
}
