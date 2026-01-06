import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Trash2, GripVertical } from 'lucide-react';

interface BlockEditorWrapperProps {
  title: string;
  subtitle?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onSave?: () => void;
  children: React.ReactNode;
  className?: string;
  showSaveButton?: boolean;
  saveButtonText?: string;
  deleteButtonText?: string;
}

const BlockEditorWrapper: React.FC<BlockEditorWrapperProps> = ({
  title,
  subtitle,
  isCollapsed,
  onToggleCollapse,
  onDelete,
  onSave,
  children,
  className = '',
  showSaveButton = true,
  saveButtonText = 'Guardar Bloque',
  deleteButtonText = 'Eliminar Bloque',
}) => {
  return (
    <div className={`border rounded-lg p-6 shadow-sm mb-6 bg-white ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <GripVertical className="text-gray-400" size={20} />
          <div>
            <h2 className="text-lg font-semibold text-[#0a0a0a]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onToggleCollapse}>
            {isCollapsed ? <ChevronDown /> : <ChevronUp />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="text-[#ef4044]" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="space-y-6">
          {children}
          
          {/* Footer Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={onDelete}
              className="text-[#ef4044] hover:text-red-700"
            >
              {deleteButtonText}
            </Button>
            {showSaveButton && onSave && (
              <Button
                onClick={onSave}
                className="bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] text-white"
              >
                {saveButtonText}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockEditorWrapper;