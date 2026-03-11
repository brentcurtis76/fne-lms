/**
 * ContentBlock — renders a single content block as a PDF page.
 * even index → dark background; odd index → light background.
 */
import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';
import { COLORS, FONTS, PAGE } from '../styles';
import type { ContentBlockData, ContentSectionData } from '../generator';
import '../fonts';

const LOGOS_DIR = path.join(process.cwd(), 'lib/propuestas/assets/logos');
const FNE_SUNFLOWER = path.join(LOGOS_DIR, 'fne-sunflower-gold.png');
const FNE_LOGO_BW = path.join(LOGOS_DIR, 'fne-logo-bw.png');

const darkStyles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.darkCharcoal,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
  },
  heading1: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 20,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heading2: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 5,
  },
  heading3: {
    color: COLORS.goldLight,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
  },
  rule: {
    height: 2,
    backgroundColor: COLORS.orange,
    width: 50,
    marginBottom: 18,
  },
  paragraph: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.65,
    marginBottom: 10,
  },
  listItem: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 5,
    paddingLeft: 12,
  },
  imagePlaceholder: {
    backgroundColor: COLORS.grayDark,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderStyle: 'solid',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderRadius: 4,
  },
  imagePlaceholderText: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontSize: 8,
    opacity: 0.7,
  },
  logoWatermark: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    width: 55,
    height: 55,
    objectFit: 'contain',
    opacity: 0.12,
  },
});

const lightStyles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
  },
  heading1: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 20,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heading2: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 15,
    marginBottom: 5,
  },
  heading3: {
    color: COLORS.grayMedium,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
  },
  rule: {
    height: 2,
    backgroundColor: COLORS.orange,
    width: 50,
    marginBottom: 18,
  },
  paragraph: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.65,
    marginBottom: 10,
  },
  listItem: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 5,
    paddingLeft: 12,
  },
  imagePlaceholder: {
    backgroundColor: COLORS.lightGray,
    borderWidth: 1,
    borderColor: COLORS.grayMedium,
    borderStyle: 'solid',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderRadius: 4,
  },
  imagePlaceholderText: {
    color: COLORS.grayMedium,
    fontFamily: FONTS.family,
    fontSize: 8,
  },
  logoWatermark: {
    position: 'absolute',
    bottom: 20,
    right: 40,
    width: 55,
    height: 55,
    objectFit: 'contain',
    opacity: 0.08,
  },
});

function resolveLocalImagePath(storagePath: string): string | null {
  // Strip bucket prefix if present (propuestas/infographics/foo.png → infographics/foo.png)
  const relative = storagePath.replace(/^propuestas\//, '');
  const localPath = path.join(process.cwd(), 'lib/propuestas/assets', relative);
  return fs.existsSync(localPath) ? localPath : null;
}

function renderSection(
  section: ContentSectionData,
  isDark: boolean,
  sectionIndex: number
): React.ReactNode {
  const s = isDark ? darkStyles : lightStyles;

  switch (section.type) {
    case 'heading': {
      const level = section.level ?? 1;
      const headingStyle =
        level === 1 ? s.heading1 : level === 2 ? s.heading2 : s.heading3;
      return (
        <View key={sectionIndex}>
          <Text style={headingStyle}>{section.text ?? ''}</Text>
          {level === 1 && <View style={s.rule} />}
        </View>
      );
    }

    case 'paragraph':
      return (
        <Text key={sectionIndex} style={s.paragraph}>
          {section.text ?? ''}
        </Text>
      );

    case 'list':
      return (
        <View key={sectionIndex}>
          {(section.items ?? []).map((item, i) => (
            <Text key={i} style={s.listItem}>
              {'• ' + item}
            </Text>
          ))}
        </View>
      );

    case 'image': {
      if (!section.path) return null;
      const resolved = resolveLocalImagePath(section.path);
      if (resolved) {
        return (
          <Image
            key={sectionIndex}
            src={resolved}
            style={{ width: '100%', height: 160, objectFit: 'contain', marginBottom: 12 }}
          />
        );
      }
      return (
        <View key={sectionIndex} style={s.imagePlaceholder}>
          <Text style={s.imagePlaceholderText}>[ Imagen no disponible ]</Text>
        </View>
      );
    }

    default:
      return null;
  }
}

interface ContentBlockProps {
  block: ContentBlockData;
  /** Index in the document order — even = dark, odd = light */
  index: number;
}

export function ContentBlock({ block, index }: ContentBlockProps) {
  const isDark = index % 2 === 0;
  const s = isDark ? darkStyles : lightStyles;
  const watermarkSrc = isDark ? FNE_SUNFLOWER : FNE_LOGO_BW;

  const sections = block.contenido.sections;

  return (
    <Page size="A4" style={s.page}>
      {sections.map((section, i) => renderSection(section, isDark, i))}

      {/* Render block-level images that aren't part of sections */}
      {(block.imagenes ?? []).map((img) => {
        const resolved = resolveLocalImagePath(img.path);
        if (resolved) {
          return (
            <Image
              key={img.key}
              src={resolved}
              style={{ width: '100%', height: 160, objectFit: 'contain', marginBottom: 12 }}
            />
          );
        }
        return (
          <View key={img.key} style={s.imagePlaceholder}>
            <Text style={s.imagePlaceholderText}>[ {img.alt} ]</Text>
          </View>
        );
      })}

      <Image src={watermarkSrc} style={s.logoWatermark} />
    </Page>
  );
}
