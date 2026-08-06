/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy colors (kept for backward compatibility during transition)
        brand_blue: '#0a0a0a',      // Was #00365b, now maps to brand_primary
        brand_yellow: '#fbbf24',    // Was #fdb933, now maps to brand_accent
        brand_beige: '#ffffff',     // Was #e8e5e2, now maps to brand_light
        // Genera Brand Colors
        brand_primary: '#0a0a0a',       // Black - Primary brand color
        brand_accent: '#fbbf24',        // Yellow - Primary accent
        brand_accent_hover: '#f59e0b',  // Intense Yellow - Hover states
        brand_accent_light: '#fcd34d',  // Light Yellow - Highlights
        // Amber that is legible as TEXT on white. brand_accent (#fbbf24) and
        // brand_accent_hover (#f59e0b) are surface/hover colours: on white they
        // measure 1.66:1 and 2.14:1, well under the 4.5:1 WCAG AA needs at body
        // size, so neither may carry small text on a light background. This one
        // measures 5.02:1 on #ffffff and keeps the accent role.
        brand_accent_text: '#b45309',   // Amber 700 - accent text on light bg
        brand_light: '#ffffff',         // White - Backgrounds
        brand_gray_dark: '#1f1f1f',     // Dark Gray - Secondary text
        brand_gray_medium: '#6b7280',   // Medium Gray - Tertiary text
        // Gold gradient stops (brand manual, dic 2025). NEW in A6r: they have no
        // legacy entry here, so `styles/fne-tokens.css` declares the values once
        // and this reads them — one source, nothing to drift. The palette above
        // keeps its literals because rewriting it as var() would break every
        // existing `bg-brand_*/40` opacity modifier across the app; the two
        // files are pinned to each other by `__tests__/styles/brand-tokens.test.ts`.
        brand_gold_light: 'var(--fne-gold-light)',
        brand_gold_dark: 'var(--fne-gold-dark)',
      },
      backgroundImage: {
        // The manual's filete dorado under section titles: 135°, #FDB833 → #B47410.
        'gold-gradient': 'var(--fne-gold-gradient)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
        mont: ['Mont', 'sans-serif'], // Kept for now, but new UI should use default sans
        eames: ['Eames Century Modern', 'serif'], // Kept for now, but new UI should use default sans
      },
      keyframes: {
        fadeIn: {
          from: {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}