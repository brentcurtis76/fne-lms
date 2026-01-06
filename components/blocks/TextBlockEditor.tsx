import React from "react";
import TipTapEditor from "@/src/components/TipTapEditor";
import { TextBlock } from "@/types/blocks";
import BlockEditorWrapper from "./BlockEditorWrapper";
import { getBlockConfig } from "@/config/blockTypes";

interface Props {
  block: TextBlock;
  index: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onTitleChange: (newTitle: string) => void;
  onContentChange: (newContent: any) => void;
  onSave: () => void;
  onDelete: () => void;
}

const TextBlockEditor: React.FC<Props> = ({
  block,
  index,
  isCollapsed,
  onToggleCollapse,
  onTitleChange,
  onContentChange,
  onSave,
  onDelete
}) => {
  const blockConfig = getBlockConfig('text');
  
  return (
    <BlockEditorWrapper
      title={blockConfig.label}
      subtitle={block.payload?.title || blockConfig.subtitle}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onDelete={onDelete}
      onSave={onSave}
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nombre del bloque
        </label>
        <input
          type="text"
          value={block.payload?.title || ""}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Ingrese un título para identificar este bloque"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Contenido
        </label>
        <TipTapEditor
          initialContent={block.payload?.content}
          onChange={onContentChange}
        />
      </div>
    </BlockEditorWrapper>
  );
};

export default TextBlockEditor;