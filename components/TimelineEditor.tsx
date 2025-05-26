import React, { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Define the block interface for the component
interface Block {
  id: string;
  title?: string;
  type: string;
  position?: number;
}

// Props for the TimelineEditor component
interface TimelineEditorProps {
  blocks: Block[];
  onReorder: (newBlockOrder: string[]) => void;
  onDeleteBlock?: (blockId: string) => void;
  onEditBlock?: (blockId: string) => void;
}

// Props for the SortableBlockCard component
interface SortableBlockCardProps {
  block: Block;
  onDeleteBlock?: (blockId: string) => void;
  onEditBlock?: (blockId: string) => void;
}

// Helper function to get a display title for a block
const getBlockTypeLabel = (type: string): string => {
  switch (type) {
    case 'text':
      return 'Texto';
    case 'image':
      return 'Imagen';
    case 'video':
      return 'Video';
    case 'download':
      return 'Archivos';
    case 'external-links':
      return 'Enlaces';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
};

// Sortable block card component
const SortableBlockCard: React.FC<SortableBlockCardProps> = ({ block, onDeleteBlock, onEditBlock }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeLabel = getBlockTypeLabel(block.type);
  const title = block.title || 'Sin título';
  const displayText = `${typeLabel}: ${title}`;
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering drag events
    
    // Show confirmation dialog
    const confirmed = window.confirm('¿Estás seguro de que deseas eliminar este bloque de forma permanente?');
    
    if (confirmed && onDeleteBlock) {
      onDeleteBlock(block.id);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering drag events
    if (onEditBlock) {
      onEditBlock(block.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="rounded-lg bg-white p-4 shadow-md min-w-[200px] text-sm cursor-grab active:cursor-grabbing relative group"
    >
      <div className="font-semibold truncate">{displayText}</div>
      <div className="text-xs text-gray-500 mt-1 capitalize">{block.type}</div>
      
      <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {onEditBlock && (
          <button
            onClick={handleEdit}
            className="text-blue-500 hover:text-blue-700"
            title="Editar bloque"
          >
            ✏️
          </button>
        )}
        {onDeleteBlock && (
          <button
            onClick={handleDelete}
            className="text-red-500 hover:text-red-700"
            title="Eliminar bloque"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
};

// Main TimelineEditor component
const TimelineEditor: React.FC<TimelineEditorProps> = ({ blocks, onReorder, onDeleteBlock, onEditBlock }) => {
  const [items, setItems] = useState(blocks);

  // Update items when blocks change
  useEffect(() => {
    setItems(blocks);
  }, [blocks]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setItems((prevItems) => {
        const oldIndex = prevItems.findIndex((item) => item.id === active.id);
        const newIndex = prevItems.findIndex((item) => item.id === over.id);
        
        const newItems = arrayMove(prevItems, oldIndex, newIndex);
        
        // Call the onReorder callback with the new block IDs
        onReorder(newItems.map((item) => item.id));
        
        return newItems;
      });
    }
  };

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-2">
        Ordena los bloques de esta lección
      </h3>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map(item => item.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="overflow-x-auto flex gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            {items.length > 0 ? (
              items.map((block) => (
                <SortableBlockCard 
                  key={block.id} 
                  block={block} 
                  onDeleteBlock={onDeleteBlock}
                  onEditBlock={onEditBlock}
                />
              ))
            ) : (
              <div className="text-center py-4 text-gray-500 w-full">
                No hay bloques para ordenar
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default TimelineEditor;
