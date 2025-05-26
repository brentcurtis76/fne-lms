import React from 'react';
import { Block, TextBlock, VideoBlock } from '../../types/blocks';

interface BlockRendererProps {
  block: Block;
  onChange: (updatedBlock: Block) => void;
}

const BlockRenderer: React.FC<BlockRendererProps> = ({ block, onChange }) => {
  switch (block.type) {
    case 'text':
      // Ensure block is treated as TextBlock for type safety
      const textBlock = block as TextBlock;
      return (
        <textarea
          value={textBlock.payload.content}
          onChange={(e) => {
            const updatedContent = e.target.value;
            onChange({
              ...textBlock,
              payload: {
                ...textBlock.payload,
                content: updatedContent,
              },
            });
          }}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          rows={5}
          placeholder="Enter text content..."
        />
      );

    case 'video':
      // Ensure block is treated as VideoBlock for type safety
      const videoBlock = block as VideoBlock;
      return (
        <input
          type="text"
          value={videoBlock.payload.url}
          placeholder="Video URL (e.g., YouTube, Vimeo)"
          onChange={(e) => {
            const updatedUrl = e.target.value;
            onChange({
              ...videoBlock,
              payload: {
                ...videoBlock.payload,
                url: updatedUrl,
              },
            });
          }}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      );

    default:
      // Handle unknown block types. For type safety with discriminated unions,
      // this case should ideally be unreachable if all Block types are handled.
      // const _exhaustiveCheck: never = block; // Uncomment for exhaustive check
      return (
        <div className="p-2 my-2 text-sm text-red-700 bg-red-100 border border-red-400 rounded">
          Unknown block type: {block.type}
        </div>
      );
  }
};

export default BlockRenderer;