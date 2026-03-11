import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import path from 'path';
import { COLORS, FONTS, PAGE } from '../styles';
import '../fonts';

interface LightSectionProps {
  heading: string;
  children?: React.ReactNode;
  columns?: 1 | 2;
  showLogo?: boolean;
}

const LOGOS_DIR = path.join(process.cwd(), 'lib/propuestas/assets/logos');
const FNE_LOGO = path.join(LOGOS_DIR, 'fne-logo-bw.png');

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
    flexDirection: 'column',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headingBlock: {
    flex: 1,
  },
  heading: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 20,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  headingRule: {
    height: 2,
    backgroundColor: COLORS.orange,
    width: 50,
    marginBottom: 20,
  },
  logo: {
    width: 60,
    height: 45,
    objectFit: 'contain',
    opacity: 0.7,
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
});

export function LightSection({
  heading,
  children,
  columns = 1,
  showLogo = true,
}: LightSectionProps) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topRow}>
        <View style={styles.headingBlock}>
          <Text style={styles.heading}>{heading}</Text>
          <View style={styles.headingRule} />
        </View>
        {showLogo && <Image src={FNE_LOGO} style={styles.logo} />}
      </View>

      {columns === 2 ? (
        <View style={styles.body2Col}>{children}</View>
      ) : (
        <View style={styles.body1Col}>{children}</View>
      )}
    </Page>
  );
}

export function LightBody({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: COLORS.nearBlack,
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

export function LightColumn({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, flexDirection: 'column' }}>{children}</View>;
}
