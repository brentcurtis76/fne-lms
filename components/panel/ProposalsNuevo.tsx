import React from 'react';
import { BookOpen, Clock, HelpCircle, Lightbulb, Pencil, Plus, Trash2, User } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Notice, Skeleton, type BadgeTone } from '../ui/kit';
import { useCourseProposals } from '../course-proposals/useCourseProposals';
import { CourseProposalModal } from '../course-proposals/CourseProposalModal';
import { ConfirmDialog } from '../course-proposals/ConfirmDialog';
import { formatDate, getStatusBadge, proposalCreatorName, isProposalOwner } from '../course-proposals/proposalCardText';
import type { CourseProposal } from '../../types/course-proposals';
import { PanelSection, ROW_ITEM, fullTitle } from './PanelSection';

/**
 * The new look's «Propuestas de Cursos» (redesign 6B). It reads `useCourseProposals()`, the same
 * state, requests and handlers today's section uses; the form and the confirmation are TODAY's
 * components, opened by those handlers with the same props. Loading, error and empty states are the
 * kit's pieces with today's words.
 */

const TITLE = 'Propuestas de Cursos';
const SUB = 'Me gustaría realizar un curso en la plataforma';

/** The state word's tone, by the word today's card shows (its default for an unknown state included). */
const TONE: Record<string, BadgeTone> = {
  Pendiente: 'warning',
  'En Revisión': 'info',
  Aprobada: 'success',
  Rechazada: 'error',
};

function ProposalCardNuevo({
  proposal,
  currentUserId,
  onEdit,
  onDelete,
}: {
  proposal: CourseProposal;
  currentUserId?: string;
  onEdit: (proposal: CourseProposal) => void;
  onDelete: (proposalId: string) => void;
}) {
  const status = getStatusBadge(proposal.status);
  const isOwner = isProposalOwner(proposal, currentUserId);

  return (
    <Card className="flex h-full flex-col gap-2 p-3.5" data-testid={`panel-proposal-${proposal.id}`}>
      <div className="flex items-center justify-between gap-2">
        <Badge tone={TONE[status.label] ?? 'warning'}>{status.label}</Badge>
        {isOwner && (
          <span className="inline-flex">
            <Button variant="quiet" iconOnly aria-label="Editar propuesta" onClick={() => onEdit(proposal)}>
              <Pencil aria-hidden="true" />
            </Button>
            <Button variant="quiet" iconOnly aria-label="Eliminar propuesta" onClick={() => onDelete(proposal.id)}>
              <Trash2 aria-hidden="true" />
            </Button>
          </span>
        )}
      </div>
      <h3 className="line-clamp-2 font-mont text-[0.8125rem] font-bold uppercase leading-[1.5] tracking-[0.1em] text-brand_primary" {...fullTitle(proposal.titulo)}>
        {proposal.titulo}
      </h3>
      <p className="line-clamp-3 text-[0.8125rem] text-gray-600">{proposal.descripcion_corta}</p>
      <p className="flex items-start gap-1.5 text-[0.8125rem] text-gray-600">
        <BookOpen aria-hidden="true" className="mt-0.5 h-[13px] w-[13px] flex-none" />
        <span className="line-clamp-2">{proposal.competencias_desarrollar}</span>
      </p>
      <p className="flex items-center gap-1.5 text-[0.8125rem] text-gray-600">
        <Clock aria-hidden="true" className="h-[13px] w-[13px] flex-none" />
        {proposal.tiempo_requerido_desarrollo}
      </p>
      {proposal.necesita_ayuda_diseno_instruccional && (
        <p className="flex items-center gap-1.5 rounded-sm bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-700">
          <HelpCircle aria-hidden="true" className="h-[13px] w-[13px] flex-none" />
          Solicita ayuda con diseño instruccional
        </p>
      )}
      <p className="mt-auto flex justify-between gap-2 border-t border-brand_primary/[0.12] pt-2 text-xs text-gray-600">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <User aria-hidden="true" className="h-3 w-3 flex-none" />
          <span className="truncate" {...fullTitle(proposalCreatorName(proposal))}>{proposalCreatorName(proposal)}</span>
        </span>
        <span className="flex-none">{formatDate(proposal.created_at)}</span>
      </p>
    </Card>
  );
}

export function ProposalsNuevo({ userId }: { userId?: string }) {
  const {
    proposals,
    loading,
    error,
    isModalOpen,
    editingProposal,
    deleteConfirmOpen,
    isDeleting,
    fetchProposals,
    handleSubmitProposal,
    handleEditProposal,
    handleRequestDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleCloseModal,
    openCreate,
  } = useCourseProposals();

  if (loading) {
    return (
      <PanelSection title={TITLE} icon={<Lightbulb />} sub={SUB} data-testid="panel-section-proposals">
        <div className="flex gap-[14px] overflow-hidden">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className={ROW_ITEM} height={280} />
          ))}
        </div>
      </PanelSection>
    );
  }

  if (error) {
    return (
      <PanelSection title={TITLE} icon={<Lightbulb />} sub={SUB} data-testid="panel-section-proposals">
        <Notice tone="error">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchProposals}>
              Reintentar
            </Button>
          </span>
        </Notice>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection
        title={TITLE}
        icon={<Lightbulb />}
        sub={SUB}
        row={proposals.length > 0}
        itemsKey={proposals.map((p) => p.id).join(' ')}
        data-testid="panel-section-proposals"
        action={
          <Button size="sm" onClick={openCreate} data-testid="panel-proposals-new">
            <Plus aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Nueva Propuesta</span>
          </Button>
        }
      >
        {proposals.length > 0 ? (
          proposals.map((proposal) => (
            <div key={proposal.id} className={ROW_ITEM}>
              <ProposalCardNuevo
                proposal={proposal}
                currentUserId={userId}
                onEdit={handleEditProposal}
                onDelete={handleRequestDelete}
              />
            </div>
          ))
        ) : (
          <Card>
            <EmptyState
              icon={<Lightbulb strokeWidth={1.25} />}
              title="Sin propuestas aún"
              description="Sé el primero en proponer un nuevo curso"
              action={
                <Button onClick={openCreate}>
                  <Plus aria-hidden="true" />
                  Crear Propuesta
                </Button>
              }
            />
          </Card>
        )}
      </PanelSection>

      {/* Today's form and confirmation, with today's props */}
      <CourseProposalModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmitProposal}
        editingProposal={editingProposal}
      />
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        title="Eliminar Propuesta"
        description="¿Estás seguro de que deseas eliminar esta propuesta? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        isLoading={isDeleting}
        variant="danger"
      />
    </>
  );
}

export default ProposalsNuevo;
