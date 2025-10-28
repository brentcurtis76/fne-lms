import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { parsePersonalizacionMD, getFlattenedSections } from '@/utils/parsePersonalizacionQuestions';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const filePath = path.join(process.cwd(), 'PERSONALIZACIÓN.MD');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const questions = parsePersonalizacionMD(fileContent);
    const flattened = getFlattenedSections(questions);

    return res.status(200).json({
      acciones: questions.acciones,
      totalSections: questions.totalSections,
      flattened,
    });
  } catch (error) {
    console.error('Error parsing personalizacion questions:', error);
    return res.status(500).json({ error: 'Error al cargar preguntas' });
  }
}
