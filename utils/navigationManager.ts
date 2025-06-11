/**
 * Global Navigation Manager
 * Prevents concurrent navigation attempts that cause router throttling
 */

class NavigationManager {
  private static instance: NavigationManager;
  private isNavigating: boolean = false;
  private navigationQueue: Array<() => Promise<void>> = [];
  private lastNavigationTime: number = 0;
  private MIN_NAVIGATION_DELAY = 500; // Minimum delay between navigations

  private constructor() {}

  static getInstance(): NavigationManager {
    if (!NavigationManager.instance) {
      NavigationManager.instance = new NavigationManager();
    }
    return NavigationManager.instance;
  }

  async navigate(navigationFn: () => Promise<void>): Promise<void> {
    // Check if we're already navigating
    if (this.isNavigating) {
      console.warn('Navigation blocked: Another navigation is in progress');
      // Queue the navigation for later
      return new Promise((resolve) => {
        this.navigationQueue.push(async () => {
          await navigationFn();
          resolve();
        });
      });
    }

    // Check minimum delay between navigations
    const now = Date.now();
    const timeSinceLastNavigation = now - this.lastNavigationTime;
    if (timeSinceLastNavigation < this.MIN_NAVIGATION_DELAY) {
      const delay = this.MIN_NAVIGATION_DELAY - timeSinceLastNavigation;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Set navigation lock
    this.isNavigating = true;
    this.lastNavigationTime = Date.now();

    try {
      // Execute navigation
      await navigationFn();
      
      // Wait a bit to ensure navigation completes
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Navigation error:', error);
      throw error;
    } finally {
      // Release lock
      this.isNavigating = false;
      
      // Process next queued navigation if any
      if (this.navigationQueue.length > 0) {
        const nextNavigation = this.navigationQueue.shift();
        if (nextNavigation) {
          // Execute next navigation after a delay
          setTimeout(() => {
            this.navigate(nextNavigation);
          }, 100);
        }
      }
    }
  }

  isCurrentlyNavigating(): boolean {
    return this.isNavigating;
  }

  clearQueue(): void {
    this.navigationQueue = [];
  }
}

export const navigationManager = NavigationManager.getInstance();