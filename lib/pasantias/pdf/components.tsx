/**
 * PDF building blocks shared by the Pasantías brochure and ficha.
 *
 * The house kit (`lib/propuestas/*`) supplies the palette, the registered Inter
 * faces and the light/dark section pages; it is imported, never edited. What
 * lives here is only what the kit has no equivalent for: the Pasantías cover,
 * the two list shapes the content brief needs (numbered objectives, bulleted
 * inclusions), a label/value row for the investment table, and the contact block
 * that carries the controller identity.
 *
 * No cohort facts and no prices: every component takes what it renders as a
 * prop, so this module is safe for both documents to import.
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import path from 'path';
import { COLORS, FONTS } from '../../propuestas/styles';
import '../../propuestas/fonts';

const LOGOS_DIR = path.join(process.cwd(), 'public', 'logos');
const FNE_LOGO_GOLD = path.join(LOGOS_DIR, 'fne-logo-gold.png');
const FNE_LOGO_BW = path.join(LOGOS_DIR, 'fne-logo-bw.png');

/** Shown on every cover and in the brochure footer — the FNE house line. */
export const FNE_TAGLINE =
  'La educación nueva se levanta sobre una nueva cultura relacional';

const styles = StyleSheet.create({
  coverLogo: {
    width: 110,
    height: 80,
    objectFit: 'contain',
    marginBottom: 48,
  },
  goldRule: {
    height: 2,
    backgroundColor: COLORS.gold,
    width: 60,
    marginBottom: 20,
  },
  eyebrow: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  coverTitle: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 800,
    fontSize: 34,
    lineHeight: 1.15,
    marginBottom: 16,
    maxWidth: 420,
  },
  coverSubtitle: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 13,
    lineHeight: 1.5,
    opacity: 0.9,
    marginBottom: 6,
    maxWidth: 400,
  },
  coverContent: {
    flexGrow: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  coverBottom: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gold,
    borderTopStyle: 'solid',
    paddingTop: 14,
  },
  claimRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  claim: {
    color: COLORS.gold,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  coverTagline: {
    color: COLORS.white,
    fontFamily: FONTS.family,
    fontWeight: 500,
    fontStyle: 'italic',
    fontSize: 8.5,
    opacity: 0.75,
    maxWidth: 340,
    lineHeight: 1.5,
  },

  mastheadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gold,
    borderBottomStyle: 'solid',
    paddingBottom: 10,
    marginBottom: 14,
  },
  mastheadEyebrow: {
    color: COLORS.orange,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  mastheadTitle: {
    color: COLORS.nearBlack,
    fontFamily: FONTS.family,
    fontWeight: 800,
    fontSize: 21,
    lineHeight: 1.2,
    marginBottom: 4,
  },
  mastheadSubtitle: {
    color: COLORS.grayMedium,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.4,
  },
  mastheadLogo: {
    width: 58,
    height: 44,
    objectFit: 'contain',
  },

  listItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  marker: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 9.5,
    lineHeight: 1.55,
    width: 18,
  },
  listText: {
    flex: 1,
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 9.5,
    lineHeight: 1.55,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    paddingBottom: 7,
    marginBottom: 7,
    gap: 16,
  },
  rowTerm: {
    flex: 1,
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 10.5,
    lineHeight: 1.4,
  },
  rowValue: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10.5,
    lineHeight: 1.4,
    textAlign: 'right',
    // Wide enough for the longest value either document renders — the payment
    // terms — on a single line, so no row ends with an orphaned right-aligned
    // fragment.
    maxWidth: 340,
  },

  contactBlock: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    paddingTop: 12,
    marginTop: 6,
  },
  contactLine: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 3,
  },
  contactStrong: {
    fontFamily: FONTS.family,
    fontWeight: 'bold',
    fontSize: 11,
    lineHeight: 1.5,
    marginBottom: 5,
  },
  legalLine: {
    fontFamily: FONTS.family,
    fontWeight: 'normal',
    fontSize: 8,
    lineHeight: 1.5,
    marginTop: 8,
  },
});

/**
 * Dark cover page content. The caller supplies the `<Page>`; this is what goes
 * inside it, so the brochure and the ficha can use different page paddings.
 */
export function CoverContent({
  eyebrow,
  title,
  subtitles,
  claims,
}: {
  eyebrow: string;
  title: string;
  subtitles: readonly string[];
  claims?: readonly string[];
}) {
  return (
    <>
      <Image src={FNE_LOGO_GOLD} style={styles.coverLogo} />

      <View style={styles.coverContent}>
        <View style={styles.goldRule} />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.coverTitle}>{title}</Text>
        {subtitles.map((line) => (
          <Text key={line} style={styles.coverSubtitle}>
            {line}
          </Text>
        ))}
      </View>

      <View style={styles.coverBottom}>
        {claims && claims.length > 0 && (
          <View style={styles.claimRow}>
            {claims.map((claim) => (
              <Text key={claim} style={styles.claim}>
                {claim}
              </Text>
            ))}
          </View>
        )}
        <Text style={styles.coverTagline}>{FNE_TAGLINE}</Text>
      </View>
    </>
  );
}

/** Compact light-page header — the ficha has no room for a full cover. */
export function Masthead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.mastheadRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.mastheadEyebrow}>{eyebrow}</Text>
        <Text style={styles.mastheadTitle}>{title}</Text>
        <Text style={styles.mastheadSubtitle}>{subtitle}</Text>
      </View>
      <Image src={FNE_LOGO_BW} style={styles.mastheadLogo} />
    </View>
  );
}

/** Numbered list — the thirteen objectives keep their brief numbering. */
export function Numbered({
  items,
  color = COLORS.nearBlack,
  markerColor = COLORS.orange,
}: {
  items: readonly string[];
  color?: string;
  markerColor?: string;
}) {
  return (
    <>
      {items.map((item, index) => (
        <View key={item} style={styles.listItem} wrap={false}>
          <Text style={{ ...styles.marker, color: markerColor }}>{`${index + 1}.`}</Text>
          <Text style={{ ...styles.listText, color }}>{item}</Text>
        </View>
      ))}
    </>
  );
}

/** Bulleted list. */
export function Bullets({
  items,
  color = COLORS.nearBlack,
  markerColor = COLORS.orange,
}: {
  items: readonly string[];
  color?: string;
  markerColor?: string;
}) {
  return (
    <>
      {items.map((item) => (
        <View key={item} style={styles.listItem} wrap={false}>
          <Text style={{ ...styles.marker, color: markerColor }}>•</Text>
          <Text style={{ ...styles.listText, color }}>{item}</Text>
        </View>
      ))}
    </>
  );
}

/** Label on the left, value right-aligned — the investment and calendar tables. */
export function Row({
  term,
  value,
  color = COLORS.nearBlack,
  ruleColor = COLORS.lightGray,
}: {
  term: string;
  value: string;
  color?: string;
  ruleColor?: string;
}) {
  return (
    <View style={{ ...styles.row, borderBottomColor: ruleColor }} wrap={false}>
      <Text style={{ ...styles.rowTerm, color }}>{term}</Text>
      <Text style={{ ...styles.rowValue, color }}>{value}</Text>
    </View>
  );
}

/**
 * Contact block. Appendix A-10 requires the controller to be identifiable, so
 * the brand name never appears without the legal name, RUT and postal address.
 */
export function ContactBlock({
  identity,
  webUrl,
  whatsapp,
  color = COLORS.nearBlack,
  mutedColor = COLORS.grayMedium,
  ruleColor = COLORS.lightGray,
}: {
  identity: {
    brandName: string;
    legalName: string;
    taxId: string;
    streetAddress: string;
    city: string;
    country: string;
    contactEmail: string;
  };
  webUrl: string;
  whatsapp: string;
  color?: string;
  mutedColor?: string;
  ruleColor?: string;
}) {
  return (
    <View style={{ ...styles.contactBlock, borderTopColor: ruleColor }}>
      <Text style={{ ...styles.contactStrong, color }}>{identity.brandName}</Text>
      <Text style={{ ...styles.contactLine, color }}>{`Correo: ${identity.contactEmail}`}</Text>
      <Text style={{ ...styles.contactLine, color }}>{`WhatsApp: ${whatsapp}`}</Text>
      <Text style={{ ...styles.contactLine, color }}>{`Web: ${webUrl}`}</Text>
      <Text style={{ ...styles.legalLine, color: mutedColor }}>
        {`${identity.legalName} · ${identity.taxId} · ${identity.streetAddress}, ${identity.city}, ${identity.country}`}
      </Text>
    </View>
  );
}
