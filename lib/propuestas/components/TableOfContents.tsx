/**
 * TableOfContents — auto-generated table of contents page.
 * White background, orange 'CONTENIDOS' heading, FNE logo top-right.
 * No page numbers in v1 (two-pass complexity avoided).
 */
import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import path from 'path';
import { COLORS, FONTS, PAGE } from '../styles';
import '../fonts';

interface TableOfContentsProps {
  sections: string[];
  year: number;
}

const FNE_LOGO_BW = path.join(process.cwd(), 'public', 'logos', 'fne-logo-bw.png');

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  titleBlock: {
    flex: 1,
  },
  label: {
    color: COLORS.orange,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heading: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 800,
    fontSize: 28,
    lineHeight: 1.15,
    marginBottom: 6,
  },
  rule: {
    height: 2,
    backgroundColor: COLORS.orange,
    width: 60,
  },
  logo: {
    width: 60,
    height: 45,
    objectFit: 'contain',
    opacity: 0.65,
  },
  list: {
    marginTop: 20,
    flexDirection: 'column',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    borderBottomStyle: 'solid',
  },
  itemNumber: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 8,
    color: COLORS.gold,
    width: 24,
    textAlign: 'right',
    marginRight: 14,
  },
  itemText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10.5,
    color: COLORS.nearBlack,
    flex: 1,
  },
  dotLeader: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    borderBottomStyle: 'dotted',
    marginHorizontal: 8,
    height: 1,
    alignSelf: 'flex-end',
    marginBottom: 3,
  },
  yearLabel: {
    position: 'absolute',
    bottom: PAGE.margin.bottom,
    right: PAGE.margin.right,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    color: COLORS.grayMedium,
    letterSpacing: 1.5,
  },
});

export function TableOfContents({ sections, year }: TableOfContentsProps) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.label}>Índice</Text>
          <Text style={styles.heading}>Contenidos</Text>
          <View style={styles.rule} />
        </View>
        <Image src={FNE_LOGO_BW} style={styles.logo} />
      </View>

      <View style={styles.list}>
        {sections.map((title, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemNumber}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={styles.itemText}>{title}</Text>
            <View style={styles.dotLeader} />
          </View>
        ))}
      </View>

      <Text style={styles.yearLabel}>PROGRAMA {year}</Text>
    </Page>
  );
}
