/**
 * Toast Notification Styles for Genera
 * Consistent styling following Genera brand guidelines
 *
 * The redesign's new look (phase 5a). These objects are read once, so they cannot ask which look a
 * page has: the values that differ under the new look are written `var(--toast-…, <today's value>)`.
 * The names are declared ONLY in `styles/look-nuevo.css`, under `[data-look="nuevo"]`; with today's
 * look they do not exist and every toast takes the fallback, which is exactly the value it had.
 * `__tests__/constants/toastStyles.test.ts` pins each fallback.
 */

import { ToastOptions } from 'react-hot-toast';

// Brand Colors - Genera palette
const COLORS = {
  primary: '#0a0a0a',        // Genera Black
  accent: '#fbbf24',         // Genera Yellow
  errorRed: 'rgb(var(--color-legacy-ef4044))',
  white: '#ffffff',
  darkGray: '#1f1f1f',
  lightGray: '#f3f4f6',
  successGreen: 'rgb(var(--color-legacy-10b981))',
};

// A value that only the new look changes: `var(--toast-<name>, <today's value>)`.
const lookValue = (name: string, today: string) => `var(--toast-${name}, ${today})`;

// Base toast style
const baseStyle = {
  background: COLORS.white,
  color: lookValue('text', COLORS.darkGray),
  padding: '16px',
  borderRadius: lookValue('radius', '8px'),
  boxShadow: lookValue('shadow', '0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)'),
  // The new look's 1 px line on the three other sides (the left one is each type's edge below).
  // Today: none, which is what a toast had without these properties.
  borderTop: lookValue('line', 'none'),
  borderRight: lookValue('line', 'none'),
  borderBottom: lookValue('line', 'none'),
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  maxWidth: '420px',
  fontSize: lookValue('font-size', '14px'),
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
};

// Toast type-specific styles
export const toastStyles = {
  success: {
    style: {
      ...baseStyle,
      borderLeft: `4px solid ${lookValue('edge-success', COLORS.accent)}`,
    },
    iconTheme: {
      primary: COLORS.successGreen,
      secondary: COLORS.white,
    },
    duration: 3000,
  },
  error: {
    style: {
      ...baseStyle,
      borderLeft: `4px solid ${COLORS.errorRed}`,
    },
    iconTheme: {
      primary: COLORS.errorRed,
      secondary: COLORS.white,
    },
    duration: 5000,
  },
  info: {
    style: {
      ...baseStyle,
      borderLeft: `4px solid ${COLORS.primary}`,
    },
    iconTheme: {
      primary: COLORS.primary,
      secondary: COLORS.white,
    },
    duration: 3000,
  },
  loading: {
    style: {
      ...baseStyle,
      borderLeft: `4px solid ${COLORS.primary}`,
    },
    iconTheme: {
      primary: COLORS.primary,
      secondary: COLORS.white,
    },
  },
};

// Global Toaster configuration
export const toasterConfig = {
  style: baseStyle,
  success: toastStyles.success,
  error: toastStyles.error,
  loading: toastStyles.loading,
  blank: toastStyles.info,
  custom: toastStyles.info,
  duration: 4000,
};


// Mobile responsive adjustments
export const mobileStyle = {
  maxWidth: '90vw',
  fontSize: '13px',
  padding: '12px',
};
