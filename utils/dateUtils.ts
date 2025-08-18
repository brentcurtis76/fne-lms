/**
 * Date utility functions to handle date formatting consistently across the application
 * Solves timezone issues when parsing date-only strings
 */

/**
 * Safely parse a date string as a local date to avoid timezone shifts
 * @param dateString - Date string in YYYY-MM-DD or ISO format
 * @returns Date object representing the local date
 */
export function parseLocalDate(dateString: string): Date {
  // If the date is in YYYY-MM-DD format, parse it as local date
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Create date in local timezone (month is 0-indexed in JavaScript)
    return new Date(year, month - 1, day);
  }
  
  // If it includes time, add noon time to avoid edge cases
  if (dateString.includes('T')) {
    return new Date(dateString);
  }
  
  // Default: append noon time to avoid timezone issues
  return new Date(dateString + 'T12:00:00');
}

/**
 * Format a date string for event display (e.g., "18 AGO 2025")
 * @param dateString - Date string to format
 * @returns Formatted date string
 */
export function formatEventDate(dateString: string): string {
  const date = parseLocalDate(dateString);
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Format a date string for news display (e.g., "18 de agosto de 2025")
 * @param dateString - Date string to format
 * @returns Formatted date string in Spanish
 */
export function formatNewsDate(dateString: string): string {
  const date = parseLocalDate(dateString);
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Format a date for input fields (YYYY-MM-DD)
 * @param dateString - Date string to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateForInput(dateString: string | undefined): string {
  if (!dateString) return '';
  
  // Check if it's already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }
  
  // Otherwise, parse and format it
  try {
    const date = parseLocalDate(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}