/**
 * ModuleTable — session/module schedule table on a dark background page.
 * Gold header row, alternating row backgrounds, bold totals row.
 * Columns: Módulo | Presencial | Sincrónica | Asincrónica | Total
 */
import React from 'react';
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { COLORS, FONTS, PAGE } from '../styles';
import '../fonts';

export interface ModuleRow {
  nombre: string;
  horas_presenciales: number;
  horas_sincronicas: number;
  horas_asincronicas: number;
}

export interface ModuleTotals {
  horas_presenciales: number;
  horas_sincronicas: number;
  horas_asincronicas: number;
  total: number;
}

interface ModuleTableProps {
  modules: ModuleRow[];
  totals: ModuleTotals;
}

const COL = {
  modulo: 220,
  presencial: 65,
  sincronica: 65,
  asincronica: 70,
  total: 50,
};

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
    borderWidth: 1,
    borderColor: COLORS.grayDark,
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.gold,
  },
  headerCell: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 8.5,
    color: COLORS.darkCharcoal,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.grayDark,
    borderTopStyle: 'solid',
  },
  rowEven: {
    backgroundColor: '#222222',
  },
  rowOdd: {
    backgroundColor: '#1A1A1A',
  },
  totalsRow: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: COLORS.gold,
    borderTopStyle: 'solid',
    backgroundColor: '#252525',
  },
  cell: {
    padding: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleCell: {
    padding: 7,
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 9,
    color: COLORS.white,
    textAlign: 'center',
  },
  moduleCellText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 9,
    color: COLORS.white,
  },
  totalsCellText: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    color: COLORS.gold,
    textAlign: 'center',
  },
  totalModuleText: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    color: COLORS.gold,
  },
});

export function ModuleTable({ modules, totals }: ModuleTableProps) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>Propuesta Técnica — Módulos</Text>
      <View style={styles.rule} />

      <View style={styles.table}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={[styles.headerCell, { width: COL.modulo }]}>
            <Text style={styles.headerText}>Módulo</Text>
          </View>
          <View style={[styles.headerCell, { width: COL.presencial }]}>
            <Text style={styles.headerText}>Presencial</Text>
          </View>
          <View style={[styles.headerCell, { width: COL.sincronica }]}>
            <Text style={styles.headerText}>Sincrónica</Text>
          </View>
          <View style={[styles.headerCell, { width: COL.asincronica }]}>
            <Text style={styles.headerText}>Asincrónica</Text>
          </View>
          <View style={[styles.headerCell, { width: COL.total }]}>
            <Text style={styles.headerText}>Total</Text>
          </View>
        </View>

        {/* Module rows */}
        {modules.map((mod, i) => {
          const rowTotal =
            mod.horas_presenciales + mod.horas_sincronicas + mod.horas_asincronicas;
          return (
            <View
              key={i}
              style={[styles.row, i % 2 === 0 ? styles.rowEven : styles.rowOdd]}
            >
              <View style={[styles.moduleCell, { width: COL.modulo }]}>
                <Text style={styles.moduleCellText}>{mod.nombre}</Text>
              </View>
              <View style={[styles.cell, { width: COL.presencial }]}>
                <Text style={styles.cellText}>{mod.horas_presenciales}h</Text>
              </View>
              <View style={[styles.cell, { width: COL.sincronica }]}>
                <Text style={styles.cellText}>{mod.horas_sincronicas}h</Text>
              </View>
              <View style={[styles.cell, { width: COL.asincronica }]}>
                <Text style={styles.cellText}>{mod.horas_asincronicas}h</Text>
              </View>
              <View style={[styles.cell, { width: COL.total }]}>
                <Text style={styles.cellText}>{rowTotal}h</Text>
              </View>
            </View>
          );
        })}

        {/* Totals row */}
        <View style={styles.totalsRow}>
          <View style={[styles.moduleCell, { width: COL.modulo }]}>
            <Text style={styles.totalModuleText}>TOTALES</Text>
          </View>
          <View style={[styles.cell, { width: COL.presencial }]}>
            <Text style={styles.totalsCellText}>{totals.horas_presenciales}h</Text>
          </View>
          <View style={[styles.cell, { width: COL.sincronica }]}>
            <Text style={styles.totalsCellText}>{totals.horas_sincronicas}h</Text>
          </View>
          <View style={[styles.cell, { width: COL.asincronica }]}>
            <Text style={styles.totalsCellText}>{totals.horas_asincronicas}h</Text>
          </View>
          <View style={[styles.cell, { width: COL.total }]}>
            <Text style={styles.totalsCellText}>{totals.total}h</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}
