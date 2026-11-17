import React, { useState, useEffect } from 'react';
import { CourseProposal, CreateCourseProposalInput } from '../../types/course-proposals';

/**
 * The course proposal form's state, effect, validation, submit, cancel and close rules, one copy for
 * both looks (redesign 6C). Moved word for word out of `CourseProposalModal.tsx` (the same states in the
 * same order, the same effect with the same dependency list, the same handlers); today's markup and the
 * new look's markup both read it.
 */
export interface CourseProposalFormInput {
  onClose: () => void;
  onSubmit: (data: CreateCourseProposalInput) => Promise<void>;
  editingProposal?: CourseProposal | null;
}

const emptyFormData: CreateCourseProposalInput = {
  titulo: '',
  descripcion_corta: '',
  competencias_desarrollar: '',
  tiempo_requerido_desarrollo: '',
  necesita_ayuda_diseno_instruccional: false,
};

export function useCourseProposalForm({ onClose, onSubmit, editingProposal }: CourseProposalFormInput) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateCourseProposalInput>(emptyFormData);

  const isEditing = !!editingProposal;

  // Populate form when editing
  useEffect(() => {
    if (editingProposal) {
      setFormData({
        titulo: editingProposal.titulo,
        descripcion_corta: editingProposal.descripcion_corta,
        competencias_desarrollar: editingProposal.competencias_desarrollar,
        tiempo_requerido_desarrollo: editingProposal.tiempo_requerido_desarrollo,
        necesita_ayuda_diseno_instruccional: editingProposal.necesita_ayuda_diseno_instruccional,
      });
    } else {
      setFormData(emptyFormData);
    }
  }, [editingProposal]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    if (!formData.titulo.trim()) {
      setError('El título es requerido');
      return;
    }
    if (!formData.descripcion_corta.trim()) {
      setError('La descripción es requerida');
      return;
    }
    if (!formData.competencias_desarrollar.trim()) {
      setError('Las competencias a desarrollar son requeridas');
      return;
    }
    if (!formData.tiempo_requerido_desarrollo.trim()) {
      setError('El tiempo requerido es requerido');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      // Reset form and close modal on success
      setFormData(emptyFormData);
      onClose();
    } catch (err: any) {
      setError(err.message || (isEditing ? 'Error al actualizar la propuesta' : 'Error al crear la propuesta'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      setFormData(emptyFormData);
      onClose();
    }
  };

  return {
    isSubmitting,
    error,
    formData,
    isEditing,
    handleChange,
    handleSubmit,
    handleClose,
  };
}
