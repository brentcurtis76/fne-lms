import React from 'react';
import { Text, StyleSheet } from '@react-pdf/renderer';
import { COLORS, FONTS } from '../styles';
import '../fonts';

const styles = StyleSheet.create({
  h1: {
    fontFamily: FONTS.family,
    fontWeight: 800,
    fontSize: 24,
    lineHeight: 1.2,
    marginBottom: 12,
  },
  h2: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 18,
    lineHeight: 1.25,
    marginBottom: 10,
  },
  h3: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 13,
    lineHeight: 1.3,
    marginBottom: 8,
  },
  body: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 8,
  },
  caption: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8,
    lineHeight: 1.4,
    marginBottom: 6,
  },
  label: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
});

interface HeadingProps {
  level?: 1 | 2 | 3;
  children: string;
  color?: string;
}

export function Heading({ level = 1, children, color }: HeadingProps) {
  const base = level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
  return (
    <Text style={color ? { ...base, color } : base}>{children}</Text>
  );
}

export function Body({
  children,
  color = COLORS.nearBlack,
}: {
  children: string;
  color?: string;
}) {
  return <Text style={{ ...styles.body, color }}>{children}</Text>;
}

export function Caption({
  children,
  color = COLORS.grayMedium,
}: {
  children: string;
  color?: string;
}) {
  return <Text style={{ ...styles.caption, color }}>{children}</Text>;
}

export function Label({
  children,
  color = COLORS.nearBlack,
}: {
  children: string;
  color?: string;
}) {
  return <Text style={{ ...styles.label, color }}>{children}</Text>;
}
