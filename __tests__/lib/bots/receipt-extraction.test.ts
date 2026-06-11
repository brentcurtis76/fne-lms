// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { extractReceipt, MAX_IMAGE_BYTES } from '../../../lib/bots/receipt-extraction';
import type { ExpenseCategoryRow } from '../../../lib/bots/types';
import type Anthropic from '@anthropic-ai/sdk';

const CATEGORIES: ExpenseCategoryRow[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Alimentación', description: 'Comidas' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Transporte', description: 'Movilización' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Otros', description: 'Varios' }
];

function makeClient(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }]
      })
    }
  } as unknown as Anthropic;
}

const goodResponse = {
  is_receipt: true,
  vendor: 'Líder Express',
  expense_date: '2026-06-05',
  amount: 12990,
  currency: 'CLP',
  expense_number: '158291',
  doc_type: 'boleta',
  description: 'Almuerzo equipo',
  category_guesses: [
    { name: 'Alimentación', confidence: 0.92 },
    { name: 'Otros', confidence: 0.05 }
  ],
  confidence: { vendor: 0.9, expense_date: 0.95, amount: 0.97, currency: 0.99, expense_number: 0.8 }
};

const input = (client: Anthropic, overrides: Partial<{ buffer: Buffer; mime: string }> = {}) =>
  extractReceipt(
    {
      buffer: overrides.buffer ?? Buffer.from('fake-image'),
      mime: overrides.mime ?? 'image/jpeg',
      categories: CATEGORIES
    },
    client
  );

describe('extractReceipt', () => {
  it('parses a clean JSON response and maps categories to ids', async () => {
    const result = await input(makeClient(JSON.stringify(goodResponse)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.vendor).toBe('Líder Express');
      expect(result.receipt.amount).toBe(12990);
      expect(result.receipt.categoryGuesses[0]).toMatchObject({
        categoryId: CATEGORIES[0].id,
        name: 'Alimentación'
      });
    }
  });

  it('strips markdown fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(goodResponse) + '\n```';
    const result = await input(makeClient(fenced));
    expect(result.ok).toBe(true);
  });

  it('returns unreadable on non-JSON output', async () => {
    const result = await input(makeClient('lo siento, no puedo leer esto'));
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('drops hallucinated categories and falls back to Otros', async () => {
    const hallucinated = {
      ...goodResponse,
      category_guesses: [{ name: 'Categoría Inventada', confidence: 0.9 }]
    };
    const result = await input(makeClient(JSON.stringify(hallucinated)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.categoryGuesses).toHaveLength(1);
      expect(result.receipt.categoryGuesses[0].name).toBe('Otros');
      expect(result.receipt.categoryGuesses[0].confidence).toBe(0);
    }
  });

  it('nulls future dates and zeroes their confidence', async () => {
    const future = { ...goodResponse, expense_date: '2099-01-01' };
    const result = await input(makeClient(JSON.stringify(future)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.expenseDate).toBeNull();
      expect(result.receipt.fieldConfidence.expense_date).toBe(0);
    }
  });

  it('defaults a null currency to CLP and rejects non-positive amounts', async () => {
    const odd = { ...goodResponse, currency: null, amount: -50 };
    const result = await input(makeClient(JSON.stringify(odd)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.currency).toBe('CLP');
      expect(result.receipt.amount).toBeNull();
      expect(result.receipt.fieldConfidence.amount).toBe(0);
    }
  });

  it('rejects unsupported image types instead of relabeling them as JPEG', async () => {
    const client = makeClient(JSON.stringify(goodResponse));
    const result = await input(client, { mime: 'image/bmp' });
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
    expect((client as unknown as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create).not.toHaveBeenCalled();
  });

  it('truncates descriptions without splitting surrogate pairs', async () => {
    const long = { ...goodResponse, description: 'a'.repeat(99) + '😀😀' };
    const result = await input(makeClient(JSON.stringify(long)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const description = result.receipt.description ?? '';
      expect(description).toBe('a'.repeat(99) + '😀'); // whole emoji kept, second dropped
      expect(description).not.toMatch(/[\uD800-\uDBFF]$/); // no dangling surrogate
    }
  });

  it('rejects oversize images without calling the API', async () => {
    const client = makeClient(JSON.stringify(goodResponse));
    const result = await input(client, { buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) });
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
    expect((client as unknown as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create).not.toHaveBeenCalled();
  });

  it('sends a document block for PDFs and an image block for photos', async () => {
    const client = makeClient(JSON.stringify(goodResponse));
    await input(client, { mime: 'application/pdf' });
    const create = (client as unknown as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create;
    const pdfCall = create.mock.calls[0][0];
    expect(pdfCall.messages[0].content[0].type).toBe('document');
    expect(pdfCall.max_tokens).toBe(1024);
    expect(pdfCall.temperature).toBe(0);

    await input(client, { mime: 'image/png' });
    const imgCall = create.mock.calls[1][0];
    expect(imgCall.messages[0].content[0].type).toBe('image');
    expect(imgCall.messages[0].content[0].source.media_type).toBe('image/png');
  });

  it('returns api_error when the API call throws', async () => {
    const client = {
      messages: { create: vi.fn().mockRejectedValue(new Error('429')) }
    } as unknown as Anthropic;
    const result = await input(client);
    expect(result).toEqual({ ok: false, reason: 'api_error' });
  });

  it('never includes user identity in the prompt', async () => {
    const client = makeClient(JSON.stringify(goodResponse));
    await input(client);
    const create = (client as unknown as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create;
    const call = create.mock.calls[0][0];
    expect(call.system).toContain('Alimentación');
    expect(call.system).not.toMatch(/user|usuario|email|correo @/i);
  });
});
