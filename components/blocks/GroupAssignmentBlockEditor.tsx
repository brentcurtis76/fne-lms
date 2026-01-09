import React from 'react';
import { Users, FileText, Info, Link, File, Plus, Trash2, ExternalLink } from 'lucide-react';
import BlockEditorWrapper from './BlockEditorWrapper';
import { GroupAssignmentBlock, GroupAssignmentResource } from '@/types/blocks';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import { Database } from '@/types/supabase';

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
  const supabase = useSupabaseClient<Database>();
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [uploadingFile, setUploadingFile] = React.useState(false);
  
  const handleChange = (field: keyof GroupAssignmentBlock['payload'], value: any) => {
    onChange({
      ...block.payload,
      [field]: value
    });
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    // In edit mode, saving is handled by the parent component (lesson editor)
    // This just provides visual feedback
    setHasUnsavedChanges(false);
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addResource = (type: 'link' | 'document') => {
    const newResource: GroupAssignmentResource = {
      id: generateId(),
      type,
      title: '',
      url: '',
      description: ''
    };

    const updatedResources = [...(block.payload.resources || []), newResource];
    handleChange('resources', updatedResources);
  };

  const updateResource = (resourceId: string, field: keyof GroupAssignmentResource, value: any) => {
    const updatedResources = (block.payload.resources || []).map(resource =>
      resource.id === resourceId ? { ...resource, [field]: value } : resource
    );
    handleChange('resources', updatedResources);
  };

  const deleteResource = (resourceId: string) => {
    const updatedResources = (block.payload.resources || []).filter(resource => resource.id !== resourceId);
    handleChange('resources', updatedResources);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, resourceId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error('Tipo de archivo no permitido. Use PDF, Word, Excel, PowerPoint, imágenes o texto.');
      return;
    }

    try {
      setUploadingFile(true);
      
      // Sanitize filename
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-_]/g, '_');
      const fileName = `group-assignments/${courseId}/${Date.now()}_${sanitizedFileName}`;

      console.log('Uploading file:', fileName, 'Type:', file.type, 'Size:', file.size);

      const { data, error } = await supabase.storage
        .from('course-materials')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false
        });

      if (error) {
        console.error('Storage upload error:', error);
        throw error;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('course-materials')
        .getPublicUrl(fileName);

      updateResource(resourceId, 'url', publicUrl);
      updateResource(resourceId, 'title', file.name);
      toast.success('Archivo subido exitosamente');
    } catch (error: any) {
      console.error('Error uploading file:', error);
      
      // Provide more specific error messages
      if (error.message?.includes('row-level security')) {
        toast.error('Error de permisos. Por favor, contacte al administrador.');
      } else if (error.message?.includes('bucket')) {
        toast.error('Error de configuración del almacenamiento.');
      } else {
        toast.error(`Error al subir el archivo: ${error.message || 'Error desconocido'}`);
      }
    } finally {
      setUploadingFile(false);
    }
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
          
          {block.payload.resources && block.payload.resources.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Recursos ({block.payload.resources.length}):</p>
              <div className="space-y-2">
                {block.payload.resources.map((resource) => (
                  <div key={resource.id} className="flex items-center gap-2">
                    {resource.type === 'link' ? (
                      <ExternalLink className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <File className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-700">{resource.title || 'Sin título'}</span>
                  </div>
                ))}
              </div>
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
      onSave={handleSave}
      showSaveButton={true}
      saveButtonText="Guardar Tarea"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
            rows={5}
            placeholder="Proporcione instrucciones detalladas para completar la tarea"
          />
          <p className="mt-1 text-xs text-gray-500">
            Las instrucciones específicas para cada instancia se pueden personalizar al crear la tarea
          </p>
        </div>

        {/* Resources Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Recursos para la Tarea
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => addResource('link')}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm flex items-center gap-1"
              >
                <Link className="w-4 h-4" />
                Agregar Enlace
              </button>
              <button
                type="button"
                onClick={() => addResource('document')}
                className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm flex items-center gap-1"
              >
                <File className="w-4 h-4" />
                Agregar Documento
              </button>
            </div>
          </div>

          {block.payload.resources && block.payload.resources.length > 0 ? (
            <div className="space-y-3">
              {block.payload.resources.map((resource) => (
                <div key={resource.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {resource.type === 'link' ? (
                        <ExternalLink className="w-5 h-5 text-blue-600" />
                      ) : (
                        <File className="w-5 h-5 text-gray-600" />
                      )}
                      <span className="font-medium text-gray-900">
                        {resource.type === 'link' ? 'Enlace' : 'Documento'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteResource(resource.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Título del recurso
                      </label>
                      <input
                        type="text"
                        value={resource.title}
                        onChange={(e) => updateResource(resource.id, 'title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder={resource.type === 'link' ? 'Nombre del enlace' : 'Nombre del documento'}
                      />
                    </div>

                    {resource.type === 'link' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          URL del enlace
                        </label>
                        <input
                          type="url"
                          value={resource.url}
                          onChange={(e) => updateResource(resource.id, 'url', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="https://ejemplo.com/recurso"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Archivo
                        </label>
                        {resource.url ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={resource.url}
                              readOnly
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                            />
                            <button
                              type="button"
                              onClick={() => updateResource(resource.id, 'url', '')}
                              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                            >
                              Cambiar
                            </button>
                          </div>
                        ) : (
                          <div>
                            <input
                              type="file"
                              onChange={(e) => handleFileUpload(e, resource.id)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                              disabled={uploadingFile}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif"
                            />
                            {uploadingFile && (
                              <p className="mt-1 text-sm text-blue-600">Subiendo archivo...</p>
                            )}
                            <p className="mt-1 text-xs text-gray-500">
                              Formatos permitidos: PDF, Word, Excel, PowerPoint, texto e imágenes (máx. 10MB)
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descripción (opcional)
                      </label>
                      <textarea
                        value={resource.description || ''}
                        onChange={(e) => updateResource(resource.id, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        rows={2}
                        placeholder="Breve descripción del recurso"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <File className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No hay recursos agregados</p>
              <p className="text-sm text-gray-500 mt-1">
                Los recursos serán visibles para los estudiantes en el espacio colaborativo
              </p>
            </div>
          )}

          <p className="mt-2 text-xs text-gray-500">
            Nota: Los recursos no se mostrarán en la lección, solo estarán disponibles cuando los estudiantes accedan a la tarea en el espacio colaborativo.
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
        
        {/* Save Info */}
        {hasUnsavedChanges && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center">
              <Info className="h-4 w-4 text-yellow-600 mr-2 flex-shrink-0" />
              <p className="text-sm text-yellow-800">
                Los cambios se guardarán automáticamente al hacer clic en "Guardar Tarea" o al guardar la lección completa.
              </p>
            </div>
          </div>
        )}
      </div>
    </BlockEditorWrapper>
  );
}