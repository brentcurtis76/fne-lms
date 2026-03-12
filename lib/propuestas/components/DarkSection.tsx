import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import path from 'path';
import { COLORS, FONTS, PAGE } from '../styles';
import '../fonts';

interface DarkSectionProps {
  heading: string;
  children?: React.ReactNode;
  columns?: 1 | 2;
  showLogo?: boolean;
}

// Browser-safe logo path: public URL in browser, filesystem path on server
const FNE_LOGO =
  typeof window !== 'undefined'
    ? '/logos/fne-sunflower-gold.png'
    : path.join(process.cwd(), 'public', 'logos', 'fne-sunflower-gold.png');

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.darkCharcoal,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
    flexDirection: 'column',
  },
  heading: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 6,
  },
  headingRule: {
    height: 2,
    backgroundColor: COLORS.orange,
    width: 50,
    marginBottom: 20,
  },
  body1Col: {
    flexGrow: 1,
    flexDirection: 'column',
  },
  body2Col: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: 24,
  },
  column: {
    flex: 1,
    flexDirection: 'column',
  },
  // Watermark logo in bottom-right corner
  logoWatermark: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    width: 60,
    height: 60,
    objectFit: 'contain',
    opacity: 0.15,
  },
});

export function DarkSection({ heading, children, columns = 1, showLogo = false }: DarkSectionProps) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.headingRule} />

      {columns === 2 ? (
        <View style={styles.body2Col}>{children}</View>
      ) : (
        <View style={styles.body1Col}>{children}</View>
      )}

      {showLogo && (
        <Image src={FNE_LOGO} style={styles.logoWatermark} />
      )}
    </Page>
  );
}

// Convenience wrapper for a text paragraph inside DarkSection
export function DarkBody({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: COLORS.white,
        fontFamily: FONTS.family,
        fontWeight: 'normal',
        fontSize: 10,
        lineHeight: 1.65,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

// Two-column wrapper — use inside DarkSection with columns={2}
export function DarkColumn({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, flexDirection: 'column' }}>{children}</View>
  );
}
