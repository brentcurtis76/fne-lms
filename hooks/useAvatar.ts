import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AvatarData {
  url: string | null;
  isLoading: boolean;
  error: Error | null;
}

// Global cache for avatar URLs with expiration
interface CacheEntry {
  url: string | null;
  timestamp: number;
}

const avatarCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

export function useAvatar(user: User | null): AvatarData {
  const [avatarData, setAvatarData] = useState<AvatarData>({
    url: null,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    if (!user) {
      setAvatarData({ url: null, isLoading: false, error: null });
      return;
    }

    const fetchAvatar = async () => {
      const userId = user.id;
      
      // Check cache first
      const cached = avatarCache.get(userId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setAvatarData({ url: cached.url, isLoading: false, error: null });
        return;
      }

      try {
        // Fetch profile data
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', userId)
          .single();

        if (error) throw error;

        const avatarUrl = profile?.avatar_url || null;
        
        // Cache the result
        avatarCache.set(userId, {
          url: avatarUrl,
          timestamp: Date.now()
        });

        setAvatarData({ url: avatarUrl, isLoading: false, error: null });
      } catch (error) {
        console.error('Error fetching avatar:', error);
        setAvatarData({ 
          url: null, 
          isLoading: false, 
          error: error as Error 
        });
      }
    };

    fetchAvatar();
  }, [user?.id]);

  return avatarData;
}

// Function to invalidate cache for a specific user
export function invalidateAvatarCache(userId: string) {
  avatarCache.delete(userId);
}

// Function to update cache directly (useful after avatar upload)
export function updateAvatarCache(userId: string, url: string | null) {
  avatarCache.set(userId, {
    url,
    timestamp: Date.now()
  });
}