/**
 * Thread Creation Modal Component
 * Allows users to create new message threads in the collaborative workspace
 */

import React, { useState } from 'react';
import { X, Hash, MessageSquare } from 'lucide-react';
import { ThreadCreationData, ThreadCategory, THREAD_CATEGORIES } from '../../types/messaging';
import { toast } from 'react-hot-toast';

interface ThreadCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateThread: (threadData: ThreadCreationData) => Promise<void>;
  loading?: boolean;
}

export default function ThreadCreationModal({
  isOpen,
  onClose,
  onCreateThread,
  loading = false
}: ThreadCreationModalProps) {
  const [formData, setFormData] = useState<ThreadCreationData>({
    thread_title: '',
    description: '',
    category: 'general' as ThreadCategory,
    custom_category_name: '',
    initial_message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [showCustomCategory, setShowCustomCategory] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.thread_title.trim()) {
      toast.error('Por favor ingresa un título para el hilo');
      return;
    }
    
    if (!formData.initial_message.trim()) {
      toast.error('Por favor ingresa un mensaje inicial');
      return;
    }
    
    if (formData.category === 'custom' && !formData.custom_category_name?.trim()) {
      toast.error('Por favor ingresa un nombre para la categoría personalizada');
      return;
    }
    
    try {
      setSubmitting(true);
      await onCreateThread(formData);
      
      // Reset form and close modal
      setFormData({
        thread_title: '',
        description: '',
        category: 'general',
        custom_category_name: '',
        initial_message: ''
      });
      setShowCustomCategory(false);
      onClose();
    } catch (error) {
      console.error('Error creating thread:', error);
      toast.error('Error al crear el hilo de conversación');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <MessageSquare className="h-6 w-6 text-[#0a0a0a]" />
            <h2 className="text-xl font-semibold text-gray-900">
              Crear Nuevo Hilo de Conversación
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Thread Title */}
          <div>
            <label htmlFor="thread_title" className="block text-sm font-medium text-gray-700 mb-1">
              Título del Hilo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="thread_title"
              value={formData.thread_title}
              onChange={(e) => setFormData({ ...formData, thread_title: e.target.value })}
              placeholder="Ej: Planificación del próximo semestre"
              disabled={submitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent disabled:opacity-50"
              maxLength={100}
            />
            <p className="mt-1 text-xs text-gray-500">
              {formData.thread_title.length}/100 caracteres
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Descripción (opcional)
            </label>
            <textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe brevemente el propósito de este hilo..."
              disabled={submitting}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent resize-none disabled:opacity-50"
              maxLength={300}
            />
            <p className="mt-1 text-xs text-gray-500">
              {(formData.description || '').length}/300 caracteres
            </p>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Categoría <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                id="category"
                value={formData.category}
                onChange={(e) => {
                  const value = e.target.value as ThreadCategory;
                  setFormData({ ...formData, category: value });
                  setShowCustomCategory(value === 'custom');
                }}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent appearance-none disabled:opacity-50"
              >
                {THREAD_CATEGORIES.map(category => (
                  <option key={category.type} value={category.type}>
                    {category.label}
                  </option>
                ))}
                <option value="custom">Otra categoría...</option>
              </select>
              <Hash className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Custom Category Name */}
          {showCustomCategory && (
            <div>
              <label htmlFor="custom_category_name" className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de la categoría personalizada <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="custom_category_name"
                value={formData.custom_category_name || ''}
                onChange={(e) => setFormData({ ...formData, custom_category_name: e.target.value })}
                placeholder="Ej: Actividades Especiales"
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent disabled:opacity-50"
                maxLength={50}
              />
              <p className="mt-1 text-xs text-gray-500">
                {(formData.custom_category_name || '').length}/50 caracteres
              </p>
            </div>
          )}

          {/* Initial Message */}
          <div>
            <label htmlFor="initial_message" className="block text-sm font-medium text-gray-700 mb-1">
              Mensaje Inicial <span className="text-red-500">*</span>
            </label>
            <textarea
              id="initial_message"
              value={formData.initial_message}
              onChange={(e) => setFormData({ ...formData, initial_message: e.target.value })}
              placeholder="Escribe el primer mensaje para iniciar la conversación..."
              disabled={submitting}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent resize-none disabled:opacity-50"
              maxLength={2000}
            />
            <p className="mt-1 text-xs text-gray-500">
              {formData.initial_message.length}/2000 caracteres
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-[#fbbf24] text-[#0a0a0a] font-medium rounded-lg hover:bg-[#fbbf24]/90 disabled:opacity-50 flex items-center space-x-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-[#0a0a0a]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Creando...</span>
                </>
              ) : (
                <span>Crear Hilo</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}