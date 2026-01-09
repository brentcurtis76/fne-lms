'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Lightbulb, Plus, AlertCircle } from 'lucide-react';
import { CourseProposal, CreateCourseProposalInput } from '../../types/course-proposals';
import { CourseProposalCard } from './CourseProposalCard';
import { CourseProposalModal } from './CourseProposalModal';
import { ConfirmDialog } from './ConfirmDialog';

interface CourseProposalSectionProps {
  userId?: string;
}

export function CourseProposalSection({ userId }: CourseProposalSectionProps) {
  const [proposals, setProposals] = useState<CourseProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<CourseProposal | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [proposalToDelete, setProposalToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProposals = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/course-proposals');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al cargar propuestas');
      }

      setProposals(result.data || []);
    } catch (err: any) {
      console.error('[CourseProposalSection] Error fetching:', err);
      setError(err.message || 'Error al cargar propuestas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleSubmitProposal = async (data: CreateCourseProposalInput) => {
    if (editingProposal) {
      // Update existing proposal
      const response = await fetch(`/api/course-proposals/${editingProposal.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al actualizar propuesta');
      }

      // Update the proposal in the list
      if (result.data) {
        setProposals((prev) =>
          prev.map((p) => (p.id === editingProposal.id ? result.data : p))
        );
      }
    } else {
      // Create new proposal
      const response = await fetch('/api/course-proposals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear propuesta');
      }

      // Add the new proposal to the list
      if (result.data) {
        setProposals((prev) => [result.data, ...prev]);
      }
    }
  };

  const handleEditProposal = (proposal: CourseProposal) => {
    setEditingProposal(proposal);
    setIsModalOpen(true);
  };

  const handleRequestDelete = (proposalId: string) => {
    setProposalToDelete(proposalId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!proposalToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/course-proposals/${proposalToDelete}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al eliminar propuesta');
      }

      // Remove from list
      setProposals((prev) => prev.filter((p) => p.id !== proposalToDelete));
      setDeleteConfirmOpen(false);
      setProposalToDelete(null);
    } catch (err: any) {
      console.error('[CourseProposalSection] Error deleting:', err);
      alert(err.message || 'Error al eliminar propuesta');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
    setProposalToDelete(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProposal(null);
  };

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
          onClick={() => {
            setEditingProposal(null);
            setIsModalOpen(true);
          }}
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
            onClick={() => {
              setEditingProposal(null);
              setIsModalOpen(true);
            }}
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
