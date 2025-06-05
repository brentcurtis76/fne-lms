import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { preloadAvatar, isAvatarPreloaded } from '../../utils/avatarPreloader';

interface AvatarProps {
  user: User | null;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Simple in-memory cache for avatar URLs
const avatarCache = new Map<string, string>();

export default function Avatar({ user, avatarUrl: propAvatarUrl, size = 'md', className = '' }: AvatarProps) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Size classes
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl'
  };

  // Get user initials for fallback
  const getUserInitials = () => {
    if (!user?.email) return 'U';
    
    // Try to get initials from email
    const emailName = user.email.split('@')[0];
    const parts = emailName.split(/[._-]/);
    
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
    }
    
    return emailName.charAt(0).toUpperCase();
  };

  // Generate a local fallback avatar using CSS
  const generateLocalAvatar = () => {
    const initials = getUserInitials();
    const name = user?.email?.split('@')[0] || 'user';
    
    // Generate a consistent color based on the user's email
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;
    const backgroundColor = `hsl(${hue}, 70%, 40%)`;
    
    return {
      initials,
      backgroundColor
    };
  };

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const userId = user.id;
    
    // Check cache first
    const cachedUrl = avatarCache.get(userId);
    if (cachedUrl && cachedUrl !== '') {
      setImageUrl(cachedUrl);
      setIsLoading(false);
      return;
    }

    // Use provided avatar URL or generate fallback
    if (propAvatarUrl && propAvatarUrl !== '') {
      // Check if image is already preloaded
      if (isAvatarPreloaded(propAvatarUrl)) {
        setImageUrl(propAvatarUrl);
        setIsLoading(false);
      } else {
        // Preload the image
        preloadAvatar(propAvatarUrl)
          .then(() => {
            setImageUrl(propAvatarUrl);
            setIsLoading(false);
          })
          .catch(() => {
            setHasError(true);
            setIsLoading(false);
          });
      }
      avatarCache.set(userId, propAvatarUrl);
    } else {
      // Don't use external service, just show initials
      // Don't mark as error if we're still loading
      setHasError(true);
      setIsLoading(false);
    }
  }, [user, propAvatarUrl]);

  const handleImageError = () => {
    setHasError(true);
    setIsLoading(false);
  };

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  // Show initials-based avatar
  if (!user || hasError || !imageUrl) {
    const { initials, backgroundColor } = generateLocalAvatar();
    
    return (
      <div 
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold text-white shadow-lg ${className}`}
        style={{ backgroundColor }}
      >
        <span className={textSizeClasses[size]}>{initials}</span>
      </div>
    );
  }

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className={`absolute inset-0 ${sizeClasses[size]} rounded-full bg-gray-200 animate-pulse`} />
      )}
      
      {/* Actual image */}
      <img
        src={imageUrl}
        alt="Avatar"
        className={`${sizeClasses[size]} rounded-full object-cover transition-opacity duration-200 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        }`}
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    </div>
  );
}