import React from 'react';
import BlockActionButtons from './BlockActionButtons';

interface BlockTitleWithActionsProps {
  blockId: string;
  title: string;
  onTitleChange: (value: string) => void;
  onSave: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  placeholder?: string;
}

const BlockTitleWithActions: React.FC<BlockTitleWithActionsProps> = ({
  blockId,
  title,
  onTitleChange,
  onSave,
  onDelete,
  placeholder = 'Ingrese un título para identificar este bloque'
}) => {
  return (
    <div className="w-full mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Nombre del bloque
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title || ''}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm text-gray-700 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
        />
        <BlockActionButtons 
          blockId={blockId} 
          onSave={onSave} 
          onDelete={onDelete} 
        />
      </div>
    </div>
  );
};

export default BlockTitleWithActions;
