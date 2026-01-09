'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { CourseProposal, CreateCourseProposalInput } from '../../types/course-proposals';

interface CourseProposalModalProps {
  isOpen: boolean;
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

export function CourseProposalModal({ isOpen, onClose, onSubmit, editingProposal }: CourseProposalModalProps) {
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-brand_primary">
            {isEditing ? 'Editar Propuesta de Curso' : 'Nueva Propuesta de Curso'}
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            {isEditing
              ? 'Modifica los detalles de tu propuesta de curso.'
              : 'Comparte tu idea para un nuevo curso que beneficiaría a la plataforma.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Título */}
          <div>
            <label
              htmlFor="titulo"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Título del curso <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="titulo"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              placeholder="Ej: Estrategias de Aprendizaje Colaborativo"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent transition-all"
              disabled={isSubmitting}
            />
          </div>

          {/* Descripción corta */}
          <div>
            <label
              htmlFor="descripcion_corta"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Descripción corta <span className="text-red-500">*</span>
            </label>
            <textarea
              id="descripcion_corta"
              name="descripcion_corta"
              value={formData.descripcion_corta}
              onChange={handleChange}
              rows={3}
              placeholder="Describe brevemente de qué se trataría el curso..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent transition-all resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Competencias a desarrollar */}
          <div>
            <label
              htmlFor="competencias_desarrollar"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Competencias a desarrollar <span className="text-red-500">*</span>
            </label>
            <textarea
              id="competencias_desarrollar"
              name="competencias_desarrollar"
              value={formData.competencias_desarrollar}
              onChange={handleChange}
              rows={4}
              placeholder="¿Qué habilidades o competencias desarrollarían los participantes?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent transition-all resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Tiempo requerido */}
          <div>
            <label
              htmlFor="tiempo_requerido_desarrollo"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Tiempo requerido para desarrollar el contenido <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="tiempo_requerido_desarrollo"
              name="tiempo_requerido_desarrollo"
              value={formData.tiempo_requerido_desarrollo}
              onChange={handleChange}
              placeholder="Ej: 2 semanas, 1 mes, 3 meses"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_accent focus:border-transparent transition-all"
              disabled={isSubmitting}
            />
          </div>

          {/* Checkbox - Necesita ayuda */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="necesita_ayuda_diseno_instruccional"
              name="necesita_ayuda_diseno_instruccional"
              checked={formData.necesita_ayuda_diseno_instruccional}
              onChange={handleChange}
              className="mt-1 h-4 w-4 text-brand_accent border-gray-300 rounded focus:ring-brand_accent"
              disabled={isSubmitting}
            />
            <label
              htmlFor="necesita_ayuda_diseno_instruccional"
              className="text-sm text-gray-700"
            >
              <span className="font-medium">¿Necesita ayuda con el diseño instruccional?</span>
              <p className="text-gray-500 text-xs mt-0.5">
                Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.
              </p>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-brand_primary bg-brand_accent rounded-lg hover:bg-brand_accent_hover transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Guardando...
                </>
              ) : (
                isEditing ? 'Guardar Cambios' : 'Enviar Propuesta'
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CourseProposalModal;
