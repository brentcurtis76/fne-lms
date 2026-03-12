import { describe, it, expect } from 'vitest';
import React from 'react';
import { Document, Page, View, Text, renderToBuffer } from '@react-pdf/renderer';
import path from 'path';
import fs from 'fs';
import { CoverPage } from '../components/CoverPage';
import { DarkSection, DarkBody } from '../components/DarkSection';
import { ConsultantCard } from '../components/ConsultantCard';
import { COLORS, FONTS } from '../styles';
import '../fonts';

const OUTPUT_PATH = path.join(
  process.cwd(),
  'lib/propuestas/__tests__/poc-output.pdf'
);

describe('Phase 2a PoC — PDF generation', () => {
  it('generates a valid PDF with CoverPage, DarkSection, and ConsultantCards', async () => {
    const doc = React.createElement(
      Document,
      { title: 'PoC — Asesoría Integral William Taylor 2026' },

      // Page 1: Cover
      React.createElement(CoverPage, {
        programYear: 2026,
        serviceName:
          'Asesoría Integral para Desarrollar una Cultura de Innovación Educativa Centrada en el Aprendizaje',
        schoolName: 'Liceo Bicentenario William Taylor',
      }),

      // Page 2: Dark section
      React.createElement(
        DarkSection,
        { heading: 'Modelo de Educación Relacional', showLogo: true },
        React.createElement(
          DarkBody,
          null,
          'La Educación Relacional es un enfoque pedagógico que sitúa las relaciones humanas en el centro del proceso educativo. A diferencia de los modelos tradicionales centrados en la transmisión de contenidos, el Modelo Relacional comprende que el aprendizaje profundo emerge de vínculos seguros, comunidades de pertenencia y culturas escolares que priorizan el bienestar de cada persona.'
        ),
        React.createElement(
          DarkBody,
          null,
          'Desde este enfoque, FNE acompaña a los equipos directivos y docentes en un proceso de transformación cultural, desarrollando capacidades relacionales que sostienen comunidades de aprendizaje efectivas y comprometidas con la mejora continua.'
        ),
        React.createElement(
          DarkBody,
          null,
          'El programa articula tres dimensiones: (1) Liderazgo relacional y distribuido, (2) Cultura de colaboración y confianza, y (3) Aprendizaje basado en proyectos con sentido colectivo. Cada dimensión es abordada de manera integrada a lo largo de las jornadas presenciales, las sesiones de acompañamiento y las actividades asincrónicas.'
        )
      ),

      // Page 3: Consultant cards
      React.createElement(
        Page,
        {
          size: 'A4',
          style: {
            backgroundColor: COLORS.darkCharcoal,
            padding: 40,
            fontFamily: FONTS.family,
          },
        },
        React.createElement(
          View,
          { style: { marginBottom: 20 } },
          React.createElement(Text, {
            style: {
              color: COLORS.gold,
              fontFamily: FONTS.family,
              fontWeight: 'bold',
              fontSize: 18,
              marginBottom: 4,
            },
          }, 'Equipo Consultor'),
          React.createElement(View, {
            style: {
              width: 40,
              height: 2,
              backgroundColor: COLORS.orange,
            },
          })
        ),
        React.createElement(
          View,
          { style: { flexDirection: 'row', gap: 12, flexGrow: 1 } },
          React.createElement(ConsultantCard, {
            nombre: 'Arnoldo Cisternas Chávez',
            titulo: 'Director del Programa y Asesor Directivo',
            bio: 'Psicólogo organizacional y Doctor en Ciencias de la Gestión (ESADE, Barcelona). Director del Instituto Relacional. Especialista en gestión del cambio, liderazgo educativo y metodologías relacionales.',
          }),
          React.createElement(ConsultantCard, {
            nombre: 'María Gabriela Naranjo Armas',
            titulo: 'Directora de la FNE — IR Chile',
            bio: 'Psicóloga con formación en Psicoterapia Corporal (IIBS, Suiza). Directora de la Fundación Nueva Educación. Especialista en coaching ejecutivo y desarrollo de liderazgo en contextos educativos.',
          }),
          React.createElement(ConsultantCard, {
            nombre: 'Ignacio Andrés Pavez Barrio',
            titulo: 'Director de Investigación',
            bio: 'Ingeniero Civil con PhD en Comportamiento Organizacional (Case Western Reserve University). Co-creador del modelo IDeIA. Especialista en investigación-acción y comunidades de aprendizaje.',
          })
        )
      )
    );

    const buffer = await renderToBuffer(doc);

    // Write for visual inspection
    fs.writeFileSync(OUTPUT_PATH, buffer);

    expect(buffer.length).toBeGreaterThan(0);
    // PDF magic bytes
    const header = buffer.toString('ascii', 0, 5);
    expect(header).toBe('%PDF-');
  }, 30000);
});
