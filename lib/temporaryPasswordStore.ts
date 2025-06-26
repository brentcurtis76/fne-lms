/**
 * Temporary password store for bulk user imports
 * 
 * SECURITY: This is a temporary in-memory store that should be replaced
 * with a more secure solution in production (e.g., encrypted database storage
 * with automatic expiration)
 */

interface PasswordEntry {
  email: string;
  password: string;
  createdAt: Date;
  expiresAt: Date;
}

interface SessionData {
  [email: string]: PasswordEntry;
}

class TemporaryPasswordStore {
  private passwordStore: Map<string, SessionData> = new Map();
  private readonly EXPIRATION_TIME = 15 * 60 * 1000; // 15 minutes

  /**
   * Store a password temporarily
   */
  store(sessionId: string, email: string, password: string): void {
    const now = new Date();
    const entry: PasswordEntry = {
      email,
      password,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.EXPIRATION_TIME)
    };

    // Get existing entries for this session or create new object
    const sessionData = this.passwordStore.get(sessionId) || {};
    sessionData[email] = entry;
    this.passwordStore.set(sessionId, sessionData);

    // Schedule cleanup
    setTimeout(() => this.cleanup(sessionId, email), this.EXPIRATION_TIME);
  }

  /**
   * Retrieve passwords for a session
   */
  retrieve(sessionId: string): PasswordEntry[] {
    const sessionData = this.passwordStore.get(sessionId);
    if (!sessionData) return [];

    const entries: PasswordEntry[] = [];
    const now = new Date();

    Object.values(sessionData).forEach((entry) => {
      if (entry.expiresAt > now) {
        entries.push(entry);
      }
    });

    return entries;
  }

  /**
   * Clear passwords for a session
   */
  clear(sessionId: string): void {
    this.passwordStore.delete(sessionId);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(sessionId: string, email: string): void {
    const sessionData = this.passwordStore.get(sessionId);
    if (sessionData) {
      delete sessionData[email];
      
      // If no more entries, remove the session
      if (Object.keys(sessionData).length === 0) {
        this.passwordStore.delete(sessionId);
      } else {
        this.passwordStore.set(sessionId, sessionData);
      }
    }
  }
}

// Singleton instance
export const passwordStore = new TemporaryPasswordStore();

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  return `bulk-import-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}