/**
 * PricingTable — economic proposal page.
 * Shows UF calculation, payment terms, and signature block.
 */
import React from 'react';
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { COLORS, FONTS, PAGE } from '../styles';
import '../fonts';

interface PricingTableProps {
  mode: 'per_hour' | 'fixed';
  precioUf: number;
  totalHours: number;
  formaPago: string;
  fixedUf?: number;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    paddingTop: PAGE.margin.top,
    paddingRight: PAGE.margin.right,
    paddingBottom: PAGE.margin.bottom,
    paddingLeft: PAGE.margin.left,
    fontFamily: FONTS.family,
  },
  heading: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 6,
  },
  rule: {
    height: 2,
    backgroundColor: COLORS.orange,
    width: 50,
    marginBottom: 24,
  },
  sectionLabel: {
    color: COLORS.orange,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 16,
  },
  table: {
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: COLORS.lightGray,
    borderStyle: 'solid',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGray,
    borderBottomStyle: 'solid',
  },
  tableRowAlt: {
    backgroundColor: '#F9FAFB',
  },
  tableHeader: {
    backgroundColor: COLORS.nearBlack,
  },
  tableLabelCell: {
    flex: 2,
    padding: 10,
    justifyContent: 'center',
  },
  tableValueCell: {
    flex: 1,
    padding: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerText: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    color: COLORS.white,
  },
  labelText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    color: COLORS.nearBlack,
  },
  valueText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    color: COLORS.nearBlack,
    textAlign: 'right',
  },
  totalRow: {
    backgroundColor: COLORS.gold,
  },
  totalLabelText: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 11,
    color: COLORS.darkCharcoal,
  },
  totalValueText: {
    fontFamily: FONTS.family,
    fontWeight: 800,
    fontSize: 13,
    color: COLORS.darkCharcoal,
    textAlign: 'right',
  },
  paymentRow: {
    marginTop: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentLabel: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    color: COLORS.grayMedium,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginRight: 8,
  },
  paymentValue: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 10,
    color: COLORS.nearBlack,
  },
  spacer: {
    flexGrow: 1,
  },
  signatureBlock: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    borderTopStyle: 'solid',
    paddingTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  signatureLine: {
    width: 200,
    borderTopWidth: 1,
    borderTopColor: COLORS.nearBlack,
    borderTopStyle: 'solid',
    paddingTop: 6,
    marginBottom: 24,
  },
  signatureName: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    color: COLORS.nearBlack,
    marginBottom: 2,
  },
  signatureTitle: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8.5,
    color: COLORS.grayMedium,
  },
  contactBlock: {
    alignItems: 'flex-end',
  },
  contactText: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8,
    color: COLORS.grayMedium,
    marginBottom: 2,
    textAlign: 'right',
  },
});

export function PricingTable({
  mode,
  precioUf,
  totalHours,
  formaPago,
  fixedUf,
}: PricingTableProps) {
  const totalUf =
    mode === 'fixed' && fixedUf != null
      ? fixedUf
      : precioUf * totalHours;

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>Propuesta Económica</Text>
      <View style={styles.rule} />

      <Text style={styles.sectionLabel}>Desglose de Costos</Text>

      <View style={styles.table}>
        {/* Header */}
        <View style={[styles.tableRow, styles.tableHeader]}>
          <View style={styles.tableLabelCell}>
            <Text style={styles.headerText}>Concepto</Text>
          </View>
          <View style={styles.tableValueCell}>
            <Text style={[styles.headerText, { textAlign: 'right' }]}>Valor</Text>
          </View>
        </View>

        {/* Rows */}
        {mode === 'per_hour' ? (
          <>
            <View style={styles.tableRow}>
              <View style={styles.tableLabelCell}>
                <Text style={styles.labelText}>Precio por hora</Text>
              </View>
              <View style={styles.tableValueCell}>
                <Text style={styles.valueText}>{precioUf.toFixed(2)} UF</Text>
              </View>
            </View>
            <View style={[styles.tableRow, styles.tableRowAlt]}>
              <View style={styles.tableLabelCell}>
                <Text style={styles.labelText}>Total de horas</Text>
              </View>
              <View style={styles.tableValueCell}>
                <Text style={styles.valueText}>{totalHours} hrs</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.tableRow}>
            <View style={styles.tableLabelCell}>
              <Text style={styles.labelText}>Precio fijo del programa</Text>
            </View>
            <View style={styles.tableValueCell}>
              <Text style={styles.valueText}>
                {(fixedUf ?? totalUf).toFixed(2)} UF
              </Text>
            </View>
          </View>
        )}

        {/* Total row */}
        <View style={[styles.tableRow, styles.totalRow]}>
          <View style={styles.tableLabelCell}>
            <Text style={styles.totalLabelText}>TOTAL PROGRAMA</Text>
          </View>
          <View style={styles.tableValueCell}>
            <Text style={styles.totalValueText}>{totalUf.toFixed(2)} UF</Text>
          </View>
        </View>
      </View>

      {/* Payment terms */}
      <View style={styles.paymentRow}>
        <Text style={styles.paymentLabel}>Forma de pago:</Text>
        <Text style={styles.paymentValue}>{formaPago}</Text>
      </View>

      <View style={styles.spacer} />

      {/* Signature block */}
      <View style={styles.signatureBlock}>
        <View>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureName}>Arnoldo Cisternas Chávez</Text>
          <Text style={styles.signatureTitle}>Representante Legal</Text>
          <Text style={styles.signatureTitle}>
            FNE — Fundación Nacional de Educación
          </Text>
        </View>
        <View style={styles.contactBlock}>
          <Text style={styles.contactText}>www.nuevaeducacion.cl</Text>
          <Text style={styles.contactText}>contacto@nuevaeducacion.cl</Text>
          <Text style={styles.contactText}>Fundación Nacional de Educación</Text>
        </View>
      </View>
    </Page>
  );
}
