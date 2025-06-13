import React from 'react';
import { Users, FileText, Info } from 'lucide-react';
import BlockEditorWrapper from './BlockEditorWrapper';
import { GroupAssignmentBlock } from '@/types/blocks';

interface GroupAssignmentBlockEditorProps {
  block: GroupAssignmentBlock;
  onChange: (payload: GroupAssignmentBlock['payload']) => void;
  onDelete: () => void;
  mode: 'edit' | 'preview';
  courseId: string;
}

export default function GroupAssignmentBlockEditor({
  block,
  onChange,
  onDelete,
  mode,
  courseId
}: GroupAssignmentBlockEditorProps) {
  const handleChange = (field: keyof GroupAssignmentBlock['payload'], value: any) => {
    onChange({
      ...block.payload,
      [field]: value
    });
  };

  if (mode === 'preview') {
    return (
      <BlockEditorWrapper 
        title="Tarea Grupal"
        subtitle={block.payload.title || 'Sin título'}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onDelete={onDelete}
        showSaveButton={false}
      >
        <div className="space-y-4">
          {block.payload.title && (
            <div>
              <h3 className="font-semibold text-lg text-gray-900">{block.payload.title}</h3>
            </div>
          )}
          
          {block.payload.description && (
            <div>
              <p className="text-gray-700">{block.payload.description}</p>
            </div>
          )}
          
          {block.payload.instructions && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Instrucciones:</p>
              <p className="text-gray-600 whitespace-pre-wrap">{block.payload.instructions}</p>
            </div>
          )}
          
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                Los grupos y estudiantes se asignarán cuando el instructor cree una instancia de esta tarea
              </p>
            </div>
          </div>
        </div>
      </BlockEditorWrapper>
    );
  }

  return (
    <BlockEditorWrapper 
      title="Editar Tarea Grupal"
      subtitle="Configure los detalles de la plantilla de tarea grupal"
      isCollapsed={false}
      onToggleCollapse={() => {}}
      onDelete={onDelete}
    >
      <div className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <FileText className="inline w-4 h-4 mr-1" />
            Título de la Tarea
          </label>
          <input
            type="text"
            value={block.payload.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
            placeholder="Ingrese el título de la tarea grupal"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descripción
          </label>
          <textarea
            value={block.payload.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
            rows={3}
            placeholder="Describa brevemente la tarea grupal"
          />
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Instrucciones
          </label>
          <textarea
            value={block.payload.instructions || ''}
            onChange={(e) => handleChange('instructions', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
            rows={5}
            placeholder="Proporcione instrucciones detalladas para completar la tarea"
          />
          <p className="mt-1 text-xs text-gray-500">
            Las instrucciones específicas para cada instancia se pueden personalizar al crear la tarea
          </p>
        </div>

        {/* Info Panel */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Información sobre Tareas Grupales</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Esta es una plantilla que se reutilizará para diferentes cohortes</li>
                <li>Los grupos se crearán cuando el instructor active una instancia de esta tarea</li>
                <li>Las fechas de entrega se establecerán para cada instancia específica</li>
                <li>Los estudiantes verán la tarea en "Mis Tareas" cuando esté activa</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </BlockEditorWrapper>
  );
}