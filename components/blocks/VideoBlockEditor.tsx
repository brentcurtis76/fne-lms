import React from 'react';
import { VideoBlock } from '@/types/blocks';
import BlockEditorWrapper from './BlockEditorWrapper';
import { getBlockConfig } from '@/config/blockTypes';

// Utility function to get embed URL (placed here for now)
const getEmbedUrl = (url: string): string => {
  if (!url) return '';
  let videoId;
  // YouTube
  if (url.includes('youtube.com/watch')) {
    videoId = url.split('v=')[1]?.split('&')[0];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1]?.split('?')[0];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  }
  // Vimeo
  if (url.includes('vimeo.com/')) {
    const parts = url.split('/');
    videoId = parts.pop()?.split('?')[0];
    return videoId ? `https://player.vimeo.com/video/${videoId}` : url;
  }
  return url; // Return original URL if not YouTube/Vimeo or format is unrecognized
};

interface VideoBlockEditorProps {
  block: VideoBlock;
  onUpdate: (blockId: string, field: 'url' | 'caption' | 'title', value: string) => void;
  onDelete: (blockId: string) => void;
  onSave: (blockId: string) => void; // Assuming a save action per block might be needed
  isCollapsed: boolean;
  onToggleCollapse: (blockId: string) => void;
}

const VideoBlockEditor: React.FC<VideoBlockEditorProps> = ({
  block,
  onUpdate,
  onDelete,
  onSave,
  isCollapsed,
  onToggleCollapse,
}) => {
  const embedUrl = getEmbedUrl(block.payload.url);
  const blockConfig = getBlockConfig('video');

  return (
    <BlockEditorWrapper
      title={blockConfig.label}
      subtitle={block.payload?.title || blockConfig.subtitle}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => onToggleCollapse(block.id)}
      onDelete={() => onDelete(block.id)}
      onSave={() => onSave(block.id)}
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nombre del bloque
        </label>
        <input
          type="text"
          value={block.payload?.title || ""}
          onChange={(e) => onUpdate(block.id, 'title', e.target.value)}
          placeholder="Ingrese un título para identificar este bloque"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
        />
      </div>

      <div>
        <label htmlFor={`video-url-${block.id}`} className="block text-sm font-medium text-gray-700 mb-1">
          URL del Video (YouTube o Vimeo)
        </label>
        <input
          type="text"
          id={`video-url-${block.id}`}
          value={block.payload.url}
          onChange={(e) => onUpdate(block.id, 'url', e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
        />
      </div>

      {embedUrl && block.payload.url && (
        <div className="aspect-video bg-gray-100 rounded overflow-hidden border">
          <iframe
            src={embedUrl}
            title={`Previsualización de Video: ${block.payload.title || 'Sin título'}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          ></iframe>
        </div>
      )}

      <div>
        <label htmlFor={`video-caption-${block.id}`} className="block text-sm font-medium text-gray-700 mb-1">
          Leyenda del Video (opcional)
        </label>
        <input
          type="text"
          id={`video-caption-${block.id}`}
          value={block.payload.caption || ''}
          onChange={(e) => onUpdate(block.id, 'caption', e.target.value)}
          placeholder="Descripción breve del video"
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
        />
      </div>
    </BlockEditorWrapper>
  );
};

export default VideoBlockEditor;
