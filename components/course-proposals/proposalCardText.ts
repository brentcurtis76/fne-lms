/**
 * The words of a course proposal card, one copy for both looks (redesign 6B). Moved word for word
 * out of `CourseProposalCard.tsx`, which imports them back; the new look's proposal card calls the
 * same functions. (The state's colour classes are today's card's; the new look reads only `label`.)
 */
import type { CourseProposal } from '../../types/course-proposals';

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

export const getStatusBadge = (status: CourseProposal['status']) => {
  const statusConfig = {
    pending: { label: 'Pendiente', bg: 'bg-brand_accent', text: 'text-brand_primary' },
    reviewed: { label: 'En Revisión', bg: 'bg-blue-500', text: 'text-white' },
    approved: { label: 'Aprobada', bg: 'bg-green-500', text: 'text-white' },
    rejected: { label: 'Rechazada', bg: 'bg-red-500', text: 'text-white' },
  };
  return statusConfig[status] || statusConfig.pending;
};

/** The creator's name: first and last name, else the e-mail, else «Usuario» without a creator. */
export const proposalCreatorName = (proposal: CourseProposal) =>
  proposal.creator
    ? `${proposal.creator.first_name || ''} ${proposal.creator.last_name || ''}`.trim() || proposal.creator.email
    : 'Usuario';

/** The viewer's own proposal (the pencil and the bin are drawn). The card's expression, as it was. */
export const isProposalOwner = (proposal: CourseProposal, currentUserId?: string) =>
  currentUserId && proposal.created_by === currentUserId;
