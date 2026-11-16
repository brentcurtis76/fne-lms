/** @type {import('tailwindcss').Config} */

// A colour whose value lives in `styles/fne-tokens.css` as an RGB triplet.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;
// One of Tailwind's stock colour families, every step read from the token file.
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const family = (name) => Object.fromEntries(STEPS.map((step) => [step, token(`${name}-${step}`)]));
// The platform's other hand-typed colours (phase 4b), each named by its own six hex digits: `bg-legacy-002844`
// reads `--color-legacy-002844`, which holds exactly #002844. ONE list; `styles/fne-tokens.css` declares each once.
const LEGACY = [
  '00243a', '002844', '00293f', '002a47', '002a4a', '003a5b', '004080', '004170', '004a7a', '004a7c',
  '0066a4', '06b6d4', '10b981', '6366f1', '8b5cf6', '8b6914', 'b8860b', 'e0f0ff', 'e6a429', 'e6a42d',
  'e6a42e', 'e6a530', 'e8e5e2', 'ea580c', 'ec4899', 'ef4044', 'f5a623', 'f5b927', 'f97316', 'fca311',
];

module.exports = {
  // Every folder that holds class names. src/, lib/, types/, config/ and utils/ joined in the redesign's groundwork
  // (phase 3): before that, a class written only there was silently never generated.
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './types/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // The platform's colours are VALUES IN ONE PLACE: `styles/fne-tokens.css` declares
        // each as an RGB triplet and this file only names it (platform redesign, phase 4a).
        // `<alpha-value>` is Tailwind's placeholder for the opacity, which is what keeps
        // every `bg-brand_primary/40`-style modifier working. Today's values are exactly
        // the ones written here before; `__tests__/styles/brand-tokens.test.ts` pins that.
        //
        // Legacy names (kept for backward compatibility during transition)
        brand_blue: token('brand-primary'),     // Was #00365b, now maps to brand_primary
        brand_yellow: token('brand-accent'),    // Was #fdb933, now maps to brand_accent
        brand_beige: token('brand-light'),      // Was #e8e5e2, now maps to brand_light
        // Genera Brand Colors
        brand_primary: token('brand-primary'),            // Black - Primary brand color
        brand_accent: token('brand-accent'),              // Yellow - Primary accent
        brand_accent_hover: token('brand-accent-hover'),  // Intense Yellow - Hover states
        brand_accent_light: token('brand-accent-light'),  // Light Yellow - Highlights
        // Amber that is legible as TEXT on white. brand_accent (#fbbf24) and
        // brand_accent_hover (#f59e0b) are surface/hover colours: on white they
        // measure 1.66:1 and 2.14:1, well under the 4.5:1 WCAG AA needs at body
        // size, so neither may carry small text on a light background. This one
        // measures 5.02:1 on #ffffff and keeps the accent role.
        brand_accent_text: token('brand-accent-text'),    // Amber 700 - accent text on light bg
        brand_light: token('brand-light'),                // White - Backgrounds
        brand_gray_dark: token('brand-gray-dark'),        // Dark Gray - Secondary text
        brand_gray_medium: token('brand-gray-medium'),    // Medium Gray - Tertiary text
        // Gold gradient stops (brand manual, dic 2025). Whole colours, not triplets:
        // `styles/fne-tokens.css` declares them once and this reads them.
        brand_gold_light: 'var(--fne-gold-light)',
        brand_gold_dark: 'var(--fne-gold-dark)',
        // The stock families the platform uses most, every step of each. Their values
        // in the token file are Tailwind's own defaults, so nothing changes on screen.
        // (Tailwind's typography plugin, `prose`, takes its greys from Tailwind's
        // palette directly and does not read these.)
        gray: family('gray'),
        yellow: family('yellow'),
        amber: family('amber'),
        red: family('red'),
        green: family('green'),
        blue: family('blue'),
        // Hand-typed colours that are neither the brand kit nor a step above (phase 4b).
        legacy: Object.fromEntries(LEGACY.map((hex) => [hex, token(`legacy-${hex}`)])),
      },
      ringColor: {
        // The colour of a `ring` that names none (most focus rings): Tailwind's default,
        // blue 500 at half strength. It has to be written out: Tailwind works this default
        // out from the plain colour, cannot do so from `<alpha-value>`, and would silently
        // fall back to a lighter blue. Plain text, so `theme(ringColor.DEFAULT)` works too.
        DEFAULT: 'rgb(var(--color-blue-500) / 0.5)',
      },
      backgroundImage: {
        // The manual's filete dorado under section titles: 135°, #FDB833 → #B47410.
        'gold-gradient': 'var(--fne-gold-gradient)',
      },
      fontFamily: {
        // Each list of faces is declared in `styles/fne-tokens.css`.
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
        mont: ['var(--font-mont)'], // Kept for now, but new UI should use default sans
        eames: ['var(--font-eames)'], // Kept for now, but new UI should use default sans
      },
      borderRadius: {
        // The `rounded-*` steps, declared in `styles/fne-tokens.css` (Tailwind's defaults
        // today). `rounded-none` and `rounded-full` stay Tailwind's own.
        sm: 'var(--rounded-sm)',
        DEFAULT: 'var(--rounded)',
        md: 'var(--rounded-md)',
        lg: 'var(--rounded-lg)',
        xl: 'var(--rounded-xl)',
        '2xl': 'var(--rounded-2xl)',
        '3xl': 'var(--rounded-3xl)',
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