/**
 * Group Formation — School Validation E2E Tests
 *
 * Regression coverage for the dual-role / duplicate-rows / wrong-school
 * classmate validation contract owned by
 * lib/utils/classmateSchoolValidation.ts. The picker
 * (pages/api/assignments/eligible-classmates.ts) and the validator
 * (pages/api/assignments/create-group.ts) must agree on the rule
 * "valid iff the classmate has at least one active role at the requester's
 * school." These tests exercise that contract end-to-end.
 *
 * Prerequisites:
 *   node scripts/data-seeding/seed-master.js
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const PASSWORD = 'TestQA2026!';
const REQUESTER_EMAIL = 'group-lead-qa@test.cl';
const ERROR_WRONG_SCHOOL = 'Algunos compañeros no pertenecen a tu escuela';

interface SeededIds {
    assignmentId: string;
    requesterId: string;
    dualCleanNullId: string;
    dupRowsId: string;
    wrongSchoolId: string;
}

let seeded: SeededIds;
let admin: SupabaseClient;

async function lookupUserId(email: string): Promise<string> {
    const { data, error } = await admin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
    if (error || !data) {
        throw new Error(`Seeded user not found for ${email}: ${error?.message}`);
    }
    return data.id;
}

async function lookupAssignmentId(): Promise<string> {
    const { data: lesson, error: lessonErr } = await admin
        .from('lessons')
        .select('id')
        .eq('title', 'QA Group Formation Test Lesson')
        .single();
    if (lessonErr || !lesson) {
        throw new Error(`Seeded lesson not found: ${lessonErr?.message}`);
    }
    const { data: block, error: blockErr } = await admin
        .from('blocks')
        .select('id')
        .eq('lesson_id', lesson.id)
        .eq('type', 'group-assignment')
        .single();
    if (blockErr || !block) {
        throw new Error(`Seeded group-assignment block not found: ${blockErr?.message}`);
    }
    return block.id;
}

async function clearGroupsForAssignment(assignmentId: string) {
    await admin.from('group_assignment_members').delete().eq('assignment_id', assignmentId);
    await admin.from('group_assignment_groups').delete().eq('assignment_id', assignmentId);
}

async function loginAsRequester(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', REQUESTER_EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

async function postCreateGroup(
    request: APIRequestContext,
    classmateIds: string[],
): Promise<{ status: number; body: any }> {
    const response = await request.post('/api/assignments/create-group', {
        data: {
            assignmentId: seeded.assignmentId,
            classmateIds,
        },
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status(), body };
}

test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
                'Run `node scripts/data-seeding/seed-master.js` first to seed fixtures.',
        );
    }
    admin = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    seeded = {
        assignmentId: await lookupAssignmentId(),
        requesterId: await lookupUserId(REQUESTER_EMAIL),
        dualCleanNullId: await lookupUserId('dual-clean-null@test.cl'),
        dupRowsId: await lookupUserId('dup-rows@test.cl'),
        wrongSchoolId: await lookupUserId('wrong-school@test.cl'),
    };
});

test.beforeEach(async () => {
    await clearGroupsForAssignment(seeded.assignmentId);
});

test.describe('Group Formation — School Validation', () => {
    test('dual-role classmate (one school + one null) creates group successfully', async ({ page }) => {
        await loginAsRequester(page);
        const { status, body } = await postCreateGroup(page.request, [seeded.dualCleanNullId]);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.error).toBeUndefined();
        expect(Array.isArray(body.members)).toBe(true);
        expect(body.members).toHaveLength(2);
    });

    test('classmate with duplicate active rows at the same school creates group successfully', async ({ page }) => {
        await loginAsRequester(page);
        const { status, body } = await postCreateGroup(page.request, [seeded.dupRowsId]);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.error).toBeUndefined();
        expect(Array.isArray(body.members)).toBe(true);
        expect(body.members).toHaveLength(2);
    });

    test('wrong-school classmate is rejected with the school-mismatch error', async ({ page }) => {
        await loginAsRequester(page);
        const { status, body } = await postCreateGroup(page.request, [seeded.wrongSchoolId]);

        expect(status).toBe(400);
        expect(body.error).toBe(ERROR_WRONG_SCHOOL);
    });
});
