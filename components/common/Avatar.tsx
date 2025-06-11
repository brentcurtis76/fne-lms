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
  const [imageUrl, setImageUrl] = useState<string>(propAvatarUrl || '');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Size classes
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-20 w-20'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl'
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

    // If propAvatarUrl changes and we have it, update immediately
    if (propAvatarUrl && propAvatarUrl !== imageUrl) {
      setImageUrl(propAvatarUrl);
      setHasError(false);
    }

    const userId = user.id;
    
    // Check in-memory cache first
    const cachedUrl = avatarCache.get(userId);
    if (cachedUrl && cachedUrl !== '') {
      setImageUrl(cachedUrl);
      setIsLoading(false);
      return;
    }
    
    // Check session storage cache
    try {
      const sessionCacheData = sessionStorage.getItem('fne-avatar-cache');
      if (sessionCacheData) {
        const sessionCache = JSON.parse(sessionCacheData);
        const userCache = sessionCache[userId];
        if (userCache && userCache.url && Date.now() - userCache.timestamp < 1000 * 60 * 30) {
          setImageUrl(userCache.url);
          setIsLoading(false);
          avatarCache.set(userId, userCache.url);
          return;
        }
      }
    } catch (e) {
      // Ignore session storage errors
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
      
      // Also update session storage cache
      try {
        const sessionCacheData = sessionStorage.getItem('fne-avatar-cache') || '{}';
        const sessionCache = JSON.parse(sessionCacheData);
        sessionCache[userId] = {
          url: propAvatarUrl,
          timestamp: Date.now()
        };
        sessionStorage.setItem('fne-avatar-cache', JSON.stringify(sessionCache));
      } catch (e) {
        // Ignore session storage errors
      }
    } else {
      // No avatar URL yet, keep loading state
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

  // Show initials-based avatar only if we have an error or finished loading without an image
  if (!user || (hasError && !isLoading) || (!imageUrl && !isLoading && !propAvatarUrl)) {
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

  // Show loading skeleton while we're loading
  if (isLoading && !imageUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gray-200 animate-pulse ${className}`} />
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