#!/usr/bin/env node
/**
 * Master test-database seeding script.
 *
 * Orchestrates the synthetic fixtures the test suite depends on. Each fixture
 * is responsible for being idempotent on its own; this script's job is to run
 * them in a deterministic order and surface the first failure clearly.
 *
 * Run: node scripts/data-seeding/seed-master.js
 *
 * Required env (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config({ path: '.env.local' });

async function run() {
    const fixtures = [
        {
            name: 'group-formation',
            load: async () => {
                const mod = await import('./seed-group-formation-fixtures.mjs');
                return mod.seedGroupFormationFixtures();
            },
        },
    ];

    for (const fixture of fixtures) {
        const start = Date.now();
        process.stdout.write(`[seed-master] ${fixture.name} … `);
        try {
            const result = await fixture.load();
            console.log(`ok (${Date.now() - start}ms)`);
            if (result) {
                console.log(JSON.stringify(result, null, 2));
            }
        } catch (err) {
            console.log('FAILED');
            console.error(err);
            process.exit(1);
        }
    }
}

run();
