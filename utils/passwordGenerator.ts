/**
 * Secure password generation utilities for bulk user creation
 */

/**
 * Password strength requirements
 */
export interface PasswordRequirements {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  specialChars?: string;
}

/**
 * Default password requirements matching Supabase Auth requirements
 */
export const DEFAULT_REQUIREMENTS: PasswordRequirements = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false, // Optional for easier communication
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

/**
 * Character sets for password generation
 */
const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  // Avoiding ambiguous characters like 0/O, 1/l/I
  uppercaseSafe: 'ABCDEFGHJKMNPQRSTUVWXYZ',
  lowercaseSafe: 'abcdefghjkmnpqrstuvwxyz',
  numbersSafe: '23456789'
};

/**
 * Generate a random secure password
 */
export function generatePassword(
  requirements: PasswordRequirements = DEFAULT_REQUIREMENTS
): string {
  const reqs = { ...DEFAULT_REQUIREMENTS, ...requirements };
  
  // Build character set based on requirements
  let charSet = '';
  const guaranteedChars: string[] = [];
  
  if (reqs.requireUppercase) {
    charSet += CHAR_SETS.uppercaseSafe;
    // Guarantee at least one uppercase
    guaranteedChars.push(
      CHAR_SETS.uppercaseSafe[Math.floor(Math.random() * CHAR_SETS.uppercaseSafe.length)]
    );
  }
  
  if (reqs.requireLowercase) {
    charSet += CHAR_SETS.lowercaseSafe;
    // Guarantee at least one lowercase
    guaranteedChars.push(
      CHAR_SETS.lowercaseSafe[Math.floor(Math.random() * CHAR_SETS.lowercaseSafe.length)]
    );
  }
  
  if (reqs.requireNumbers) {
    charSet += CHAR_SETS.numbersSafe;
    // Guarantee at least one number
    guaranteedChars.push(
      CHAR_SETS.numbersSafe[Math.floor(Math.random() * CHAR_SETS.numbersSafe.length)]
    );
  }
  
  if (reqs.requireSpecialChars && reqs.specialChars) {
    charSet += reqs.specialChars;
    // Guarantee at least one special char
    guaranteedChars.push(
      reqs.specialChars[Math.floor(Math.random() * reqs.specialChars.length)]
    );
  }
  
  // Generate remaining characters
  const remainingLength = (reqs.minLength || 8) - guaranteedChars.length;
  const chars: string[] = [];
  
  for (let i = 0; i < remainingLength; i++) {
    chars.push(charSet[Math.floor(Math.random() * charSet.length)]);
  }
  
  // Combine guaranteed and random chars, then shuffle
  const allChars = [...guaranteedChars, ...chars];
  return shuffleArray(allChars).join('');
}

/**
 * Generate a memorable password using a pattern
 */
export function generateMemorablePassword(
  firstName?: string,
  lastName?: string,
  includeYear: boolean = true
): string {
  const words: string[] = [];
  
  // Use name parts if available
  if (firstName && firstName.length >= 3) {
    words.push(capitalizeFirst(firstName.substring(0, 4)));
  }
  
  if (lastName && lastName.length >= 3) {
    words.push(capitalizeFirst(lastName.substring(0, 4)));
  }
  
  // Add random number
  const randomNum = Math.floor(Math.random() * 900) + 100;
  words.push(randomNum.toString());
  
  // Add year if requested
  if (includeYear) {
    words.push(new Date().getFullYear().toString());
  }
  
  // Add a special character for security
  const specialChars = ['!', '@', '#', '$', '*'];
  words.push(specialChars[Math.floor(Math.random() * specialChars.length)]);
  
  return words.join('');
}

/**
 * Generate passwords in bulk
 */
export function generateBulkPasswords(
  count: number,
  requirements?: PasswordRequirements
): string[] {
  const passwords: string[] = [];
  const usedPasswords = new Set<string>();
  
  while (passwords.length < count) {
    const password = generatePassword(requirements);
    
    // Ensure uniqueness
    if (!usedPasswords.has(password)) {
      usedPasswords.add(password);
      passwords.push(password);
    }
  }
  
  return passwords;
}

/**
 * Validate password against requirements
 */
export function validatePassword(
  password: string,
  requirements: PasswordRequirements = DEFAULT_REQUIREMENTS
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const reqs = { ...DEFAULT_REQUIREMENTS, ...requirements };
  
  if (password.length < (reqs.minLength || 8)) {
    errors.push(`La contraseña debe tener al menos ${reqs.minLength} caracteres`);
  }
  
  if (reqs.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra mayúscula');
  }
  
  if (reqs.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra minúscula');
  }
  
  if (reqs.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('La contraseña debe contener al menos un número');
  }
  
  if (reqs.requireSpecialChars && reqs.specialChars) {
    const specialRegex = new RegExp(`[${reqs.specialChars.replace(/[\[\]\\]/g, '\\$&')}]`);
    if (!specialRegex.test(password)) {
      errors.push('La contraseña debe contener al menos un carácter especial');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate password strength score (0-100)
 */
export function calculatePasswordStrength(password: string): number {
  let score = 0;
  
  // Length score (max 30 points)
  score += Math.min(password.length * 2, 30);
  
  // Character variety (max 40 points)
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 10;
  
  // Pattern penalties
  if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated characters
  if (/^[0-9]+$/.test(password)) score -= 20; // Only numbers
  if (/^[a-zA-Z]+$/.test(password)) score -= 10; // Only letters
  
  // Common patterns penalty
  const commonPatterns = ['123', 'abc', 'qwe', 'asd', 'zxc'];
  commonPatterns.forEach(pattern => {
    if (password.toLowerCase().includes(pattern)) score -= 5;
  });
  
  // Bonus for length
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 10;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Get password strength label
 */
export function getPasswordStrengthLabel(score: number): string {
  if (score >= 80) return 'Muy fuerte';
  if (score >= 60) return 'Fuerte';
  if (score >= 40) return 'Moderada';
  if (score >= 20) return 'Débil';
  return 'Muy débil';
}

/**
 * Helper function to shuffle array
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Helper function to capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}