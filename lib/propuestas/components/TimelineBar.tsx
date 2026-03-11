/**
 * TimelineBar — visual calendar showing which month each module is active.
 * Horizontal bar chart style with gold bars on dark background.
 */
import React from 'react';
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { COLORS, FONTS, PAGE } from '../styles';
import '../fonts';

interface TimelineModule {
  nombre: string;
  /** 1-based month number for active slot */
  mes?: number;
}

interface TimelineBarProps {
  modules: TimelineModule[];
  /** 1-based start month (1 = January) */
  startMonth: number;
  /** Number of months to display */
  duration: number;
}

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

const LABEL_WIDTH = 150;
const MONTH_COL = 28;

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.darkCharcoal,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
  },
  heading: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 6,
  },
  rule: {
    height: 2,
    backgroundColor: COLORS.orange,
    width: 50,
    marginBottom: 20,
  },
  table: {
    flexDirection: 'column',
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  headerLabel: {
    width: LABEL_WIDTH,
  },
  monthHeader: {
    width: MONTH_COL,
    alignItems: 'center',
  },
  monthHeaderText: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 7.5,
    color: COLORS.gold,
    textAlign: 'center',
  },
  moduleRow: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'center',
    minHeight: 20,
  },
  moduleLabelCell: {
    width: LABEL_WIDTH,
    justifyContent: 'center',
    paddingRight: 8,
  },
  moduleLabelText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8,
    color: COLORS.white,
    opacity: 0.9,
  },
  monthCell: {
    width: MONTH_COL,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  activeCell: {
    backgroundColor: COLORS.gold,
  },
  inactiveCell: {
    backgroundColor: '#2A2A2A',
  },
  legend: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    backgroundColor: COLORS.gold,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8,
    color: COLORS.grayMedium,
  },
});

export function TimelineBar({ modules, startMonth, duration }: TimelineBarProps) {
  const capped = Math.min(Math.max(duration, 1), 12);
  const months = Array.from({ length: capped }, (_, i) => {
    const idx = (startMonth - 1 + i) % 12;
    return MONTH_NAMES[idx];
  });

  // Assign a default month slot (0-based offset) for modules without explicit mes
  function defaultSlot(moduleIndex: number): number {
    return Math.floor((moduleIndex * capped) / modules.length);
  }

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>Propuesta Técnica — Calendario</Text>
      <View style={styles.rule} />

      <View style={styles.table}>
        {/* Month header row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLabel} />
          {months.map((m, i) => (
            <View key={i} style={styles.monthHeader}>
              <Text style={styles.monthHeaderText}>{m}</Text>
            </View>
          ))}
        </View>

        {/* Module rows */}
        {modules.map((mod, i) => {
          const activeOffset =
            mod.mes != null
              ? mod.mes - startMonth
              : defaultSlot(i);

          return (
            <View key={i} style={styles.moduleRow}>
              <View style={styles.moduleLabelCell}>
                <Text style={styles.moduleLabelText}>{mod.nombre}</Text>
              </View>
              {months.map((_, j) => (
                <View
                  key={j}
                  style={[
                    styles.monthCell,
                    j === activeOffset ? styles.activeCell : styles.inactiveCell,
                  ]}
                />
              ))}
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendDot} />
        <Text style={styles.legendText}>Mes de actividad principal por módulo</Text>
      </View>
    </Page>
  );
}
