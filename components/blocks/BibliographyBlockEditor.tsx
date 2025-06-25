import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, FileText, Link, GripVertical, ChevronDown, ChevronUp, Upload, Image } from 'lucide-react';
import BlockEditorWrapper from './BlockEditorWrapper';
import { BibliographyBlock, BibliographyItem } from '@/types/blocks';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

interface BibliographyBlockEditorProps {
  block: BibliographyBlock;
  onChange: (payload: BibliographyBlock['payload']) => void;
  onDelete: () => void;
  mode: 'edit' | 'preview';
  courseId: string;
}

export default function BibliographyBlockEditor({
  block,
  onChange,
  onDelete,
  mode,
  courseId
}: BibliographyBlockEditorProps) {
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
    setExpandedItems(new Set(Array.from(expandedItems).concat(newItem.id)));
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
      const fileExt = file.name.split('.').pop();
      const fileName = `bibliography/${courseId}/${Date.now()}_${file.name}`;

      const { data, error } = await supabase.storage
        .from('course-materials')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('course-materials')
        .getPublicUrl(fileName);

      updateItem(itemId, 'url', publicUrl);
      updateItem(itemId, 'title', file.name.replace(/\.[^/.]+$/, ''));
      toast.success('PDF subido exitosamente');
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
                    <span className="font-medium text-gray-900">
                      {item.title || `Nuevo ${item.type === 'pdf' ? 'PDF' : item.type === 'image' ? 'Imagen' : 'Enlace'}`}
                    </span>
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
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {expandedItems.has(item.id) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1 hover:bg-gray-200 rounded text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {expandedItems.has(item.id) && (
                  <div className="p-4 space-y-4 bg-white">
                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Título *
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(item.id, 'title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder={item.type === 'pdf' ? 'Título del documento' : 'Título del enlace'}
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
                                  />
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={item.url}
                                  readOnly
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                                />
                                <button
                                  onClick={() => updateItem(item.id, 'url', '')}
                                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md"
                                >
                                  Cambiar
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
                                className={`flex-1 px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-center cursor-pointer hover:border-[#00365b] ${
                                  uploadingFile ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                              >
                                <Upload className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                                <span className="text-sm text-gray-600">
                                  {uploadingFile ? 'Subiendo...' : item.type === 'pdf' ? 'Seleccionar PDF' : 'Seleccionar Imagen'}
                                </span>
                              </label>
                            </div>
                          )}
                        </div>
                      ) : (
                        <input
                          type="url"
                          value={item.url}
                          onChange={(e) => updateItem(item.id, 'url', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="https://ejemplo.com/recurso"
                        />
                      )}
                    </div>

                    {/* Author */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Autor(es)
                      </label>
                      <input
                        type="text"
                        value={item.author || ''}
                        onChange={(e) => updateItem(item.id, 'author', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        placeholder="2024"
                        maxLength={4}
                      />
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        rows={2}
                        placeholder="Breve descripción del recurso"
                      />
                    </div>
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
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center">
              <BookOpen className="h-4 w-4 text-yellow-600 mr-2 flex-shrink-0" />
              <p className="text-sm text-yellow-800">
                Los cambios se guardarán automáticamente al hacer clic en "Guardar Bibliografía" o al guardar la lección completa.
              </p>
            </div>
          </div>
        )}
      </div>
    </BlockEditorWrapper>
  );
}