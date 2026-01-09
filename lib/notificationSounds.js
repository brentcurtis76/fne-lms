/**
 * Notification Sound Manager
 * Handles playing notification sounds based on priority and user preferences
 */

export class NotificationSounds {
  constructor() {
    this.sounds = null;
    this.initialized = false;
    this.audioContext = null;
  }

  /**
   * Initialize audio context and load sounds
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create audio context (required for some browsers)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Pre-load notification sounds
      this.sounds = {
        high: await this.loadSound('/sounds/notification-high.mp3'),
        medium: await this.loadSound('/sounds/notification-medium.mp3'),
        low: await this.loadSound('/sounds/notification-low.mp3'),
        success: await this.loadSound('/sounds/notification-success.mp3'),
        error: await this.loadSound('/sounds/notification-error.mp3')
      };

      this.initialized = true;
      console.log('Notification sounds initialized');
    } catch (error) {
      console.error('Failed to initialize notification sounds:', error);
    }
  }

  /**
   * Load a sound file
   */
  async loadSound(url) {
    try {
      const audio = new Audio(url);
      audio.preload = 'auto';
      
      // Wait for audio to be loaded
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true });
        audio.addEventListener('error', reject, { once: true });
      });

      return audio;
    } catch (error) {
      console.error(`Failed to load sound: ${url}`, error);
      return null;
    }
  }

  /**
   * Play notification sound based on priority
   */
  async playForPriority(priority = 'medium', userPreferences = {}) {
    // Check if sounds are enabled
    if (userPreferences.sounds_enabled === false) {
      console.log('Notification sounds disabled by user preference');
      return;
    }

    // Initialize if needed
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Resume audio context if suspended (required for some browsers)
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const sound = this.sounds?.[priority] || this.sounds?.medium;
      if (!sound) {
        console.warn(`No sound available for priority: ${priority}`);
        return;
      }

      // Clone the audio to allow multiple simultaneous plays
      const audio = sound.cloneNode();
      
      // Set volume based on user preference
      audio.volume = userPreferences.volume || 0.5;

      // Play the sound
      await audio.play();
      
      console.log(`Played notification sound for priority: ${priority}`);
    } catch (error) {
      // Autoplay might be blocked by browser
      if (error.name === 'NotAllowedError') {
        console.log('Notification sound blocked by browser autoplay policy');
      } else {
        console.error('Error playing notification sound:', error);
      }
    }
  }

  /**
   * Play a specific sound type
   */
  async playSound(type, volume = 0.5) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const sound = this.sounds?.[type];
      if (!sound) {
        console.warn(`No sound available for type: ${type}`);
        return;
      }

      const audio = sound.cloneNode();
      audio.volume = Math.max(0, Math.min(1, volume));
      await audio.play();
    } catch (error) {
      console.error(`Error playing ${type} sound:`, error);
    }
  }

  /**
   * Test all sounds (for settings page)
   */
  async testSounds(volume = 0.5) {
    const soundTypes = ['low', 'medium', 'high', 'success', 'error'];
    
    for (const type of soundTypes) {
      await this.playSound(type, volume);
      // Wait between sounds
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Request permission to play sounds (mobile devices)
   */
  async requestPermission() {
    try {
      // Create a silent audio element to trigger user interaction
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAABkYXRhBAAAAAAAAAA=');
      silentAudio.volume = 0;
      await silentAudio.play();
      
      // Initialize audio context
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to request audio permission:', error);
      return false;
    }
  }
}

// Create singleton instance
export const notificationSounds = new NotificationSounds();

// Notification sound URLs (for reference when creating actual sound files)
export const SOUND_URLS = {
  high: '/sounds/notification-high.mp3',
  medium: '/sounds/notification-medium.mp3',
  low: '/sounds/notification-low.mp3',
  success: '/sounds/notification-success.mp3',
  error: '/sounds/notification-error.mp3'
};