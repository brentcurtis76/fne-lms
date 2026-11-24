// Invented brands and content for the kit's tests. No real organisation, person or address.
import type { Brand, EmailContent } from '../types';

export const AURORA: Brand = {
  name: 'Colegio Aurora',
  logo: {
    url: 'https://aurora.example.test/marca/logo-aurora.png',
    description: 'Logo del Colegio Aurora',
    width: 160,
    height: 48,
  },
  accentColor: '#1a7f5a',
  onAccentColor: '#fffaf0',
  textColor: '#2b2118',
  mutedTextColor: '#7a6a58',
  pageBackgroundColor: '#efe9df',
  sheetBackgroundColor: '#fffdf8',
  ruleColor: '#d8cfc0',
  fontStack: 'Georgia, "Times New Roman", serif',
  footerLines: ['Corporación Educacional Aurora', 'Línea de prueba: dirección inventada'],
  sender: { name: 'Boletín Aurora', address: 'boletin@aurora.example.test' },
  replyTo: 'respuestas@aurora.example.test',
  language: 'es',
};

export const BOREAL: Brand = {
  name: 'Instituto Boreal',
  logo: {
    url: 'https://boreal.correos-prueba.invalid/img/boreal-mark.png',
    description: 'Marca del Instituto Boreal',
    width: 120,
    height: 40,
  },
  accentColor: '#5b2a86',
  onAccentColor: '#f0f8ff',
  textColor: '#101a2c',
  mutedTextColor: '#5a6b85',
  pageBackgroundColor: '#e6ecf5',
  sheetBackgroundColor: '#fbfdff',
  ruleColor: '#c9d3e3',
  fontStack: 'Verdana, Tahoma, sans-serif',
  footerLines: ['Fundación Educativa Boreal Limitada', 'Otra línea inventada'],
  sender: { name: 'Noticias Boreal', address: 'noticias@boreal.correos-prueba.invalid' },
  language: 'en',
};

/** The sample shape of L1: one text block with a title, one picture, one button. */
export const SAMPLE: EmailContent = {
  subject: 'Asunto de prueba',
  previewLine: 'Una línea de vista previa inventada.',
  blocks: [
    {
      kind: 'text',
      title: 'Un título de prueba',
      body: 'Texto con **negrita** y un [enlace](https://example.test/enlace).\n\n- Primer punto\n- Segundo punto',
    },
    { kind: 'picture', url: 'https://example.test/foto.png', description: 'Una foto inventada' },
    { kind: 'button', label: 'Pulsar aquí', link: 'https://example.test/boton' },
  ],
};
