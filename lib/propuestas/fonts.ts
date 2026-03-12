import { Font } from '@react-pdf/renderer';
import path from 'path';

// Browser-safe font paths: use public URL in browser, filesystem path on server
const isBrowser = typeof window !== 'undefined';
const FONTS_DIR = isBrowser ? null : path.join(process.cwd(), 'public', 'fonts');

function fontSrc(filename: string): string {
  return isBrowser
    ? `/fonts/${filename}`
    : path.join(FONTS_DIR!, filename);
}

// Disable hyphenation globally — Spanish words should not be broken mid-word
Font.registerHyphenationCallback((word) => [word]);

Font.register({
  family: 'Inter',
  fonts: [
    {
      src: fontSrc('Inter-Regular.ttf'),
      fontWeight: 'normal',
    },
    {
      src: fontSrc('Inter-Bold.ttf'),
      fontWeight: 'bold',
    },
    {
      src: fontSrc('Inter-ExtraBold.ttf'),
      fontWeight: 800,
    },
    {
      src: fontSrc('Inter-MediumItalic.ttf'),
      fontWeight: 500,
      fontStyle: 'italic',
    },
  ],
});
