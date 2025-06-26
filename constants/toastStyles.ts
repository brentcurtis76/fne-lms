/**
 * Toast Notification Styles for FNE LMS
 * Consistent styling following FNE brand guidelines
 */

import { ToastOptions } from 'react-hot-toast';

// Brand Colors
const COLORS = {
  navyBlue: '#00365b',
  goldenYellow: '#fdb933',
  errorRed: '#ef4044',
  white: '#ffffff',
  darkGray: '#1a1a1a',
  lightGray: '#f3f4f6',
  successGreen: '#10b981',
};

// Base toast style
const baseStyle = {
  background: COLORS.white,
  color: COLORS.darkGray,
  padding: '16px',
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  maxWidth: '420px',
  fontSize: '14px',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
};

// Toast type-specific styles
export const toastStyles = {
  success: {
    style: {
      ...baseStyle,
      borderLeft: `4px solid ${COLORS.goldenYellow}`,
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
      borderLeft: `4px solid ${COLORS.navyBlue}`,
    },
    iconTheme: {
      primary: COLORS.navyBlue,
      secondary: COLORS.white,
    },
    duration: 3000,
  },
  loading: {
    style: {
      ...baseStyle,
      borderLeft: `4px solid ${COLORS.navyBlue}`,
    },
    iconTheme: {
      primary: COLORS.navyBlue,
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