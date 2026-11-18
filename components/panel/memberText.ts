/**
 * The texts of a member of the growth community, one copy for both views of «Mi Panel» (redesign
 * 6B). Moved word for word out of today's markup (`PanelClasico.tsx`), which calls it as the new
 * view does. Worked out only where the markup worked them out: the initial for each avatar drawn,
 * the tile's texts for each tile drawn (the partner school's label is asked only for a consultor
 * with an affiliation, as the markup asked it).
 */
import { ROLE_NAMES, UserRoleType, UserProfile, UserRole } from '../../types/roles';
import { getExternalSchoolLabel } from '../../constants/externalSchools';

/*
 * The community bar's own rules (6B, send-back 2), for the new view ONLY: today's markup
 * (`PanelClasico.tsx`) is not edited again for this and keeps its inline copy; each expression below
 * is that copy word for word, with the lines it mirrors. `__tests__/pages/dashboard.samePanel.test.tsx`
 * holds the two together (the bar's line, the avatars, «+{n}», the picker's labels and choice).
 */

/** The school's or the community's name (the bar's line and the opened heading). Mirrors lines 128 and 192. */
export const communityPlaceName = (selectedRole: UserRole) => selectedRole.school?.name || selectedRole.community!.name;

/** The workspace picture's alternative text. Mirrors line 115. */
export const workspaceImageAlt = (workspace: { custom_name?: string | null }, selectedRole: UserRole) =>
  workspace.custom_name || selectedRole.community!.name;

/** The small avatars on the bar: the first four members, and «+{n}» for the others. Mirrors lines 134, 151 and 153. */
export const memberStack = (members: UserProfile[]) => ({
  shown: members.slice(0, 4),
  hasMore: members.length > 4,
  moreCount: members.length - 4,
});

/** A picker button's label. Mirrors line 183. */
export const communityChoiceLabel = (comm: UserRole) => comm.school?.name || comm.community?.name;

/** The picker's chosen community. Mirrors line 178. */
export const isChosenCommunity = (comm: UserRole, effectiveCommunityId: string | null | undefined) =>
  comm.community_id === effectiveCommunityId;

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
