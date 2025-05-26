/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand_blue: '#00365b',
        brand_yellow: '#fdb933',
        brand_beige: '#e8e5e2',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Segoe UI Symbol"', '"Noto Color Emoji"'],
        mont: ['Mont', 'sans-serif'], // Kept for now, but new UI should use default sans
        eames: ['Eames Century Modern', 'serif'], // Kept for now, but new UI should use default sans
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}