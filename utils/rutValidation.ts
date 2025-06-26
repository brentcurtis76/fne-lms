/**
 * Chilean RUT (Rol Único Tributario) validation utilities
 * Format: XX.XXX.XXX-X where X is a digit and the last one is a verification digit
 */

/**
 * Format a RUT string to the standard format XX.XXX.XXX-X
 */
export function formatRut(rut: string): string {
  // Remove all non-alphanumeric characters
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  
  if (cleaned.length < 2) return cleaned;
  
  // Split into body and verification digit
  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1);
  
  // Format body with dots
  const formatted = body
    .split('')
    .reverse()
    .reduce((acc, digit, index) => {
      if (index > 0 && index % 3 === 0) {
        return digit + '.' + acc;
      }
      return digit + acc;
    }, '');
  
  return `${formatted}-${verifier}`;
}

/**
 * Calculate the verification digit for a RUT
 */
export function calculateVerificationDigit(rutBody: string): string {
  const cleaned = rutBody.replace(/[^0-9]/g, '');
  
  let sum = 0;
  let multiplier = 2;
  
  // Process digits from right to left
  for (let i = cleaned.length - 1; i >= 0; i--) {
    sum += parseInt(cleaned[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const remainder = sum % 11;
  const verifier = 11 - remainder;
  
  if (verifier === 11) return '0';
  if (verifier === 10) return 'K';
  return verifier.toString();
}

/**
 * Validate a Chilean RUT
 */
export function validateRut(rut: string): boolean {
  if (!rut || typeof rut !== 'string') return false;
  
  // Remove all non-alphanumeric characters
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  
  // Check minimum length (2 digits minimum: 1 digit + verifier)
  if (cleaned.length < 2) return false;
  
  // Check maximum length (typically 9 digits max)
  if (cleaned.length > 9) return false;
  
  // Split into body and verification digit
  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1);
  
  // Body must be all digits
  if (!/^\d+$/.test(body)) return false;
  
  // Verifier must be digit or K
  if (!/^[0-9K]$/.test(verifier)) return false;
  
  // Calculate expected verification digit
  const expectedVerifier = calculateVerificationDigit(body);
  
  return verifier === expectedVerifier;
}

/**
 * Extract RUT parts (body and verifier)
 */
export function parseRut(rut: string): { body: string; verifier: string } | null {
  if (!validateRut(rut)) return null;
  
  const cleaned = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  
  return {
    body: cleaned.slice(0, -1),
    verifier: cleaned.slice(-1)
  };
}

/**
 * Check if a string could be a RUT (basic format check without validation)
 */
export function isRutFormat(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  // Remove formatting and check pattern
  const cleaned = value.replace(/[.\-]/g, '');
  
  // Basic pattern: digits followed by digit or K
  return /^\d{1,8}[0-9kK]$/i.test(cleaned);
}

/**
 * Generate a random valid RUT for testing
 */
export function generateRandomRut(): string {
  // Generate random 7-8 digit number
  const min = 1000000;
  const max = 99999999;
  const randomBody = Math.floor(Math.random() * (max - min + 1)) + min;
  
  const bodyStr = randomBody.toString();
  const verifier = calculateVerificationDigit(bodyStr);
  
  return formatRut(bodyStr + verifier);
}