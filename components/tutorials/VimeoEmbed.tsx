import React from 'react';

interface VimeoEmbedProps {
  vimeoId: string;
  title: string;
}

export default function VimeoEmbed({ vimeoId, title }: VimeoEmbedProps) {
  if (!vimeoId) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg bg-gray-100" style={{ paddingTop: '56.25%' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-gray-500">Video próximamente</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ paddingTop: '56.25%' }}>
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://player.vimeo.com/video/${vimeoId}?dnt=1`}
        title={title}
        loading="lazy"
        allowFullScreen
      />
    </div>
  );
}
