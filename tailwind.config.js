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
        brand_light: '#ffffff',         // White - Backgrounds
        brand_gray_dark: '#1f1f1f',     // Dark Gray - Secondary text
        brand_gray_medium: '#6b7280',   // Medium Gray - Tertiary text
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