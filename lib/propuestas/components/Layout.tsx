/**
 * Page layout wrappers: SingleColumn, TwoColumn, ThreeColumn
 * These are View-level helpers used inside Page components.
 */
import React from 'react';
import { View, StyleSheet } from '@react-pdf/renderer';
import { PAGE } from '../styles';

const styles = StyleSheet.create({
  singleColumn: {
    flex: 1,
    flexDirection: 'column',
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
  },
  twoColumn: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
  },
  twoColumnChild: {
    flex: 1,
    flexDirection: 'column',
  },
  threeColumn: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  threeColumnChild: {
    flex: 1,
    flexDirection: 'column',
  },
});

export function SingleColumn({
  children,
  padding = true,
}: {
  children: React.ReactNode;
  padding?: boolean;
}) {
  return (
    <View style={padding ? styles.singleColumn : { flex: 1, flexDirection: 'column' }}>
      {children}
    </View>
  );
}

export function TwoColumn({
  left,
  right,
  gap,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  gap?: number;
}) {
  return (
    <View style={gap != null ? { ...styles.twoColumn, gap } : styles.twoColumn}>
      <View style={styles.twoColumnChild}>{left}</View>
      <View style={styles.twoColumnChild}>{right}</View>
    </View>
  );
}

export function ThreeColumn({ children }: { children: React.ReactNode }) {
  return <View style={styles.threeColumn}>{children}</View>;
}
