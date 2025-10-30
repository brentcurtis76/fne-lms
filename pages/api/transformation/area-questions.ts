/**
 * Dynamic API endpoint for área-specific transformation questions
 * Supports: personalizacion (44 sections), aprendizaje (68 sections)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { parsePersonalizacionMD } from '@/utils/parsePersonalizacionQuestions';
import { parseAprendizajeMD } from '@/utils/parseAprendizajeQuestions';
import { getFlattenedSections as getFlatPersonalizacion } from '@/utils/parsePersonalizacionQuestions';
import { getFlattenedSections as getFlatAprendizaje } from '@/utils/parseAprendizajeQuestions';

const VALID_AREAS = ['personalizacion', 'aprendizaje'] as const;
type ValidArea = typeof VALID_AREAS[number];

interface AreaConfig {
  fileName: string;
  parser: (content: string) => { acciones: any[]; totalSections: number };
  flattener: (data: any) => any[];
}

const AREA_CONFIGS: Record<ValidArea, AreaConfig> = {
  personalizacion: {
    fileName: 'public/data/PERSONALIZACION.md',
    parser: parsePersonalizacionMD,
    flattener: getFlatPersonalizacion,
  },
  aprendizaje: {
    fileName: 'public/data/PROGRESION-APRENDIZAJE.md',
    parser: parseAprendizajeMD,
    flattener: getFlatAprendizaje,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Validate área parameter
    const { area } = req.query;

    if (!area || typeof area !== 'string') {
      return res.status(400).json({
        error: 'Parámetro "area" requerido',
        validAreas: VALID_AREAS,
      });
    }

    if (!VALID_AREAS.includes(area as ValidArea)) {
      return res.status(400).json({
        error: `Área no válida: "${area}"`,
        validAreas: VALID_AREAS,
      });
    }

    // Get configuration for this área
    const config = AREA_CONFIGS[area as ValidArea];

    // Read and parse the markdown file
    const filePath = path.join(process.cwd(), config.fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(500).json({
        error: `Archivo no encontrado: ${config.fileName}`,
      });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Parse content using área-specific parser
    const questions = config.parser(fileContent);

    // Flatten sections for sequential display
    const flattened = config.flattener(questions);

    return res.status(200).json({
      area,
      acciones: questions.acciones,
      totalSections: questions.totalSections,
      flattened,
    });

  } catch (error) {
    console.error('Error parsing area questions:', error);

    // Return detailed error in development
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    const isDevelopment = process.env.NODE_ENV === 'development';

    return res.status(500).json({
      error: 'Error al cargar preguntas',
      ...(isDevelopment && { details: errorMessage }),
    });
  }
}
