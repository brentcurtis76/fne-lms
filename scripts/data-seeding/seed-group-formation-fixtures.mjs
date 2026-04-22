/**
 * Seed fixture for the group-formation school-validation regression
 * (branch: fix/grp-dual-role).
 *
 * Creates four synthetic users that exercise the four interesting shapes
 * of `user_roles` rows the validator and picker must agree on, and a
 * dedicated course + lesson + group-assignment block that all four are
 * enrolled in. Idempotent: safe to re-run; uses synthetic data only.
 *
 * Run directly:    node scripts/data-seeding/seed-group-formation-fixtures.mjs
 * Run via master:  node scripts/data-seeding/seed-master.js
 *
 * Required env (loaded from .env.local by the master script):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SEEDED_SCHOOL_ID = 257; // canonical QA school
const PASSWORD = 'TestQA2026!';

export const FIXTURES = {
    seededSchoolId: SEEDED_SCHOOL_ID,
    courseTitle: 'QA Group Formation Test Course',
    moduleTitle: 'QA Group Formation Test Module',
    lessonTitle: 'QA Group Formation Test Lesson',
    blockTitle: 'QA Group Formation Group Assignment',
    users: {
        requester: { email: 'group-lead-qa@test.cl', firstName: 'Group', lastName: 'Lead QA' },
        dualCleanNull: { email: 'dual-clean-null@test.cl', firstName: 'Dual', lastName: 'CleanNull' },
        dupRows: { email: 'dup-rows@test.cl', firstName: 'Dup', lastName: 'Rows' },
        wrongSchool: { email: 'wrong-school@test.cl', firstName: 'Wrong', lastName: 'School' },
    },
    password: PASSWORD,
};

function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment',
        );
    }
    return createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

async function ensureAuthUser(supabase, { email, firstName, lastName }) {
    // Try to look up by listing users with a filter — admin.listUsers returns
    // paginated results, so prefer profiles lookup as the fast path and fall
    // back to creation if missing.
    const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

    if (existingProfile?.id) {
        return existingProfile.id;
    }

    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
    });

    if (error) {
        // If somehow already exists in auth but not in profiles, dig it out.
        if (/already (registered|exists)/i.test(error.message)) {
            const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 });
            const found = list?.users?.find(u => u.email === email);
            if (found) return found.id;
        }
        throw new Error(`Failed to create auth user ${email}: ${error.message}`);
    }

    const userId = data.user.id;
    await supabase.from('profiles').upsert(
        {
            id: userId,
            email,
            name: `${firstName} ${lastName}`,
            first_name: firstName,
            last_name: lastName,
            approval_status: 'approved',
        },
        { onConflict: 'id' },
    );
    return userId;
}

async function resetRoles(supabase, userId, rows) {
    await supabase.from('user_roles').delete().eq('user_id', userId);
    if (rows.length === 0) return;
    const payload = rows.map(r => ({
        user_id: userId,
        role_type: r.role_type,
        school_id: r.school_id,
        is_active: true,
    }));
    const { error } = await supabase.from('user_roles').insert(payload);
    if (error) throw new Error(`Failed to insert roles for ${userId}: ${error.message}`);
}

async function findOtherSchoolId(supabase) {
    const { data, error } = await supabase
        .from('schools')
        .select('id')
        .neq('id', SEEDED_SCHOOL_ID)
        .order('id', { ascending: true })
        .limit(1);
    if (error) throw new Error(`Failed to find an alternate school: ${error.message}`);
    if (!data || data.length === 0) {
        throw new Error(
            `No alternate school exists in DB (need an id != ${SEEDED_SCHOOL_ID} for the wrong-school user)`,
        );
    }
    return data[0].id;
}

async function ensureCourse(supabase) {
    const { data: existing } = await supabase
        .from('courses')
        .select('id')
        .eq('title', FIXTURES.courseTitle)
        .maybeSingle();
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
        .from('courses')
        .insert({
            title: FIXTURES.courseTitle,
            description: 'Synthetic course for group-formation E2E fixtures',
            status: 'published',
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create course: ${error.message}`);
    return data.id;
}

async function ensureModule(supabase, courseId) {
    const { data: existing } = await supabase
        .from('modules')
        .select('id')
        .eq('course_id', courseId)
        .eq('title', FIXTURES.moduleTitle)
        .maybeSingle();
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
        .from('modules')
        .insert({
            course_id: courseId,
            title: FIXTURES.moduleTitle,
            order_number: 1,
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create module: ${error.message}`);
    return data.id;
}

async function ensureLesson(supabase, courseId, moduleId) {
    const { data: existing } = await supabase
        .from('lessons')
        .select('id')
        .eq('course_id', courseId)
        .eq('title', FIXTURES.lessonTitle)
        .maybeSingle();
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
        .from('lessons')
        .insert({
            course_id: courseId,
            module_id: moduleId,
            title: FIXTURES.lessonTitle,
            order_number: 1,
            is_mandatory: true,
            lesson_type: 'standard',
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create lesson: ${error.message}`);
    return data.id;
}

async function ensureBlock(supabase, courseId, lessonId) {
    const { data: existing } = await supabase
        .from('blocks')
        .select('id')
        .eq('lesson_id', lessonId)
        .eq('type', 'group-assignment')
        .maybeSingle();
    if (existing?.id) return existing.id;

    const { data, error } = await supabase
        .from('blocks')
        .insert({
            course_id: courseId,
            lesson_id: lessonId,
            position: 0,
            type: 'group-assignment',
            payload: {
                title: FIXTURES.blockTitle,
                description: 'Synthetic group-assignment block for E2E fixtures',
                min_group_size: 2,
                max_group_size: 4,
            },
            is_visible: true,
            interaction_required: true,
            block_weight: 1.0,
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to create block: ${error.message}`);
    return data.id;
}

async function ensureEnrollment(supabase, userId, courseId) {
    const { data: existing } = await supabase
        .from('course_enrollments')
        .select('id, status')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .maybeSingle();
    if (existing?.id) {
        if (existing.status !== 'active') {
            await supabase
                .from('course_enrollments')
                .update({ status: 'active' })
                .eq('id', existing.id);
        }
        return existing.id;
    }
    const { data, error } = await supabase
        .from('course_enrollments')
        .insert({
            user_id: userId,
            course_id: courseId,
            status: 'active',
            enrollment_type: 'assigned',
        })
        .select('id')
        .single();
    if (error) throw new Error(`Failed to enroll ${userId}: ${error.message}`);
    return data.id;
}

export async function seedGroupFormationFixtures() {
    const supabase = getAdminClient();
    const otherSchoolId = await findOtherSchoolId(supabase);

    const requesterId = await ensureAuthUser(supabase, FIXTURES.users.requester);
    const dualId = await ensureAuthUser(supabase, FIXTURES.users.dualCleanNull);
    const dupId = await ensureAuthUser(supabase, FIXTURES.users.dupRows);
    const wrongId = await ensureAuthUser(supabase, FIXTURES.users.wrongSchool);

    await resetRoles(supabase, requesterId, [
        { role_type: 'equipo_directivo', school_id: SEEDED_SCHOOL_ID },
    ]);
    await resetRoles(supabase, dualId, [
        { role_type: 'docente', school_id: SEEDED_SCHOOL_ID },
        { role_type: 'docente', school_id: null },
    ]);
    await resetRoles(supabase, dupId, [
        { role_type: 'docente', school_id: SEEDED_SCHOOL_ID },
        { role_type: 'docente', school_id: SEEDED_SCHOOL_ID },
        { role_type: 'docente', school_id: SEEDED_SCHOOL_ID },
        { role_type: 'docente', school_id: SEEDED_SCHOOL_ID },
    ]);
    await resetRoles(supabase, wrongId, [
        { role_type: 'docente', school_id: otherSchoolId },
    ]);

    const courseId = await ensureCourse(supabase);
    const moduleId = await ensureModule(supabase, courseId);
    const lessonId = await ensureLesson(supabase, courseId, moduleId);
    const blockId = await ensureBlock(supabase, courseId, lessonId);

    for (const userId of [requesterId, dualId, dupId, wrongId]) {
        await ensureEnrollment(supabase, userId, courseId);
    }

    // Clean any pre-existing group memberships so re-runs of the spec start
    // from a known empty state.
    await supabase
        .from('group_assignment_members')
        .delete()
        .eq('assignment_id', blockId)
        .in('user_id', [requesterId, dualId, dupId, wrongId]);
    await supabase
        .from('group_assignment_groups')
        .delete()
        .eq('assignment_id', blockId);

    return {
        seededSchoolId: SEEDED_SCHOOL_ID,
        otherSchoolId,
        courseId,
        lessonId,
        blockId,
        userIds: {
            requester: requesterId,
            dualCleanNull: dualId,
            dupRows: dupId,
            wrongSchool: wrongId,
        },
    };
}

const isMain =
    import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('seed-group-formation-fixtures.mjs');

if (isMain) {
    seedGroupFormationFixtures()
        .then(result => {
            console.log('[seed-group-formation-fixtures] OK');
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(err => {
            console.error('[seed-group-formation-fixtures] FAILED:', err);
            process.exit(1);
        });
}
