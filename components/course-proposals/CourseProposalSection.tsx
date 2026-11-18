'use client';

import React from 'react';
import { Lightbulb, Plus, AlertCircle } from 'lucide-react';
import { useCourseProposals } from './useCourseProposals';
import { CourseProposalCard } from './CourseProposalCard';
import { CourseProposalModal } from './CourseProposalModal';
import { ConfirmDialog } from './ConfirmDialog';

interface CourseProposalSectionProps {
  userId?: string;
}

export function CourseProposalSection({ userId }: CourseProposalSectionProps) {
  // State, requests and handlers: ./useCourseProposals (shared with the new look)
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

  // Loading skeleton
  if (loading) {
    return (
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand_accent/10 rounded-lg">
              <Lightbulb className="w-5 h-5 text-brand_accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand_primary">Propuestas de Cursos</h2>
              <p className="text-sm text-gray-500">Me gustaría realizar un curso en la plataforma</p>
            </div>
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-none w-[280px] h-[280px] bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand_accent/10 rounded-lg">
              <Lightbulb className="w-5 h-5 text-brand_accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand_primary">Propuestas de Cursos</h2>
              <p className="text-sm text-gray-500">Me gustaría realizar un curso en la plataforma</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button
            onClick={fetchProposals}
            className="ml-auto text-sm font-medium underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand_accent/10 rounded-lg">
            <Lightbulb className="w-5 h-5 text-brand_accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-brand_primary">Propuestas de Cursos</h2>
            <p className="text-sm text-gray-500">Me gustaría realizar un curso en la plataforma</p>
          </div>
        </div>

        {/* Create button */}
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-brand_accent text-brand_primary font-medium rounded-lg hover:bg-brand_accent_hover transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nueva Propuesta</span>
        </button>
      </div>

      {/* Proposals list */}
      {proposals.length > 0 ? (
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
            {proposals.map((proposal) => (
              <div
                key={proposal.id}
                className="flex-none w-[260px] sm:w-[280px] snap-start"
              >
                <CourseProposalCard
                  proposal={proposal}
                  currentUserId={userId}
                  onEdit={handleEditProposal}
                  onDelete={handleRequestDelete}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-600 mb-1">
            Sin propuestas aún
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Sé el primero en proponer un nuevo curso
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand_accent text-brand_primary font-medium rounded-lg hover:bg-brand_accent_hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear Propuesta
          </button>
        </div>
      )}

      {/* Modal */}
      <CourseProposalModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmitProposal}
        editingProposal={editingProposal}
      />

      {/* Confirm Delete Dialog */}
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
    </section>
  );
}

export default CourseProposalSection;
