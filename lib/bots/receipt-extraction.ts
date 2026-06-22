import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  Currency,
  ExpenseCategoryRow,
  ExtractionResult,
  NormalizedExtraction
} from './types';
import { safeTruncate } from './messages';

export const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MIN_CATEGORY_CONFIDENCE = 0; // guesses below are still shown, just never preselected

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

// One client per lambda instance — construction is not free and the key
// never changes within a process.
let defaultClient: Anthropic | null = null;

const confidenceSchema = z.number().min(0).max(1).catch(0);

const rawExtractionSchema = z.object({
  is_receipt: z.boolean(),
  vendor: z.string().nullable().catch(null),
  expense_date: z.string().nullable().catch(null),
  amount: z.number().nullable().catch(null),
  currency: z.enum(['CLP', 'USD', 'EUR', 'GBP']).nullable().catch(null),
  expense_number: z.string().nullable().catch(null),
  doc_type: z.enum(['boleta', 'factura', 'other']).nullable().catch(null),
  description: z.string().nullable().catch(null),
  category_guesses: z
    .array(z.object({ name: z.string(), confidence: confidenceSchema }))
    .catch([]),
  confidence: z
    .object({
      vendor: confidenceSchema,
      expense_date: confidenceSchema,
      amount: confidenceSchema,
      currency: confidenceSchema,
      expense_number: confidenceSchema
    })
    .catch({ vendor: 0, expense_date: 0, amount: 0, currency: 0, expense_number: 0 })
});

function buildSystemPrompt(categories: ExpenseCategoryRow[]): string {
  const categoryList = categories
    .map((c) => `- "${c.name}"${c.description ? `: ${c.description}` : ''}`)
    .join('\n');

  return `Eres un experto en lectura de documentos tributarios chilenos (boletas, boletas electrónicas, facturas electrónicas, vouchers de pago) y recibos extranjeros.

Analiza el documento adjunto y extrae sus datos. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código.

Formato de respuesta:
{
  "is_receipt": boolean,        // ¿es una boleta/factura/recibo de compra real?
  "vendor": string | null,      // nombre del comercio o emisor
  "expense_date": string | null,// fecha de emisión en formato ISO YYYY-MM-DD
  "amount": number | null,      // monto TOTAL final del documento (número, sin separadores)
  "currency": "CLP" | "USD" | "EUR" | "GBP" | null,
  "expense_number": string | null, // N° de boleta o factura
  "doc_type": "boleta" | "factura" | "other" | null,
  "description": string | null, // descripción breve del gasto en español (máx 60 caracteres)
  "category_guesses": [          // hasta 3 categorías, la más probable primero
    { "name": string, "confidence": number }
  ],
  "confidence": { "vendor": number, "expense_date": number, "amount": number, "currency": number, "expense_number": number }
}

Reglas importantes:
- Montos chilenos (CLP) son enteros: "$12.990" significa 12990 (el punto es separador de miles). Nunca interpretes el punto como decimal en CLP.
- Usa la línea "TOTAL" del documento (incluye IVA). Ignora "propina sugerida" salvo que esté sumada en el total.
- Fechas chilenas suelen venir como DD-MM-YYYY o DD/MM/YYYY: conviértelas a YYYY-MM-DD.
- Identifica la moneda por su símbolo o país: "£" o recibos del Reino Unido son GBP (libra esterlina); "€" es EUR; "US$" o "USD" es USD; "$" en un recibo chileno es CLP.
- Si la moneda no es claramente extranjera, asume CLP.
- El RUT del emisor suele aparecer arriba; el comercio es la razón social o nombre de fantasía.
- "name" en category_guesses debe ser EXACTAMENTE uno de estos nombres de categoría:
${categoryList}
- Todos los valores de confidence van de 0 a 1.
- Si la imagen no es un documento de compra (selfie, paisaje, captura de pantalla sin recibo), responde is_receipt=false e igualmente intenta extraer monto/fecha si existieran.`;
}

function normalizeDate(value: string | null): { date: string | null; penalize: boolean } {
  if (!value) return { date: null, penalize: false };
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { date: null, penalize: true };
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { date: null, penalize: true };
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (parsed.getTime() > today.getTime()) return { date: null, penalize: true };
  return { date: value, penalize: false };
}

/**
 * Reads a receipt photo or PDF with Claude vision and maps the result onto
 * the live category list. The prompt contains ONLY the document and category
 * names — never user identity (Ley 21.719 hygiene).
 */
export async function extractReceipt(
  input: { buffer: Buffer; mime: string; categories: ExpenseCategoryRow[] },
  client?: Anthropic
): Promise<ExtractionResult> {
  const { buffer, mime, categories } = input;

  const isPdf = mime === 'application/pdf';
  // No silent relabeling: an unsupported image type (bmp, tiff...) must not
  // be declared as JPEG to the API — reject it instead.
  const imageType = SUPPORTED_IMAGE_TYPES.includes(mime as SupportedImageType)
    ? (mime as SupportedImageType)
    : null;

  if (!isPdf && !imageType) return { ok: false, reason: 'unreadable' };
  if (isPdf && buffer.length > MAX_PDF_BYTES) return { ok: false, reason: 'unreadable' };
  if (!isPdf && buffer.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'unreadable' };

  const anthropic = client ?? (defaultClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
  const data = buffer.toString('base64');

  let responseText: string;
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      temperature: 0,
      system: buildSystemPrompt(categories),
      messages: [
        {
          role: 'user',
          content: [
            isPdf
              ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
              : { type: 'image' as const, source: { type: 'base64' as const, media_type: imageType as SupportedImageType, data } },
            { type: 'text' as const, text: 'Extrae los datos de este documento.' }
          ]
        }
      ]
    });
    const block = response.content.find((b) => b.type === 'text');
    responseText = block && block.type === 'text' ? block.text : '';
  } catch (error) {
    console.error('[Bot] Claude extraction failed:', error);
    return { ok: false, reason: 'api_error' };
  }

  const cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    console.error('[Bot] Extraction response was not valid JSON');
    return { ok: false, reason: 'unreadable' };
  }

  const parsed = rawExtractionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.error('[Bot] Extraction response failed schema validation:', parsed.error.message);
    return { ok: false, reason: 'unreadable' };
  }
  const raw = parsed.data;

  // --- post-validation: never trust the model ------------------------------
  const { date, penalize } = normalizeDate(raw.expense_date);
  const amount = raw.amount !== null && Number.isFinite(raw.amount) && raw.amount > 0
    ? Math.round(raw.amount * 100) / 100
    : null;
  const currency: Currency = raw.currency ?? 'CLP';

  const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
  const categoryGuesses = raw.category_guesses
    .map((guess) => {
      const match = categoryByName.get(guess.name.trim().toLowerCase());
      return match
        ? { categoryId: match.id, name: match.name, confidence: guess.confidence }
        : null;
    })
    .filter((g): g is NonNullable<typeof g> => g !== null && g.confidence >= MIN_CATEGORY_CONFIDENCE)
    .slice(0, 3);

  if (categoryGuesses.length === 0) {
    const otros = categories.find((c) => c.name.trim().toLowerCase() === 'otros');
    if (otros) categoryGuesses.push({ categoryId: otros.id, name: otros.name, confidence: 0 });
  }

  const receipt: NormalizedExtraction = {
    isReceipt: raw.is_receipt,
    vendor: raw.vendor?.trim() || null,
    expenseDate: date,
    amount,
    currency,
    expenseNumber: raw.expense_number?.trim() || null,
    docType: raw.doc_type,
    description: raw.description ? safeTruncate(raw.description.trim(), 100) || null : null,
    categoryGuesses,
    fieldConfidence: {
      vendor: raw.confidence.vendor ?? 0,
      expense_date: penalize ? 0 : raw.confidence.expense_date ?? 0,
      amount: amount === null ? 0 : raw.confidence.amount ?? 0,
      currency: raw.confidence.currency ?? 0,
      expense_number: raw.confidence.expense_number ?? 0
    }
  };

  return { ok: true, receipt };
}
