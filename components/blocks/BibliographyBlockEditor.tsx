import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, FileText, Link, GripVertical, ChevronDown, ChevronUp, Upload, Image, Edit2 } from 'lucide-react';
import BlockEditorWrapper from './BlockEditorWrapper';
import { BibliographyBlock, BibliographyItem } from '@/types/blocks';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';

interface BibliographyBlockEditorProps {
  block: BibliographyBlock;
  onChange: (payload: BibliographyBlock['payload']) => void;
  onDelete: () => void;
  mode: 'edit' | 'preview';
  courseId: string;
  onSave?: () => void;
}

export default function BibliographyBlockEditor({
  block,
  onChange,
  onDelete,
  mode,
  courseId,
  onSave
}: BibliographyBlockEditorProps) {
  const supabase = useSupabaseClient();
  const [uploadingFile, setUploadingFile] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleChange = (field: keyof BibliographyBlock['payload'], value: any) => {
    onChange({
      ...block.payload,
      [field]: value
    });
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    setHasUnsavedChanges(false);
  };

  const addItem = (type: 'pdf' | 'link' | 'image') => {
    const newItem: BibliographyItem = {
      id: generateId(),
      type,
      title: '',
      description: '',
      url: '',
      author: '',
      year: new Date().getFullYear().toString(),
      category: ''
    };

    const updatedItems = [...(block.payload.items || []), newItem];
    handleChange('items', updatedItems);
    // Automatically expand newly added items for immediate editing
    setExpandedItems(new Set(Array.from(expandedItems).concat(newItem.id)));
    
    // Show a helpful toast
    toast.success(`${type === 'pdf' ? 'PDF' : type === 'image' ? 'Imagen' : 'Enlace'} agregado. Complete los detalles abajo.`, {
      duration: 3000,
      icon: '📝'
    });
  };

  const updateItem = (itemId: string, field: keyof BibliographyItem, value: any) => {
    const updatedItems = block.payload.items.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    );
    handleChange('items', updatedItems);
  };

  const deleteItem = (itemId: string) => {
    const updatedItems = block.payload.items.filter(item => item.id !== itemId);
    handleChange('items', updatedItems);
    const newExpanded = new Set(expandedItems);
    newExpanded.delete(itemId);
    setExpandedItems(newExpanded);
  };

  const toggleItemExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, itemId: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type based on item type
    const itemType = block.payload.items.find(item => item.id === itemId)?.type;
    
    if (itemType === 'pdf' && file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF');
      return;
    }
    
    if (itemType === 'image' && !file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen (JPG, PNG, GIF, etc.)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }

    try {
      setUploadingFile(true);
      
      // Sanitize filename
      const fileExt = file.name.split('.').pop() || '';
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
      const sanitizedFileName = `${baseName}.${fileExt}`;
      const fileName = `bibliography/${courseId}/${Date.now()}_${sanitizedFileName}`;

      const { data, error } = await supabase.storage
        .from('course-materials')
        .upload(fileName, file);

      if (error) throw error;

      const publicUrlData = supabase.storage
        .from('course-materials')
        .getPublicUrl(fileName);

      if (!publicUrlData.data || !publicUrlData.data.publicUrl) {
        throw new Error('Could not get public URL for uploaded file');
      }

      updateItem(itemId, 'url', publicUrlData.data.publicUrl);
      updateItem(itemId, 'filename', file.name);
      updateItem(itemId, 'filesize', file.size);
      
      // Only set title if it's empty
      const currentItem = block.payload.items.find(item => item.id === itemId);
      if (!currentItem?.title) {
        updateItem(itemId, 'title', file.name.replace(/\.[^/.]+$/, ''));
      }
      
      // Show appropriate success message
      if (itemType === 'pdf') {
        toast.success('PDF subido exitosamente');
      } else if (itemType === 'image') {
        toast.success('Imagen subida exitosamente');
      }
      
      // Auto-save after successful upload to prevent data loss
      if (onSave) {
        setTimeout(() => {
          onSave();
          toast.success('Guardando cambios automáticamente...', {
            duration: 2000,
            icon: '💾'
          });
        }, 500); // Small delay to ensure state updates are processed
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error al subir el archivo');
    } finally {
      setUploadingFile(false);
    }
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const items = [...block.payload.items];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= items.length) return;
    
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    handleChange('items', items);
  };

  if (mode === 'preview') {
    return (
      <BlockEditorWrapper 
        title="Bibliografía"
        subtitle={block.payload.title || 'Referencias y recursos'}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onDelete={onDelete}
        showSaveButton={false}
      >
        <div className="space-y-4">
          {block.payload.title && (
            <h3 className="font-semibold text-lg text-gray-900">{block.payload.title}</h3>
          )}
          
          {block.payload.description && (
            <p className="text-gray-700">{block.payload.description}</p>
          )}
          
          <div className="space-y-2">
            {block.payload.items?.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                {item.type === 'pdf' ? (
                  <FileText className="w-5 h-5 text-red-600 flex-shrink-0" />
                ) : item.type === 'image' ? (
                  <Image className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <Link className="w-5 h-5 text-blue-600 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.title || 'Sin título'}</p>
                  {item.author && <p className="text-sm text-gray-600">{item.author}</p>}
                </div>
              </div>
            ))}
          </div>
          
          {(!block.payload.items || block.payload.items.length === 0) && (
            <p className="text-gray-500 text-center py-4">No hay recursos agregados</p>
          )}
        </div>
      </BlockEditorWrapper>
    );
  }

  return (
    <BlockEditorWrapper 
      title="Editar Bibliografía"
      subtitle="Configure las referencias y recursos"
      isCollapsed={false}
      onToggleCollapse={() => {}}
      onDelete={onDelete}
      onSave={handleSave}
      showSaveButton={true}
      saveButtonText="Guardar Bibliografía"
    >
      <div className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <BookOpen className="inline w-4 h-4 mr-1" />
            Título de la Sección
          </label>
          <input
            type="text"
            value={block.payload.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
            placeholder="Ej: Bibliografía & Recursos"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Descripción (opcional)
          </label>
          <textarea
            value={block.payload.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
            rows={2}
            placeholder="Descripción breve de los recursos disponibles"
          />
        </div>

        {/* Display Options */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={block.payload.showCategories || false}
              onChange={(e) => handleChange('showCategories', e.target.checked)}
              className="w-4 h-4 text-[#00365b] focus:ring-[#00365b] border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">Agrupar por categorías</span>
          </label>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Ordenar por:</label>
            <select
              value={block.payload.sortBy || 'manual'}
              onChange={(e) => handleChange('sortBy', e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="manual">Manual</option>
              <option value="title">Título</option>
              <option value="author">Autor</option>
              <option value="year">Año</option>
              <option value="type">Tipo</option>
            </select>
          </div>
        </div>

        {/* Items List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-700">
              Recursos ({block.payload.items?.length || 0})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => addItem('pdf')}
                className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm flex items-center gap-1"
              >
                <FileText className="w-4 h-4" />
                Agregar PDF
              </button>
              <button
                onClick={() => addItem('link')}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm flex items-center gap-1"
              >
                <Link className="w-4 h-4" />
                Agregar Enlace
              </button>
              <button
                onClick={() => addItem('image')}
                className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm flex items-center gap-1"
              >
                <Image className="w-4 h-4" />
                Agregar Imagen
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {block.payload.items?.map((item, index) => (
              <div key={item.id} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-5 h-5 text-gray-400" />
                    {item.type === 'pdf' ? (
                      <FileText className="w-5 h-5 text-red-600" />
                    ) : item.type === 'image' ? (
                      <Image className="w-5 h-5 text-green-600" />
                    ) : (
                      <Link className="w-5 h-5 text-blue-600" />
                    )}
                    <div className="flex-1">
                      <div>
                        <span className="font-medium text-gray-900">
                          {item.title || `Nuevo ${item.type === 'pdf' ? 'PDF' : item.type === 'image' ? 'Imagen' : 'Enlace'}`}
                        </span>
                        {item.author && (
                          <span className="text-sm text-gray-600 ml-2">
                            • {item.author}
                          </span>
                        )}
                        {item.year && (
                          <span className="text-sm text-gray-600 ml-2">
                            ({item.year})
                          </span>
                        )}
                      </div>
                      {item.filename && item.type !== 'link' && (
                        <div className="mt-1">
                          <span className="text-xs text-gray-500">
                            📎 {item.filename}
                            {item.filesize && ` • ${(item.filesize / 1024 / 1024).toFixed(2)} MB`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {index > 0 && (
                      <button
                        onClick={() => moveItem(index, 'up')}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Mover arriba"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                    )}
                    {index < block.payload.items.length - 1 && (
                      <button
                        onClick={() => moveItem(index, 'down')}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Mover abajo"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => toggleItemExpanded(item.id)}
                      className={`p-1 rounded flex items-center gap-1 ${
                        expandedItems.has(item.id) 
                          ? 'bg-[#00365b] text-white hover:bg-[#00365b]/90' 
                          : 'hover:bg-gray-200 text-gray-700'
                      }`}
                      title={expandedItems.has(item.id) ? 'Cerrar edición' : 'Editar'}
                    >
                      {expandedItems.has(item.id) ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          <span className="text-xs font-medium">Cerrar</span>
                        </>
                      ) : (
                        <>
                          <Edit2 className="w-4 h-4" />
                          <span className="text-xs font-medium">Editar</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1 hover:bg-gray-200 rounded text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {expandedItems.has(item.id) && (
                  <div className="p-4 space-y-4 bg-white">
                    {/* Edit Header */}
                    <div className="border-b pb-3 mb-4">
                      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Edit2 className="w-4 h-4 text-[#00365b]" />
                        Editando {item.type === 'pdf' ? 'PDF' : item.type === 'image' ? 'Imagen' : 'Enlace'}
                      </h4>
                    </div>

                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Título *
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(item.id, 'title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                        placeholder={item.type === 'pdf' ? 'Título del documento' : item.type === 'image' ? 'Título de la imagen' : 'Título del enlace'}
                      />
                    </div>

                    {/* URL / File Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {item.type === 'pdf' ? 'Archivo PDF' : item.type === 'image' ? 'Imagen' : 'URL'} *
                      </label>
                      {(item.type === 'pdf' || item.type === 'image') ? (
                        <div>
                          {item.url ? (
                            <div>
                              {item.type === 'image' && (
                                <div className="mb-2">
                                  <img 
                                    src={item.url} 
                                    alt={item.title || 'Vista previa'} 
                                    className="max-h-48 rounded-lg object-contain mx-auto"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      e.currentTarget.parentElement?.insertAdjacentHTML(
                                        'afterbegin',
                                        '<div class="text-sm text-red-600 bg-red-50 p-3 rounded text-center">Error al cargar la imagen</div>'
                                      );
                                    }}
                                  />
                                </div>
                              )}
                              <div className="space-y-2">
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                  <div className="flex items-start gap-3">
                                    {item.type === 'pdf' ? (
                                      <FileText className="w-10 h-10 text-red-600 flex-shrink-0" />
                                    ) : (
                                      <Image className="w-10 h-10 text-green-600 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {item.filename || item.url.split('/').pop() || 'Archivo cargado'}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {item.filesize ? `${(item.filesize / 1024 / 1024).toFixed(2)} MB` : 'Tamaño desconocido'}
                                      </p>
                                      <a 
                                        href={item.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 inline-block"
                                      >
                                        Ver archivo
                                      </a>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => updateItem(item.id, 'url', '')}
                                  className="w-full px-3 py-2 text-red-600 hover:bg-red-50 rounded-md border border-red-200 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4 inline mr-1" />
                                  Eliminar archivo y subir otro
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                accept={item.type === 'pdf' ? '.pdf' : 'image/*'}
                                onChange={(e) => handleFileUpload(e, item.id)}
                                className="hidden"
                                id={`file-${item.id}`}
                                disabled={uploadingFile}
                              />
                              <label
                                htmlFor={`file-${item.id}`}
                                className={`flex-1 px-3 py-2 border-2 border-dashed rounded-md text-center cursor-pointer transition-all ${
                                  uploadingFile 
                                    ? 'border-amber-400 bg-amber-50 cursor-not-allowed' 
                                    : 'border-gray-300 hover:border-[#00365b] hover:bg-blue-50'
                                }`}
                              >
                                {uploadingFile ? (
                                  <>
                                    <div className="animate-spin w-5 h-5 mx-auto mb-1 text-amber-600">
                                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                    </div>
                                    <span className="text-sm text-amber-600 font-medium">
                                      Subiendo archivo...
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                                    <span className="text-sm text-gray-600">
                                      {item.type === 'pdf' ? 'Seleccionar PDF' : 'Seleccionar Imagen'}
                                    </span>
                                  </>
                                )}
                              </label>
                            </div>
                          )}
                        </div>
                      ) : (
                        <input
                          type="url"
                          value={item.url}
                          onChange={(e) => updateItem(item.id, 'url', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                          placeholder="https://ejemplo.com/recurso"
                        />
                      )}
                    </div>

                    {/* Author and Year Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Author */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Autor(es)
                        </label>
                        <input
                          type="text"
                          value={item.author || ''}
                          onChange={(e) => updateItem(item.id, 'author', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                          placeholder="Nombre del autor o autores"
                        />
                      </div>

                      {/* Year */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Año
                        </label>
                        <input
                          type="text"
                          value={item.year || ''}
                          onChange={(e) => updateItem(item.id, 'year', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                          placeholder="2024"
                          maxLength={4}
                        />
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Categoría
                      </label>
                      <input
                        type="text"
                        value={item.category || ''}
                        onChange={(e) => updateItem(item.id, 'category', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                        placeholder="Ej: Lecturas obligatorias, Material complementario"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descripción
                      </label>
                      <textarea
                        value={item.description || ''}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                        rows={2}
                        placeholder="Breve descripción del recurso"
                      />
                    </div>

                    {/* Save Reminder */}
                    {hasUnsavedChanges && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                        Recuerda hacer clic en "Guardar Bibliografía" para guardar todos los cambios.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {(!block.payload.items || block.payload.items.length === 0) && (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No hay recursos agregados</p>
              <p className="text-sm text-gray-500 mt-1">
                Agrega PDFs o enlaces externos usando los botones de arriba
              </p>
            </div>
          )}
        </div>

        {/* Save Info */}
        {hasUnsavedChanges && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 shadow-sm">
            <div className="flex items-center">
              <div className="flex-shrink-0 mr-3">
                <svg className="h-5 w-5 text-amber-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  ⚠️ Tienes cambios sin guardar
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Los archivos subidos se guardarán automáticamente. Para otros cambios, haz clic en "Guardar Bibliografía".
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </BlockEditorWrapper>
  );
}