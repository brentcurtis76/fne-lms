import { useState, useEffect, useCallback } from 'react';
import { CourseProposal, CreateCourseProposalInput } from '../../types/course-proposals';

/**
 * «Propuestas de Cursos»'s state, its requests and its handlers, one copy for both looks (redesign
 * 6B). Moved word for word out of `CourseProposalSection.tsx` (the same states in the same order,
 * the same callback and effect with the same dependency lists, the same handlers); the section and
 * the new look's section both call it. `openCreate` is the handler the two create buttons wrote
 * inline. The browser `alert` after a failed deletion stays (a later release replaces it).
 */
export function useCourseProposals() {
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

  // «Nueva Propuesta» and «Crear Propuesta»: the form in create mode
  const openCreate = () => {
    setEditingProposal(null);
    setIsModalOpen(true);
  };

  return {
    proposals,
    loading,
    error,
    isModalOpen,
    editingProposal,
    deleteConfirmOpen,
    proposalToDelete,
    isDeleting,
    fetchProposals,
    handleSubmitProposal,
    handleEditProposal,
    handleRequestDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleCloseModal,
    openCreate,
  };
}
