/**
 * Avatar Preloader Utility
 * Preloads avatar images to improve perceived performance
 */

// Cache for preloaded images
const preloadedImages = new Map<string, HTMLImageElement>();

/**
 * Preload an avatar image
 * @param url The URL of the avatar to preload
 * @returns A promise that resolves when the image is loaded
 */
export function preloadAvatar(url: string): Promise<void> {
  // Check if already preloaded
  if (preloadedImages.has(url)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      preloadedImages.set(url, img);
      resolve();
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to preload avatar: ${url}`));
    };
    
    img.src = url;
  });
}

/**
 * Preload multiple avatar images
 * @param urls Array of avatar URLs to preload
 */
export async function preloadAvatars(urls: string[]): Promise<void> {
  const promises = urls.map(url => preloadAvatar(url).catch(console.error));
  await Promise.allSettled(promises);
}

/**
 * Check if an avatar is already preloaded
 * @param url The URL to check
 * @returns True if the image is preloaded
 */
export function isAvatarPreloaded(url: string): boolean {
  return preloadedImages.has(url);
}

/**
 * Clear the preload cache
 */
export function clearAvatarCache(): void {
  preloadedImages.clear();
}

/**
 * Get the size of the preload cache
 */
export function getPreloadCacheSize(): number {
  return preloadedImages.size;
}