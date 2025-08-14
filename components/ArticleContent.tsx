import React, { useState } from 'react';

interface VideoPlayerProps {
  videoId: string;
  title?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoId, title }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const fallbackThumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  if (!isPlaying) {
    return (
      <div className="relative w-full rounded-lg overflow-hidden shadow-2xl bg-black my-8 group">
        <div className="relative aspect-video">
          <img
            src={thumbnailUrl}
            alt={title || "Video thumbnail"}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to lower quality thumbnail if maxresdefault doesn't exist
              (e.target as HTMLImageElement).src = fallbackThumbnailUrl;
            }}
          />
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black bg-opacity-30 group-hover:bg-opacity-20 transition-all duration-300"></div>
          
          {/* Play button */}
          <button
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 flex items-center justify-center group"
            aria-label="Play video"
          >
            <div className="relative">
              {/* Outer circle with pulse animation */}
              <div className="absolute inset-0 bg-red-600 rounded-full opacity-20 group-hover:opacity-30 animate-ping"></div>
              {/* Main play button */}
              <div className="relative bg-red-600 rounded-full p-6 transform transition-transform duration-300 group-hover:scale-110 shadow-2xl">
                <svg
                  className="w-12 h-12 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
          
          {/* YouTube logo */}
          <div className="absolute top-4 right-4 bg-black bg-opacity-70 px-3 py-1 rounded-md">
            <span className="text-white text-xs font-semibold flex items-center">
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              YouTube
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden shadow-2xl bg-black my-8">
      <div className="aspect-video">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={title || "YouTube video"}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    </div>
  );
};

interface ArticleContentProps {
  content: string;
}

export default function ArticleContent({ content }: ArticleContentProps) {
  // Function to extract YouTube video ID from various URL formats
  const getYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
      /youtube\.com\/v\/([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  // Process content to replace YouTube links with embedded players
  const processContent = (htmlContent: string): JSX.Element[] => {
    // Split content by line breaks or paragraphs to process each section
    const sections = htmlContent.split(/(<p>|<\/p>|<br>|<br\/>|<br \/>|\n)/);
    const processedContent: JSX.Element[] = [];
    let keyIndex = 0;

    sections.forEach((section, index) => {
      // Check if section contains a YouTube URL
      const youtubeUrlPattern = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})[^\s<]*/gi;
      const matches = section.match(youtubeUrlPattern);
      
      if (matches) {
        // Process each match in the section
        let lastIndex = 0;
        matches.forEach((match) => {
          const matchIndex = section.indexOf(match, lastIndex);
          
          // Add text before the URL
          if (matchIndex > lastIndex) {
            const textBefore = section.substring(lastIndex, matchIndex);
            if (textBefore.trim()) {
              processedContent.push(
                <div 
                  key={`text-${keyIndex++}`}
                  dangerouslySetInnerHTML={{ __html: textBefore }}
                />
              );
            }
          }
          
          // Add the video player
          const videoId = getYouTubeId(match);
          if (videoId) {
            processedContent.push(
              <VideoPlayer key={`video-${keyIndex++}`} videoId={videoId} />
            );
          }
          
          lastIndex = matchIndex + match.length;
        });
        
        // Add any remaining text after the last URL
        if (lastIndex < section.length) {
          const textAfter = section.substring(lastIndex);
          if (textAfter.trim() && !textAfter.match(/^<\/?[a-z]+>$/i)) {
            processedContent.push(
              <div 
                key={`text-${keyIndex++}`}
                dangerouslySetInnerHTML={{ __html: textAfter }}
              />
            );
          }
        }
      } else if (section.trim() && !section.match(/^<\/?[a-z]+>$/i)) {
        // No YouTube URL in this section, add it as is
        processedContent.push(
          <div 
            key={`text-${keyIndex++}`}
            dangerouslySetInnerHTML={{ __html: section }}
          />
        );
      }
    });

    return processedContent;
  };

  return (
    <div className="article-content prose prose-lg max-w-none">
      {processContent(content)}
      
      <style jsx global>{`
        .article-content {
          line-height: 1.8;
        }
        
        .article-content p {
          margin-bottom: 1.5rem;
          color: #374151;
        }
        
        .article-content h1,
        .article-content h2,
        .article-content h3,
        .article-content h4,
        .article-content h5,
        .article-content h6 {
          margin-top: 2rem;
          margin-bottom: 1rem;
          font-weight: 700;
          color: #111827;
        }
        
        .article-content ul,
        .article-content ol {
          margin-bottom: 1.5rem;
          padding-left: 2rem;
        }
        
        .article-content li {
          margin-bottom: 0.5rem;
        }
        
        .article-content blockquote {
          border-left: 4px solid #e5e7eb;
          padding-left: 1.5rem;
          margin: 2rem 0;
          font-style: italic;
          color: #6b7280;
        }
        
        .article-content a {
          color: #2563eb;
          text-decoration: underline;
          transition: color 0.2s;
        }
        
        .article-content a:hover {
          color: #1d4ed8;
        }
        
        .article-content img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 2rem auto;
          display: block;
        }
        
        .article-content code {
          background-color: #f3f4f6;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        
        .article-content pre {
          background-color: #1f2937;
          color: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 2rem 0;
        }
        
        .article-content pre code {
          background-color: transparent;
          padding: 0;
        }
        
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        
        .animate-ping {
          animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}