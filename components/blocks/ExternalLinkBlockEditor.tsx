import React, { useState } from 'react';
import { ExternalLinksBlock, ExternalLink } from '@/types/blocks';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Trash2, GripVertical, ExternalLink as ExternalLinkIcon, Eye, EyeOff } from 'lucide-react';

interface ExternalLinkBlockEditorProps {
  block: ExternalLinksBlock;
  onUpdate: (blockId: string, field: keyof ExternalLinksBlock['payload'], value: any) => void;
  onTitleChange: (blockId: string, title: string) => void;
  onSave: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: (blockId: string) => void;
}

const ExternalLinkBlockEditor: React.FC<ExternalLinkBlockEditorProps> = ({
  block,
  onUpdate,
  onTitleChange,
  onSave,
  onDelete,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addLink = () => {
    const newLink: ExternalLink = {
      id: generateId(),
      title: '',
      url: '',
      description: '',
      category: '',
      thumbnail: '',
      openInNewTab: true,
      isActive: true,
    };

    const updatedLinks = [...block.payload.links, newLink];
    onUpdate(block.id, 'links', updatedLinks);
    setExpandedLinkId(newLink.id);
  };

  const removeLink = (linkId: string) => {
    const updatedLinks = block.payload.links.filter(l => l.id !== linkId);
    onUpdate(block.id, 'links', updatedLinks);
    if (expandedLinkId === linkId) {
      setExpandedLinkId(null);
    }
  };

  const updateLink = (linkId: string, field: keyof ExternalLink, value: any) => {
    // Auto-add protocol to URL if missing
    if (field === 'url' && value && typeof value === 'string') {
      if (!value.startsWith('http://') && !value.startsWith('https://')) {
        value = `https://${value}`;
      }
    }
    
    const updatedLinks = block.payload.links.map(l =>
      l.id === linkId ? { ...l, [field]: value } : l
    );
    onUpdate(block.id, 'links', updatedLinks);
  };

  const getUniqueCategories = () => {
    const categories = block.payload.links
      .map(link => link.category)
      .filter(Boolean)
      .filter((category, index, arr) => arr.indexOf(category) === index);
    return categories.sort();
  };

  const getLinksByCategory = () => {
    if (!block.payload.groupByCategory) {
      return { '': block.payload.links };
    }

    const grouped: { [key: string]: ExternalLink[] } = {};
    
    block.payload.links.forEach(link => {
      const category = link.category || 'Sin categoría';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(link);
    });

    return grouped;
  };

  const isValidUrl = (url: string) => {
    if (!url || url.trim() === '') return false;
    
    try {
      // If URL doesn't start with protocol, add https://
      const urlToTest = url.startsWith('http://') || url.startsWith('https://') 
        ? url 
        : `https://${url}`;
      
      new URL(urlToTest);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="border rounded-lg p-6 shadow-sm mb-6 bg-white">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <GripVertical className="text-gray-400" size={20} />
          <h2 className="text-lg font-semibold text-[#0a0a0a]">
            Enlaces Externos: {block.payload.title || 'Sin título'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onToggleCollapse(block.id)}>
            {isCollapsed ? <ChevronDown /> : <ChevronUp />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(block.id)}>
            <Trash2 className="text-[#ef4044]" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-6">
          {/* Block Header */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título del Bloque
            </label>
            <input
              type="text"
              value={block.payload.title || ''}
              onChange={(e) => onTitleChange(block.id, e.target.value)}
              placeholder="Ingrese el título para esta sección de enlaces"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={block.payload.description || ''}
              onChange={(e) => onUpdate(block.id, 'description', e.target.value)}
              placeholder="Descripción opcional para la colección de enlaces"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
              rows={2}
            />
          </div>

          {/* Display Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={block.payload.groupByCategory}
                onChange={(e) => onUpdate(block.id, 'groupByCategory', e.target.checked)}
                className="form-checkbox text-[#0a0a0a]"
              />
              <span className="text-sm">Agrupar por categoría</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={block.payload.showThumbnails}
                onChange={(e) => onUpdate(block.id, 'showThumbnails', e.target.checked)}
                className="form-checkbox text-[#0a0a0a]"
              />
              <span className="text-sm">Mostrar miniaturas</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={block.payload.showDescriptions}
                onChange={(e) => onUpdate(block.id, 'showDescriptions', e.target.checked)}
                className="form-checkbox text-[#0a0a0a]"
              />
              <span className="text-sm">Mostrar descripciones</span>
            </label>
          </div>

          {/* Links */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-md font-semibold text-[#0a0a0a]">
                Enlaces ({block.payload.links.length})
              </h3>
              <Button
                onClick={addLink}
                className="bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] text-white"
                size="sm"
              >
                <Plus size={16} className="mr-1" />
                Agregar Enlace
              </Button>
            </div>

            <div className="space-y-4">
              {block.payload.links.map((link, linkIndex) => (
                <div
                  key={link.id}
                  className={`border rounded-lg p-4 ${
                    expandedLinkId === link.id ? 'border-[#0a0a0a] bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <ExternalLinkIcon size={16} className="text-[#0a0a0a]" />
                      <h4 className="font-medium text-gray-700">
                        {link.title || `Enlace ${linkIndex + 1}`}
                      </h4>
                      {!link.isActive && (
                        <EyeOff size={14} className="text-gray-400" />
                      )}
                      {link.url && !isValidUrl(link.url) && (
                        <span className="text-xs text-[#ef4044] bg-red-100 px-2 py-1 rounded">
                          URL inválida
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateLink(link.id, 'isActive', !link.isActive)}
                        className={`p-1 rounded ${
                          link.isActive 
                            ? 'text-green-600 hover:bg-green-100' 
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={link.isActive ? 'Desactivar enlace' : 'Activar enlace'}
                      >
                        {link.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button
                        onClick={() =>
                          setExpandedLinkId(
                            expandedLinkId === link.id ? null : link.id
                          )
                        }
                        className="text-[#0a0a0a] hover:text-[#fbbf24] text-sm"
                      >
                        {expandedLinkId === link.id ? 'Colapsar' : 'Editar'}
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLink(link.id)}
                      >
                        <Trash2 size={16} className="text-[#ef4044]" />
                      </Button>
                    </div>
                  </div>

                  {/* Link Preview */}
                  {!expandedLinkId || expandedLinkId !== link.id ? (
                    <div className="text-sm text-gray-600">
                      <p className="truncate">
                        <strong>URL:</strong> {link.url || 'Sin URL'}
                      </p>
                      {link.description && (
                        <p className="truncate">
                          <strong>Descripción:</strong> {link.description}
                        </p>
                      )}
                      {link.category && (
                        <p>
                          <strong>Categoría:</strong> {link.category}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Título del enlace
                          </label>
                          <input
                            type="text"
                            value={link.title}
                            onChange={(e) => updateLink(link.id, 'title', e.target.value)}
                            placeholder="Título descriptivo del enlace"
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Categoría
                          </label>
                          <input
                            type="text"
                            value={link.category || ''}
                            onChange={(e) => updateLink(link.id, 'category', e.target.value)}
                            placeholder="Categoría (opcional)"
                            list={`categories-${block.id}`}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                          />
                          <datalist id={`categories-${block.id}`}>
                            {getUniqueCategories().map(category => (
                              <option key={category} value={category} />
                            ))}
                          </datalist>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          URL del enlace
                        </label>
                        <input
                          type="url"
                          value={link.url}
                          onChange={(e) => updateLink(link.id, 'url', e.target.value)}
                          placeholder="https://ejemplo.com"
                          className={`w-full p-2 border rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent ${
                            link.url && !isValidUrl(link.url) 
                              ? 'border-[#ef4044] bg-red-50' 
                              : 'border-gray-300'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Descripción
                        </label>
                        <textarea
                          value={link.description || ''}
                          onChange={(e) => updateLink(link.id, 'description', e.target.value)}
                          placeholder="Descripción del enlace (opcional)"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                          rows={2}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          URL de miniatura (opcional)
                        </label>
                        <input
                          type="url"
                          value={link.thumbnail || ''}
                          onChange={(e) => updateLink(link.id, 'thumbnail', e.target.value)}
                          placeholder="https://ejemplo.com/imagen.jpg"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={link.openInNewTab}
                            onChange={(e) => updateLink(link.id, 'openInNewTab', e.target.checked)}
                            className="form-checkbox text-[#0a0a0a]"
                          />
                          <span className="text-sm">Abrir en nueva pestaña</span>
                        </label>
                      </div>

                      {/* Link Preview */}
                      {link.url && isValidUrl(link.url) && (
                        <div className="border-t pt-4">
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Vista previa:</h5>
                          <div className="border rounded-lg p-3 bg-gray-50">
                            <div className="flex items-start gap-3">
                              {link.thumbnail && (
                                <img
                                  src={link.thumbnail}
                                  alt={link.title}
                                  className="w-16 h-16 object-cover rounded"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              )}
                              <div className="flex-1">
                                <h6 className="font-medium text-gray-900">
                                  {link.title || 'Sin título'}
                                </h6>
                                {link.description && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    {link.description}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  {link.url}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => onDelete(block.id)}
              className="text-[#ef4044] hover:text-red-700"
            >
              Eliminar Bloque
            </Button>
            <Button
              onClick={() => onSave(block.id)}
              className="bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] text-white"
            >
              Guardar Enlaces
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExternalLinkBlockEditor;