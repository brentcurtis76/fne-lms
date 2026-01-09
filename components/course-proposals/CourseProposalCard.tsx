'use client';

import React from 'react';
import { Clock, HelpCircle, User, BookOpen, Pencil, Trash2 } from 'lucide-react';
import { CourseProposal } from '../../types/course-proposals';

interface CourseProposalCardProps {
  proposal: CourseProposal;
  currentUserId?: string;
  onEdit?: (proposal: CourseProposal) => void;
  onDelete?: (proposalId: string) => void;
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const getStatusBadge = (status: CourseProposal['status']) => {
  const statusConfig = {
    pending: { label: 'Pendiente', bg: 'bg-brand_accent', text: 'text-brand_primary' },
    reviewed: { label: 'En Revisión', bg: 'bg-blue-500', text: 'text-white' },
    approved: { label: 'Aprobada', bg: 'bg-green-500', text: 'text-white' },
    rejected: { label: 'Rechazada', bg: 'bg-red-500', text: 'text-white' },
  };
  return statusConfig[status] || statusConfig.pending;
};

export function CourseProposalCard({ proposal, currentUserId, onEdit, onDelete }: CourseProposalCardProps) {
  const statusBadge = getStatusBadge(proposal.status);
  const creatorName = proposal.creator
    ? `${proposal.creator.first_name || ''} ${proposal.creator.last_name || ''}`.trim() || proposal.creator.email
    : 'Usuario';

  const isOwner = currentUserId && proposal.created_by === currentUserId;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit(proposal);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(proposal.id);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg bg-brand_primary shadow-lg hover:shadow-xl transition-all duration-200">
      {/* Header with status badge and actions */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}
          >
            {statusBadge.label}
          </span>

          {/* Edit/Delete buttons - only for owner */}
          {isOwner && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleEdit}
                className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
                title="Editar propuesta"
              >
                <Pencil className="w-4 h-4 text-gray-400 hover:text-brand_accent" />
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
                title="Eliminar propuesta"
              >
                <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
              </button>
            </div>
          )}
        </div>
        <h3 className="mt-3 text-base font-bold text-white line-clamp-2">
          {proposal.titulo}
        </h3>
      </div>

      {/* Content */}
      <div className="px-4 pb-4 space-y-3">
        {/* Description */}
        <p className="text-sm text-gray-400 line-clamp-3">
          {proposal.descripcion_corta}
        </p>

        {/* Competencias preview */}
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-brand_accent flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 line-clamp-2">
            {proposal.competencias_desarrollar}
          </p>
        </div>

        {/* Time required */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand_accent" />
          <span className="text-xs text-gray-400">
            {proposal.tiempo_requerido_desarrollo}
          </span>
        </div>

        {/* Needs instructional design help */}
        {proposal.necesita_ayuda_diseno_instruccional && (
          <div className="flex items-center gap-2 bg-brand_accent/10 rounded-md px-2 py-1.5">
            <HelpCircle className="w-4 h-4 text-brand_accent" />
            <span className="text-xs text-brand_accent font-medium">
              Solicita ayuda con diseño instruccional
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand_accent/20">
            <User className="h-3 w-3 text-brand_accent" />
          </div>
          <span className="text-xs text-gray-400 truncate max-w-[120px]">
            {creatorName}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {formatDate(proposal.created_at)}
        </span>
      </div>
    </div>
  );
}

export default CourseProposalCard;
