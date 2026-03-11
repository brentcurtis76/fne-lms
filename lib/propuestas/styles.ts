import { StyleSheet } from '@react-pdf/renderer';

// FNE Brand Colors (from brand-kit + plan Section 7.1)
export const COLORS = {
  // Primary
  gold: '#FBBF24',
  darkCharcoal: '#1A1A1A',
  black: '#0A0A0A',
  white: '#FFFFFF',
  nearBlack: '#111827',

  // Secondary (GENERA brand kit)
  goldIntense: '#F59E0B',
  goldLight: '#FCD34D',
  grayDark: '#1F1F1F',
  grayMedium: '#6B7280',

  // Accent
  orange: '#E87722',
  lightGray: '#E5E7EB',
  warmBrown: '#6B4C3B',
  tealDark: '#0F2B3C',
};

export const FONTS = {
  family: 'Inter',
};

export const PAGE = {
  width: 595.28,   // A4 points
  height: 841.89,
  margin: { top: 40, right: 40, bottom: 60, left: 40 },
};

export const baseStyles = StyleSheet.create({
  page: {
    fontFamily: FONTS.family,
    fontSize: 10,
    color: COLORS.nearBlack,
  },
  pageDark: {
    fontFamily: FONTS.family,
    fontSize: 10,
    backgroundColor: COLORS.darkCharcoal,
    color: COLORS.white,
  },
  h1: {
    fontFamily: FONTS.family,
    fontWeight: 800,
    fontSize: 32,
    lineHeight: 1.15,
  },
  h2: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 18,
    lineHeight: 1.25,
  },
  h3: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 13,
    lineHeight: 1.3,
  },
  body: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.6,
  },
  tagline: {
    fontFamily: FONTS.family,
    fontWeight: 500,
    fontStyle: 'italic',
    fontSize: 10,
    lineHeight: 1.5,
  },
  label: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
