import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import path from 'path';
import { COLORS, FONTS, PAGE } from '../styles';
import '../fonts';

interface CoverPageProps {
  programYear: number;
  serviceName: string;
  schoolName: string;
  schoolLogoPath?: string;
}

// Browser-safe logo path: public URL in browser, filesystem path on server
const FNE_LOGO =
  typeof window !== 'undefined'
    ? '/fne-logo-gold.png'
    : path.join(process.cwd(), 'lib/propuestas/assets/logos/fne-logo-gold.png');

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.darkCharcoal,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
  },
  // Top bar: FNE logo left, school logo right
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 60,
  },
  fneLogo: {
    width: 120,
    height: 90,
    objectFit: 'contain',
  },
  schoolLogo: {
    width: 70,
    height: 40,
    objectFit: 'contain',
  },
  // Decorative gold rule
  goldRule: {
    height: 2,
    backgroundColor: COLORS.gold,
    width: 60,
    marginBottom: 20,
  },
  // "PROGRAMA XXXX" label
  programLabel: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  // Main service title
  serviceTitle: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 800,
    fontSize: 28,
    lineHeight: 1.2,
    marginBottom: 24,
    maxWidth: 420,
  },
  // School name
  schoolName: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 13,
    opacity: 0.85,
    marginBottom: 8,
  },
  // Spacer pushing tagline to bottom
  spacer: {
    flexGrow: 1,
  },
  // Bottom section
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gold,
    borderTopStyle: 'solid',
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  tagline: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 500,
    fontStyle: 'italic',
    fontSize: 9,
    opacity: 0.75,
    maxWidth: 300,
    lineHeight: 1.5,
  },
  bottomLogo: {
    width: 80,
    height: 60,
    objectFit: 'contain',
    opacity: 0.7,
  },
  // Content area fills remaining space
  content: {
    flexGrow: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
});

export function CoverPage({ programYear, serviceName, schoolName, schoolLogoPath }: CoverPageProps) {
  return (
    <Page size="A4" style={styles.page}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Image src={FNE_LOGO} style={styles.fneLogo} />
        {schoolLogoPath ? (
          <Image src={schoolLogoPath} style={styles.schoolLogo} />
        ) : null}
      </View>

      {/* Main content block */}
      <View style={styles.content}>
        <View style={styles.goldRule} />
        <Text style={styles.programLabel}>Programa {programYear}</Text>
        <Text style={styles.serviceTitle}>{serviceName}</Text>
        <Text style={styles.schoolName}>{schoolName}</Text>
      </View>

      <View style={styles.spacer} />

      {/* Bottom bar */}
      <View style={styles.bottomSection}>
        <Text style={styles.tagline}>
          La educación nueva se levanta sobre una nueva cultura relacional
        </Text>
        <Image src={FNE_LOGO} style={styles.bottomLogo} />
      </View>
    </Page>
  );
}
