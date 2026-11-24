/**
 * The sample email for the preview: one text block (title, bold, a link, bullets), one picture, one button.
 * Neutral wording that names no brand. The links point at the site's own base address and the picture is
 * one the host names, so the sample points nowhere outside the host.
 */
import type { EmailContent } from './types';

export function sampleContent(options: { baseUrl: string; pictureUrl: string }): EmailContent {
  const base = options.baseUrl.replace(/\/+$/, '');
  return {
    subject: 'Novedades de este mes',
    previewLine: 'Un resumen breve de lo que viene: actividades, materiales y fechas.',
    blocks: [
      {
        kind: 'text',
        title: 'Hola, estas son las novedades del mes',
        body: [
          'Este mes preparamos **tres actividades nuevas** para acompañar el trabajo en el aula.',
          '',
          '- Un taller breve sobre evaluación formativa.',
          '- Una guía con ejemplos para descargar.',
          '- Una sesión abierta de preguntas.',
          '',
          `Puedes revisar el calendario completo en [nuestra página](${base}/).`,
        ].join('\n'),
      },
      {
        kind: 'picture',
        url: options.pictureUrl,
        description: 'Dibujo de líneas blancas: cinco personas trabajan juntas alrededor de una mesa redonda.',
      },
      {
        kind: 'button',
        label: 'Ver las actividades',
        link: `${base}/`,
      },
    ],
  };
}
