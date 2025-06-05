import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AvatarContextType {
  avatarUrl: string | null;
  isLoading: boolean;
  error: Error | null;
  refreshAvatar: () => Promise<void>;
  setAvatarUrl: (url: string | null) => void;
}

const AvatarContext = createContext<AvatarContextType | undefined>(undefined);

// Global cache with session storage for persistence
const CACHE_KEY = 'fne-avatar-cache';
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

interface CacheData {
  [userId: string]: {
    url: string | null;
    timestamp: number;
  };
}

export function AvatarProvider({ children, user }: { children: ReactNode; user: User | null }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load cache from session storage
  const loadCache = (): CacheData => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  };

  // Save cache to session storage
  const saveCache = (cache: CacheData) => {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('Failed to save avatar cache:', error);
    }
  };

  const fetchAvatar = async () => {
    if (!user) {
      setAvatarUrl(null);
      setIsLoading(false);
      return;
    }

    const cache = loadCache();
    const cached = cache[user.id];

    // Check if we have a valid cached value
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setAvatarUrl(cached.url);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      const url = profile?.avatar_url || null;
      setAvatarUrl(url);

      // Update cache
      cache[user.id] = {
        url,
        timestamp: Date.now()
      };
      saveCache(cache);
    } catch (err) {
      console.error('Error fetching avatar:', err);
      setError(err as Error);
      setAvatarUrl(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAvatar = async () => {
    if (!user) return;

    // Clear cache for this user
    const cache = loadCache();
    delete cache[user.id];
    saveCache(cache);

    // Fetch fresh data
    await fetchAvatar();
  };

  const updateAvatarUrl = (url: string | null) => {
    if (!user) return;

    setAvatarUrl(url);

    // Update cache
    const cache = loadCache();
    cache[user.id] = {
      url,
      timestamp: Date.now()
    };
    saveCache(cache);
  };

  useEffect(() => {
    fetchAvatar();

    // Subscribe to profile changes
    if (user) {
      const channel = supabase
        .channel(`profile-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          },
          (payload) => {
            if (payload.new && 'avatar_url' in payload.new) {
              updateAvatarUrl(payload.new.avatar_url as string | null);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id]);

  return (
    <AvatarContext.Provider
      value={{
        avatarUrl,
        isLoading,
        error,
        refreshAvatar,
        setAvatarUrl: updateAvatarUrl
      }}
    >
      {children}
    </AvatarContext.Provider>
  );
}

export function useAvatarContext() {
  const context = useContext(AvatarContext);
  if (context === undefined) {
    throw new Error('useAvatarContext must be used within an AvatarProvider');
  }
  return context;
}