/**
 * Reusable brand elements: PageNumber, FooterBar, LogoHeader
 */
import React from 'react';
import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import path from 'path';
import { COLORS, FONTS } from '../styles';
import '../fonts';

const LOGOS_DIR = path.join(process.cwd(), 'lib/propuestas/assets/logos');
const FNE_LOGO_GOLD = path.join(LOGOS_DIR, 'fne-logo-gold.png');
const FNE_LOGO_BW = path.join(LOGOS_DIR, 'fne-logo-bw.png');

const styles = StyleSheet.create({
  pageNumber: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 7.5,
    letterSpacing: 1,
    color: COLORS.grayMedium,
  },
  footerBar: {
    position: 'absolute',
    bottom: 36,
    left: 40,
    right: 40,
    height: 1,
    backgroundColor: COLORS.gold,
  },
  footerTagline: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    fontFamily: FONTS.family,
    fontWeight: 500,
    fontStyle: 'italic',
    fontSize: 7,
    color: COLORS.grayMedium,
  },
  logoTopRight: {
    position: 'absolute',
    top: 20,
    right: 40,
    width: 60,
    height: 45,
    objectFit: 'contain',
  },
  logoTopLeft: {
    position: 'absolute',
    top: 20,
    left: 40,
    width: 60,
    height: 45,
    objectFit: 'contain',
  },
});

/**
 * Bottom-center page number in format: "PROGRAMA [year] – Nueva Educación  |  ##"
 */
export function PageNumber({ number, year }: { number: number; year: number }) {
  const label = `PROGRAMA ${year} – Nueva Educación  |  ${String(number).padStart(2, '0')}`;
  return <Text style={styles.pageNumber}>{label}</Text>;
}

/** Thin gold horizontal rule near the footer */
export function FooterBar({ showTagline = false }: { showTagline?: boolean }) {
  return (
    <>
      <View style={styles.footerBar} />
      {showTagline && (
        <Text style={styles.footerTagline}>
          La educación nueva se levanta sobre una nueva cultura relacional
        </Text>
      )}
    </>
  );
}

/** Absolutely positioned FNE logo — top-right (light pages) or top-right gold (dark pages) */
export function LogoHeader({
  position = 'right',
  variant = 'dark',
}: {
  position?: 'left' | 'right';
  variant?: 'gold' | 'dark';
}) {
  const src = variant === 'gold' ? FNE_LOGO_GOLD : FNE_LOGO_BW;
  const posStyle = position === 'right' ? styles.logoTopRight : styles.logoTopLeft;
  return <Image src={src} style={posStyle} />;
}
