/**
 * Toast Icon Components for FNE LMS
 * Custom SVG icons following FNE brand colors
 */

import React from 'react';

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

export const SuccessIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="10" fill={COLORS.successGreen} />
    <path
      d="M14.5 7L8.5 13L5.5 10"
      stroke={COLORS.white}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ErrorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="10" fill={COLORS.errorRed} />
    <path
      d="M13 7L7 13M7 7L13 13"
      stroke={COLORS.white}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="10" fill={COLORS.navyBlue} />
    <path
      d="M10 9V14M10 6V6.5"
      stroke={COLORS.white}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LoadingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="animate-spin">
    <circle
      cx="10"
      cy="10"
      r="8"
      stroke={COLORS.lightGray}
      strokeWidth="2"
      fill="none"
    />
    <path
      d="M10 2C14.418 2 18 5.582 18 10"
      stroke={COLORS.navyBlue}
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);