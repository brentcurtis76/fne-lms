import React from 'react';
import { TrashIcon } from '@heroicons/react/outline';
import { formatFileSize, getFileIcon } from '../../lib/utils/file-format';

interface AttachmentRowProps {
  /** Display name of the file. */
  filename: string;
  /** Mime type used to pick the emoji icon. Nullable for legacy rows. */
  fileType: string | null | undefined;
  /** File size in bytes; nullable for legacy rows. */
  fileSize: number | null | undefined;
  /** Called when the user clicks the trash button. */
  onRemove: () => void;
  /** Tooltip/title for the remove button (defaults to "Eliminar archivo"). */
  removeTitle?: string;
  /** Tailwind background for the row (default gray-50 for existing files,
   *  white for newly-selected ones). */
  variant?: 'existing' | 'selected';
}

/**
 * A single attachment list item — icon + filename + size + remove button.
 * The meeting documentation modal renders two near-identical lists
 * (already-uploaded rows vs. files picked this session); this component
 * collapses both into one shape.
 */
export const AttachmentRow: React.FC<AttachmentRowProps> = ({
  filename,
  fileType,
  fileSize,
  onRemove,
  removeTitle = 'Eliminar archivo',
  variant = 'existing',
}) => {
  const bg = variant === 'selected'
    ? 'bg-white border-gray-200 hover:border-gray-300'
    : 'bg-gray-50 border-gray-200';
  return (
    <div className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${bg}`}>
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <span className="text-3xl flex-shrink-0">{getFileIcon(fileType)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{filename}</p>
          <p className="text-xs text-gray-500">{formatFileSize(fileSize)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="ml-4 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        title={removeTitle}
      >
        <TrashIcon className="h-5 w-5" />
      </button>
    </div>
  );
};
