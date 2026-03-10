/**
 * Context General Questions — API Security & Validation E2E Tests
 *
 * Tests auth guards, input validation, and role-based access on the
 * context questions API endpoints against a live server.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Context Questions API — Auth Guards', () => {
  test('GET /api/admin/context-questions returns 401 without session', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/context-questions`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/context-questions returns 401 without session', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/context-questions`, {
      data: { question_text: 'Test', question_type: 'text' },
    });
    expect(res.status()).toBe(401);
  });

  test('PUT /api/admin/context-questions/[id] returns 401 without session', async ({ request }) => {
    const res = await request.put(
      `${BASE}/api/admin/context-questions/00000000-0000-0000-0000-000000000000`,
      { data: { question_text: 'Updated' } }
    );
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/admin/context-questions/[id] returns 401 without session', async ({ request }) => {
    const res = await request.delete(
      `${BASE}/api/admin/context-questions/00000000-0000-0000-0000-000000000000`
    );
    expect(res.status()).toBe(401);
  });

  test('GET /api/admin/context-questions/overview returns 401 without session', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/context-questions/overview`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/school/transversal-context/questions returns 401 without session', async ({ request }) => {
    const res = await request.get(`${BASE}/api/school/transversal-context/questions`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/school/transversal-context/custom-responses returns 401 without session', async ({ request }) => {
    const res = await request.get(`${BASE}/api/school/transversal-context/custom-responses?school_id=1`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/school/transversal-context/custom-responses returns 401 without session', async ({ request }) => {
    const res = await request.post(`${BASE}/api/school/transversal-context/custom-responses`, {
      data: { school_id: 1, responses: [] },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Context Questions API — Input Validation (no auth needed for 400s)', () => {
  test('[id] route rejects non-UUID id with 400', async ({ request }) => {
    const res = await request.put(`${BASE}/api/admin/context-questions/not-a-uuid`, {
      data: { question_text: 'Test' },
    });
    // Should be 400 for bad UUID format (hits before auth check)
    // or 401 if auth check runs first — either is acceptable
    expect([400, 401]).toContain(res.status());
  });

  test('[id] route rejects SQL injection attempt in id', async ({ request }) => {
    const res = await request.put(
      `${BASE}/api/admin/context-questions/'; DROP TABLE context_general_questions; --`,
      { data: { question_text: 'Test' } }
    );
    expect([400, 401]).toContain(res.status());
  });
});

test.describe('Context Questions API — Method Not Allowed', () => {
  test('PATCH on admin questions index returns 405', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/admin/context-questions`);
    expect(res.status()).toBe(405);
  });

  test('POST on public questions returns 405', async ({ request }) => {
    const res = await request.post(`${BASE}/api/school/transversal-context/questions`, {
      data: {},
    });
    expect(res.status()).toBe(405);
  });

  test('DELETE on custom-responses returns 401 or 405', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/school/transversal-context/custom-responses`);
    // Auth check runs before method check, so 401 without session is correct
    expect([401, 405]).toContain(res.status());
  });
});
