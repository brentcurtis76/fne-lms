import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// TYPE EXPORTS
// ============================================================

export interface TranscriptionResult {
  transcript: string;
  duration_seconds: number | null;
}

export interface ReportSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

export interface AudioProcessingResult {
  transcription: TranscriptionResult;
  report: ReportSummary;
}

// ============================================================
// CONSTANTS
// ============================================================

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB - OpenAI Whisper limit

// ============================================================
// TRANSCRIPTION FUNCTION
// ============================================================

/**
 * Transcribe audio using OpenAI Whisper API
 * @param audioBuffer Audio file buffer
 * @param fileName Original file name (needed for format detection)
 * @returns Transcript text
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY no está configurada en las variables de entorno');
  }

  // Validate file size
  if (audioBuffer.length > MAX_AUDIO_SIZE) {
    throw new Error(
      `El archivo de audio excede el límite de 25 MB (tamaño actual: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB)`
    );
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create a File object from the buffer
    const uint8 = new Uint8Array(audioBuffer);
    const audioFile = new File([uint8], fileName, {
      type: getAudioMimeType(fileName),
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'es', // Chilean Spanish
      response_format: 'text',
    });

    if (!transcription || typeof transcription !== 'string') {
      throw new Error('La transcripción no devolvió texto válido');
    }

    return transcription;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error en transcripción de audio:', error.message);
      throw new Error(`Error al transcribir el audio: ${error.message}`);
    }
    throw new Error('Error desconocido al transcribir el audio');
  }
}

// ============================================================
// AI SUMMARY FUNCTION
// ============================================================

/**
 * Generate structured summary from transcript using Claude
 * @param transcript Raw transcript text
 * @param sessionContext Session metadata for relevance
 * @returns Structured report summary
 */
export async function generateReportSummary(
  transcript: string,
  sessionContext: {
    title: string;
    date: string;
    school: string;
    gc: string;
    objectives: string | null;
  }
): Promise<ReportSummary> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY no está configurada - usando transcripción sin procesar');
    // Graceful degradation: return raw transcript as summary
    return {
      summary: transcript,
      keyPoints: [],
      actionItems: [],
    };
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const modelId = process.env.ANTHROPIC_MODEL_ID || 'claude-sonnet-4-6';

    const systemPrompt = `Eres un asistente experto en resumir sesiones de consultoría educativa en Chile. Tu tarea es analizar la transcripción de una sesión y generar un informe estructurado en español profesional.

CONTEXTO DE LA SESIÓN:
- Título: ${sessionContext.title}
- Fecha: ${sessionContext.date}
- Escuela: ${sessionContext.school}
- Comunidad de Crecimiento: ${sessionContext.gc}
${sessionContext.objectives ? `- Objetivos: ${sessionContext.objectives}` : ''}

INSTRUCCIONES:
1. Resume la sesión en máximo 500 palabras, enfocándote en los puntos clave y resultados
2. Identifica 3-7 puntos clave de discusión (keyPoints)
3. Extrae cualquier acción concreta o seguimiento mencionado (actionItems)
4. Usa un tono profesional pero accesible
5. Escribe en español con acentos correctos
6. Estructura el resumen con claridad

FORMATO DE RESPUESTA:
Responde SOLO con un objeto JSON válido con esta estructura exacta:
{
  "summary": "Resumen completo de la sesión...",
  "keyPoints": ["Punto clave 1", "Punto clave 2", ...],
  "actionItems": ["Acción 1", "Acción 2", ...]
}

Si no hay acciones concretas, usa un array vacío para actionItems.`;

    const message = await anthropic.messages.create({
      model: modelId,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: `Analiza esta transcripción de sesión y genera un informe estructurado:\n\n${transcript}`,
        },
      ],
      system: systemPrompt,
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Respuesta de Claude no es de tipo texto');
    }

    const responseText = responseContent.text.trim();

    // Parse JSON response
    let parsedResponse: ReportSummary;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Error al parsear respuesta de Claude:', parseError);
      console.error('Respuesta recibida:', responseText);
      // Graceful degradation: use transcript as summary
      return {
        summary: transcript,
        keyPoints: [],
        actionItems: [],
      };
    }

    // Validate response structure
    if (
      !parsedResponse.summary ||
      !Array.isArray(parsedResponse.keyPoints) ||
      !Array.isArray(parsedResponse.actionItems)
    ) {
      console.error('Respuesta de Claude tiene estructura inválida:', parsedResponse);
      // Graceful degradation
      return {
        summary: transcript,
        keyPoints: [],
        actionItems: [],
      };
    }

    return parsedResponse;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error en generación de resumen:', error.message);
    }
    // Graceful degradation: return raw transcript
    return {
      summary: transcript,
      keyPoints: [],
      actionItems: [],
    };
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get MIME type from file extension
 */
function getAudioMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/x-m4a',
    mp4: 'audio/mp4',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
    aac: 'audio/aac',
  };
  return mimeTypes[ext || ''] || 'audio/mpeg';
}
