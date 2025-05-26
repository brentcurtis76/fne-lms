import React from 'react';
import { Block } from '@/types/blocks';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { GripVertical, FileText, Video, Image, HelpCircle, Download, ExternalLink, Eye, EyeOff } from 'lucide-react';

interface TimelineBlockProps {
  block: Block;
  index: number;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  onToggleCollapse: () => void;
}

const TimelineBlock: React.FC<TimelineBlockProps> = ({
  block,
  index,
  isActive,
  isCollapsed,
  onClick,
  onToggleCollapse,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getBlockIcon = () => {
    switch (block.type) {
      case 'text':
        return <FileText size={16} className="text-blue-600" />;
      case 'video':
        return <Video size={16} className="text-purple-600" />;
      case 'image':
        return <Image size={16} className="text-green-600" />;
      case 'quiz':
        return <HelpCircle size={16} className="text-orange-600" />;
      case 'download':
        return <Download size={16} className="text-indigo-600" />;
      case 'external-links':
        return <ExternalLink size={16} className="text-red-600" />;
      default:
        return <FileText size={16} className="text-gray-600" />;
    }
  };

  const getBlockTypeLabel = () => {
    switch (block.type) {
      case 'text': return 'Texto';
      case 'video': return 'Video';
      case 'image': return 'Imagen';
      case 'quiz': return 'Quiz';
      case 'download': return 'Archivos';
      case 'external-links': return 'Enlaces';
      default: return 'Desconocido';
    }
  };

  const getBlockSummary = () => {
    switch (block.type) {
      case 'text':
        return 'Contenido de texto';
      case 'video':
        return (block.payload as any)?.url ? 'Video configurado' : 'Sin video';
      case 'image':
        return (block.payload as any)?.src ? 'Imagen configurada' : 'Sin imagen';
      case 'quiz':
        const questions = (block.payload as any)?.questions || [];
        return `${questions.length} pregunta${questions.length !== 1 ? 's' : ''}`;
      case 'download':
        const files = (block.payload as any)?.files || [];
        return `${files.length} archivo${files.length !== 1 ? 's' : ''}`;
      case 'external-links':
        const links = (block.payload as any)?.links || [];
        return `${links.length} enlace${links.length !== 1 ? 's' : ''}`;
      default:
        return 'Bloque sin configurar';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative border rounded-lg p-3 mb-2 cursor-pointer transition-all ${
        isActive 
          ? 'border-[#00365b] bg-blue-50 shadow-md' 
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-1 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={14} className="text-gray-400" />
        </div>
        
        <div className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-semibold text-gray-600">
          {index + 1}
        </div>
        
        <div className="flex-shrink-0">
          {getBlockIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">
              {block.payload?.title || `${getBlockTypeLabel()} ${index + 1}`}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {getBlockTypeLabel()}
            </span>
          </div>
          <p className="text-xs text-gray-600 truncate mt-1">
            {getBlockSummary()}
          </p>
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="flex-shrink-0 p-1 hover:bg-gray-100 rounded"
        >
          {isCollapsed ? (
            <EyeOff size={14} className="text-gray-400" />
          ) : (
            <Eye size={14} className="text-[#00365b]" />
          )}
        </button>
      </div>
      
      {/* Progress indicator */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00365b] to-[#fdb933] rounded-l-lg opacity-30"></div>
    </div>
  );
};

interface LessonTimelineProps {
  blocks: Block[];
  activeBlockId: string | null;
  collapsedBlocks: Set<string>;
  onBlockClick: (blockId: string) => void;
  onToggleCollapse: (blockId: string) => void;
  onReorder?: (event: DragEndEvent) => void;
}

const LessonTimeline: React.FC<LessonTimelineProps> = ({
  blocks,
  activeBlockId,
  collapsedBlocks,
  onBlockClick,
  onToggleCollapse,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  return (
    <div className="bg-gradient-to-br from-white to-gray-50 border-2 border-gray-100 rounded-xl shadow-lg p-6">
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="w-4 h-4 bg-gradient-to-r from-[#00365b] to-[#fdb933] rounded-full shadow-sm"></div>
        <h3 className="text-xl font-bold text-[#00365b] text-center">
          Estructura de la Lección
        </h3>
        <div className="bg-gradient-to-r from-[#00365b] to-[#fdb933] text-white px-4 py-2 rounded-full text-sm font-medium shadow-md">
          {blocks.length} bloque{blocks.length !== 1 ? 's' : ''}
        </div>
      </div>
      
      {blocks.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl p-8 mb-6">
            <FileText size={64} className="mx-auto mb-4 text-gray-400" />
          </div>
          <h4 className="text-lg font-semibold text-gray-700 mb-2">
            ¡Comienza a crear tu lección!
          </h4>
          <p className="text-sm text-gray-500 mb-1">
            No hay bloques en esta lección aún
          </p>
          <p className="text-xs text-gray-400 leading-relaxed">
            Agrega contenido usando los botones de arriba para crear una experiencia de aprendizaje interactiva
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onReorder}
          modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
        >
          <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {blocks.map((block, index) => (
                <TimelineBlock
                  key={block.id}
                  block={block}
                  index={index}
                  isActive={activeBlockId === block.id}
                  isCollapsed={collapsedBlocks.has(block.id)}
                  onClick={() => onBlockClick(block.id)}
                  onToggleCollapse={() => onToggleCollapse(block.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

export default LessonTimeline;