/**
 * Context General Questions — Admin CRUD E2E Tests
 *
 * Tests the full lifecycle: login as admin, create a question,
 * read it back, update it, deactivate it.
 *
 * Requires QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD env vars or defaults.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin@test.cl';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || 'TestAdmin2026!';

let authToken = '';

async function loginAndGetToken(request: any): Promise<string> {
  // Try to login via Supabase auth endpoint
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return '';
  }

  const res = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });

  if (res.status() !== 200) {
    return '';
  }

  const body = await res.json();
  return body.access_token || '';
}

test.describe('Context Questions — Admin CRUD via API', () => {
  test.describe.configure({ mode: 'serial' });
  let createdQuestionId = '';

  test.beforeAll(async ({ request }) => {
    authToken = await loginAndGetToken(request);
    test.skip(!authToken, 'Requires valid admin credentials and Supabase env vars');
  });

  test('POST creates a new text question', async ({ request }) => {
    test.skip(!authToken, 'No auth token');

    const res = await request.post(`${BASE}/api/admin/context-questions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        question_text: `E2E Test Question ${Date.now()}`,
        question_type: 'text',
        placeholder: 'Enter your answer',
        help_text: 'This is a test question created by e2e',
        is_required: false,
        display_order: 99,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.question).toBeTruthy();
    expect(body.question.id).toBeTruthy();
    expect(body.question.question_type).toBe('text');
    expect(body.question.is_active).toBe(true);
    createdQuestionId = body.question.id;
  });

  test('GET lists questions and includes the new one', async ({ request }) => {
    test.skip(!authToken || !createdQuestionId, 'Depends on create step');

    const res = await request.get(`${BASE}/api/admin/context-questions`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questions).toBeInstanceOf(Array);
    const found = body.questions.find((q: any) => q.id === createdQuestionId);
    expect(found).toBeTruthy();
  });

  test('POST rejects empty question_text', async ({ request }) => {
    test.skip(!authToken, 'No auth token');

    const res = await request.post(`${BASE}/api/admin/context-questions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { question_text: '   ', question_type: 'text' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('requerido');
  });

  test('POST rejects select type without options', async ({ request }) => {
    test.skip(!authToken, 'No auth token');

    const res = await request.post(`${BASE}/api/admin/context-questions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { question_text: 'Bad select', question_type: 'select' },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('opciones');
  });

  test('POST rejects invalid question_type', async ({ request }) => {
    test.skip(!authToken, 'No auth token');

    const res = await request.post(`${BASE}/api/admin/context-questions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { question_text: 'Bad type', question_type: 'dropdown' },
    });

    expect(res.status()).toBe(400);
  });

  test('PUT updates the question', async ({ request }) => {
    test.skip(!authToken || !createdQuestionId, 'Depends on create step');

    const res = await request.put(
      `${BASE}/api/admin/context-questions/${createdQuestionId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { question_text: 'Updated E2E Question', help_text: 'Updated help' },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.question.question_text).toBe('Updated E2E Question');
    expect(body.question.help_text).toBe('Updated help');
  });

  test('PUT returns 404 for non-existent question', async ({ request }) => {
    test.skip(!authToken, 'No auth token');

    const res = await request.put(
      `${BASE}/api/admin/context-questions/00000000-0000-4000-a000-000000000000`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { question_text: 'Ghost question' },
      }
    );

    expect(res.status()).toBe(404);
  });

  test('DELETE soft-deletes the question (is_active=false)', async ({ request }) => {
    test.skip(!authToken || !createdQuestionId, 'Depends on create step');

    const res = await request.delete(
      `${BASE}/api/admin/context-questions/${createdQuestionId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.question.is_active).toBe(false);
  });

  test('DELETE on already-deactivated question returns 400', async ({ request }) => {
    test.skip(!authToken || !createdQuestionId, 'Depends on delete step');

    const res = await request.delete(
      `${BASE}/api/admin/context-questions/${createdQuestionId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('desactivada');
  });

  test('PUT can re-activate a deactivated question', async ({ request }) => {
    test.skip(!authToken || !createdQuestionId, 'Depends on delete step');

    const res = await request.put(
      `${BASE}/api/admin/context-questions/${createdQuestionId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { is_active: true },
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.question.is_active).toBe(true);
  });

  // Cleanup: deactivate the test question
  test.afterAll(async ({ request }) => {
    if (authToken && createdQuestionId) {
      await request.delete(
        `${BASE}/api/admin/context-questions/${createdQuestionId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
    }
  });
});
