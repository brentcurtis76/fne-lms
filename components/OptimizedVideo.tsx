import React, { useEffect, useState } from 'react';

interface OptimizedVideoProps {
  src: string;
  poster?: string;
  className?: string;
}

export default function OptimizedVideo({ src, poster, className }: OptimizedVideoProps) {
  const [shouldLoad, setShouldLoad] = useState(true); // Changed to true for immediate loading
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
      setShouldLoad(false);
      return;
    }

    // Check connection speed
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    if (connection) {
      // Don't autoload video on slow connections
      if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
        setShouldLoad(false);
        return;
      }
    }

    // For hero video, load immediately - no intersection observer needed
    setShouldLoad(true);
  }, []);

  const handleVideoError = () => {
    setVideoError(true);
    console.error('Video failed to load, showing poster image instead');
  };

  // Poster image fallback
  const posterUrl = poster || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080' viewBox='0 0 1920 1080'%3E%3Crect fill='%23000000' width='1920' height='1080'/%3E%3C/svg%3E";

  if (!shouldLoad || videoError) {
    return (
      <div 
        className={className}
        style={{
          backgroundImage: `url(${posterUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Optional: Add a play button for manual video load */}
        {!shouldLoad && !videoError && (
          <button
            onClick={() => setShouldLoad(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
            aria-label="Reproducir video"
          >
            <div className="bg-white/90 rounded-full p-6 shadow-lg">
              <svg className="w-12 h-12 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </button>
        )}
      </div>
    );
  }

  return (
    <video 
      className={className}
      autoPlay 
      loop 
      muted 
      playsInline
      poster={posterUrl}
      onError={handleVideoError}
    >
      {/* Try MP4 first (more efficient than MOV) */}
      <source 
        src={src.replace('.mov', '.mp4')} 
        type="video/mp4" 
      />
      {/* Fallback to original MOV */}
      <source 
        src={src} 
        type="video/quicktime" 
      />
      {/* WebM for better compression */}
      <source 
        src={src.replace('.mov', '.webm')} 
        type="video/webm" 
      />
    </video>
  );
}