
import React, { useState, useCallback } from 'react';

interface TeamMemberImageProps {
  src: string;
  alt: string;
  name: string;
  className?: string;
}

const TeamMemberImage: React.FC<TeamMemberImageProps> = ({ src, alt, name, className = '' }) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Generate placeholder avatar
  const generatePlaceholderAvatar = useCallback((memberName: string) => {
    const initials = memberName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
    
    let hash = 0;
    for (let i = 0; i < memberName.length; i++) {
      hash = memberName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash) % 360;
    const saturation = 60 + (Math.abs(hash) % 40);
    const lightness = 50 + (Math.abs(hash) % 20);
    
    const svgAvatar = `
      <svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gradient-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:hsl(${hue}, ${saturation}%, ${lightness}%)" />
            <stop offset="100%" style="stop-color:hsl(${hue + 20}, ${saturation}%, ${lightness - 10}%)" />
          </linearGradient>
        </defs>
        <circle cx="96" cy="96" r="96" fill="url(#gradient-${hash})" />
        <text x="96" y="106" font-family="system-ui, -apple-system, sans-serif" 
              font-size="48" font-weight="600" text-anchor="middle" 
              fill="white" opacity="0.9">${initials}</text>
      </svg>`.replace(/\s+/g, ' ').trim();
    
    return `data:image/svg+xml;base64,${btoa(svgAvatar)}`;
  }, []);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setIsLoading(false);
  };

  if (imageError) {
    return (
      <div className={`relative ${className}`}>
        <img
          src={generatePlaceholderAvatar(name)}
          alt={alt}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/10 rounded-full flex items-end justify-center pb-2">
          <span className="text-xs text-white/70 font-medium bg-black/20 px-2 py-1 rounded-full">
            Sin foto
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
            <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
    </div>
  );
};

export default TeamMemberImage;