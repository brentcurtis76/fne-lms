interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  totalItems: number;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  memoryUsage: number;
}

class EnhancedCache {
  private cache = new Map<string, CacheItem<any>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private maxSize = 100; // Maximum number of items
  private hits = 0;
  private misses = 0;

  set<T>(key: string, data: T, ttl?: number): void {
    // Check if we need to evict items due to size limit
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      accessCount: 0,
      lastAccessed: Date.now()
    };
    this.cache.set(key, item);
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    const isExpired = (now - item.timestamp) > item.ttl;

    if (isExpired) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update access statistics
    item.accessCount++;
    item.lastAccessed = now;
    this.hits++;

    return item.data;
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    const now = Date.now();
    const isExpired = (now - item.timestamp) > item.ttl;

    if (isExpired) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  // Clean up expired items
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((item, key) => {
      const isExpired = (now - item.timestamp) > item.ttl;
      if (isExpired) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Evict least recently used item
  private evictLeastRecentlyUsed(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    this.cache.forEach((item, key) => {
      if (item.lastAccessed < oldestTime) {
        oldestTime = item.lastAccessed;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    return {
      totalItems: this.cache.size,
      hitRate: totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0,
      totalHits: this.hits,
      totalMisses: this.misses,
      memoryUsage: this.cache.size * 1024 // Rough estimate in bytes
    };
  }

  // Get items sorted by access frequency
  getPopularItems(limit = 5): Array<{ key: string; accessCount: number }> {
    const items = Array.from(this.cache.entries())
      .map(([key, item]) => ({ key, accessCount: item.accessCount }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
    
    return items;
  }

  // Invalidate items by pattern
  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];
    
    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
    return keysToDelete.length;
  }

  // Set maximum cache size
  setMaxSize(size: number): void {
    this.maxSize = size;
    
    // Evict items if we're over the new limit
    while (this.cache.size > this.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }
}

// Global cache instance
export const apiCache = new EnhancedCache();

// Cache helper for API responses
export async function cachedFetch<T>(
  url: string,
  options?: RequestInit,
  ttl?: number
): Promise<T> {
  const cacheKey = `${url}_${JSON.stringify(options || {})}`;
  
  // Check cache first
  const cached = apiCache.get<T>(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch and cache
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json();
  apiCache.set(cacheKey, data, ttl);
  
  return data;
}

// Cache helper for query invalidation
export function invalidateReportCache(reportType?: string): void {
  if (reportType) {
    apiCache.invalidatePattern(`.*reports.*${reportType}.*`);
  } else {
    apiCache.invalidatePattern('.*reports.*');
  }
}

// Cache helper for user-specific data
export function invalidateUserCache(userId: string): void {
  apiCache.invalidatePattern(`.*user_id=${userId}.*`);
}

// Periodic cache cleanup (call from useEffect in main app)
export function setupCacheCleanup(): () => void {
  const interval = setInterval(() => {
    apiCache.cleanup();
  }, 5 * 60 * 1000); // Every 5 minutes

  return () => clearInterval(interval);
}

export default EnhancedCache;