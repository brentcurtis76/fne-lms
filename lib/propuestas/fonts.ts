import { Font } from '@react-pdf/renderer';
import path from 'path';

const FONTS_DIR = path.join(process.cwd(), 'lib/propuestas/assets/fonts');

Font.register({
  family: 'Inter',
  fonts: [
    {
      src: path.join(FONTS_DIR, 'Inter-Regular.ttf'),
      fontWeight: 'normal',
    },
    {
      src: path.join(FONTS_DIR, 'Inter-Bold.ttf'),
      fontWeight: 'bold',
    },
    {
      src: path.join(FONTS_DIR, 'Inter-ExtraBold.ttf'),
      fontWeight: 800,
    },
    {
      src: path.join(FONTS_DIR, 'Inter-MediumItalic.ttf'),
      fontWeight: 500,
      fontStyle: 'italic',
    },
  ],
});
