import React from 'react';

interface BlockActionButtonsProps {
  blockId: string;
  onSave: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  className?: string;
}

const BlockActionButtons: React.FC<BlockActionButtonsProps> = ({
  blockId,
  onSave,
  onDelete,
  className = ''
}) => {
  return (
    <div className={`flex justify-end gap-2 ${className}`}>
      <button
        onClick={() => onSave(blockId)}
        className="bg-green-600 hover:bg-green-700 text-white rounded-md px-3 py-1 text-sm font-medium transition-colors duration-200 flex items-center gap-1"
      >
        <span className="text-xs">✔</span> Guardar
      </button>
      <button
        onClick={() => onDelete(blockId)}
        className="bg-red-600 hover:bg-red-700 text-white rounded-md px-3 py-1 text-sm font-medium transition-colors duration-200 flex items-center gap-1"
      >
        <span className="text-xs">✖</span> Eliminar
      </button>
    </div>
  );
};

export default BlockActionButtons;
