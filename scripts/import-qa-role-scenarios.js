/**
 * Import QA scenarios from markdown docs to qa_scenarios table
 *
 * Imports scenarios from table-based markdown docs for 6 roles:
 * - admin (129 scenarios)
 * - community_manager (67 scenarios)
 * - equipo_directivo (68 scenarios)
 * - lider_comunidad (59 scenarios)
 * - lider_generacion (62 scenarios)
 * - supervisor_de_red (55 scenarios)
 *
 * Run with: node scripts/import-qa-role-scenarios.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Files to import (role -> filename)
const ROLE_DOCS = {
  admin: 'QA_SCENARIOS_ADMIN.md',
  community_manager: 'QA_SCENARIOS_COMMUNITY_MANAGER.md',
  equipo_directivo: 'QA_SCENARIOS_EQUIPO_DIRECTIVO.md',
  lider_comunidad: 'QA_SCENARIOS_LIDER_COMUNIDAD.md',
  lider_generacion: 'QA_SCENARIOS_LIDER_GENERACION.md',
  supervisor_de_red: 'QA_SCENARIOS_SUPERVISOR_DE_RED.md',
};

// Section header to FeatureArea mapping
const SECTION_TO_FEATURE_AREA = {
  'Correct Access': 'role_assignment',
  'Permission Boundaries': 'role_assignment',
  'Sidebar Visibility -- Should be VISIBLE': 'navigation',
  'Sidebar Visibility -- Should NOT be visible': 'navigation',
  'CRUD Operations Verification': 'user_management',
  'Global Scope Verification': 'reporting',
  'Regression Tests': 'role_assignment',
  'Edge Cases': 'role_assignment',
  'Content Management Scoping': 'course_management',
  'School Assignment Scoping': 'school_management',
  'Community Assignment Scoping': 'community_workspace',
  'Generation Assignment Scoping': 'reporting',
  'Network Scoping': 'network_management',
  'RLS Policy Verification': 'role_assignment',
  'Sidebar Visibility': 'navigation',
  'Should be VISIBLE': 'navigation',
  'Should NOT be visible': 'navigation',
};

// Fallback feature area
const DEFAULT_FEATURE_AREA = 'role_assignment';

/**
 * Map section header to feature area
 */
function mapSectionToFeatureArea(sectionHeader) {
  // Try exact match first
  for (const [pattern, area] of Object.entries(SECTION_TO_FEATURE_AREA)) {
    if (sectionHeader.includes(pattern)) {
      return area;
    }
  }

  // Return default fallback
  return DEFAULT_FEATURE_AREA;
}

/**
 * Parse a single markdown file and extract scenarios from tables
 */
function parseMarkdownFile(filePath, role) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const scenarios = [];
  let currentSection = null;
  let inTable = false;
  let tableHeaders = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Track section headers (## Something)
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim();
      inTable = false;
      tableHeaders = [];
      continue;
    }

    // Skip non-table sections
    if (!currentSection) continue;

    // Skip sections that don't contain scenario tables
    const skipSections = [
      'Source Files Analyzed',
      'Role Definition Summary',
      'Scenario Summary',
      'Playwright Test Stubs',
      'Test Credentials',
      'Test Account',
      'Notes',
      'Known Issues',
      'Security Findings',
      'Schema Migration Applied',
      'Design Gaps Documented',
      'Security Gaps Documented',
    ];

    if (skipSections.some(skip => currentSection.includes(skip))) {
      continue;
    }

    // Detect table header row (starts with |)
    if (line.startsWith('| #') || line.startsWith('|#')) {
      inTable = true;
      // Extract headers
      tableHeaders = line.split('|').map(h => h.trim()).filter(h => h);
      continue;
    }

    // Skip separator row (|---|---|)
    if (line.startsWith('|---') || line.startsWith('| ---')) {
      continue;
    }

    // Parse table data rows
    if (inTable && line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');

      if (cells.length < 2) continue; // Need at least ID and some content

      // First column is always the ID (CA-1, PB-1, etc.)
      const id = cells[0];
      if (!id || id === '#' || id === '---') continue;

      // Last column is always Expected Result
      const expectedResult = cells[cells.length - 1];

      // Everything between first and last is the instruction
      const middleCells = cells.slice(1, -1);
      const instruction = middleCells.join(' — '); // Concatenate middle columns

      // Build scenario name from ID + second column
      const scenarioName = `${id}: ${cells[1] || instruction}`;

      // Map section to feature area
      const featureArea = mapSectionToFeatureArea(currentSection);

      scenarios.push({
        name: scenarioName,
        description: instruction,
        feature_area: featureArea,
        role_required: role,
        preconditions: [],
        steps: [{
          index: 1,
          instruction: instruction,
          expectedOutcome: expectedResult,
          route: null,
          captureOnFail: true,
          captureOnPass: false,
        }],
        priority: 2, // Default priority
        estimated_duration_minutes: 5,
        is_active: true,
        is_multi_user: false,
      });
    }
  }

  return scenarios;
}

/**
 * Main import function
 */
async function main() {
  console.log('\n=== QA Role Scenario Import ===\n');

  // Step 1: Query existing scenario names for deduplication
  console.log('Step 1: Loading existing scenarios for deduplication...');
  const { data: existingScenarios, error: queryError } = await supabase
    .from('qa_scenarios')
    .select('name');

  if (queryError) {
    console.error('Error querying existing scenarios:', queryError.message);
    process.exit(1);
  }

  const existingNames = new Set(existingScenarios.map(s => s.name));
  console.log(`  Found ${existingNames.size} existing scenarios\n`);

  // Step 2: Parse all markdown files
  console.log('Step 2: Parsing markdown files...');
  const docsDir = path.join(__dirname, '..', 'docs');
  const allScenarios = [];
  const roleStats = {};

  for (const [role, filename] of Object.entries(ROLE_DOCS)) {
    const filePath = path.join(docsDir, filename);

    if (!fs.existsSync(filePath)) {
      console.error(`  ERROR: File not found: ${filePath}`);
      continue;
    }

    console.log(`  Parsing ${filename}...`);
    const scenarios = parseMarkdownFile(filePath, role);

    // Filter out duplicates
    const uniqueScenarios = scenarios.filter(s => !existingNames.has(s.name));
    const skipped = scenarios.length - uniqueScenarios.length;

    console.log(`    Parsed: ${scenarios.length} | Unique: ${uniqueScenarios.length} | Skipped (duplicates): ${skipped}`);

    allScenarios.push(...uniqueScenarios);
    roleStats[role] = {
      total: scenarios.length,
      unique: uniqueScenarios.length,
      skipped: skipped,
    };
  }

  console.log(`\n  Total scenarios to import: ${allScenarios.length}\n`);

  if (allScenarios.length === 0) {
    console.log('No new scenarios to import. Exiting.');
    return;
  }

  // Step 3: Insert scenarios in batches by role (for better error tracking)
  console.log('Step 3: Inserting scenarios into database...');
  let totalInserted = 0;
  const errors = [];

  for (const [role, filename] of Object.entries(ROLE_DOCS)) {
    const roleScenariosToInsert = allScenarios.filter(s => s.role_required === role);

    if (roleScenariosToInsert.length === 0) {
      console.log(`  ${role}: No new scenarios to insert`);
      continue;
    }

    console.log(`  ${role}: Inserting ${roleScenariosToInsert.length} scenarios...`);

    const { data, error } = await supabase
      .from('qa_scenarios')
      .insert(roleScenariosToInsert)
      .select('id');

    if (error) {
      console.error(`    ERROR: ${error.message}`);
      errors.push(`${role}: ${error.message}`);
    } else {
      totalInserted += data.length;
      console.log(`    SUCCESS: ${data.length} scenarios inserted`);
    }
  }

  console.log('\n=== IMPORT COMPLETE ===\n');

  // Step 4: Verify final counts
  console.log('Step 4: Verifying import...');
  const { data: finalScenarios, error: verifyError } = await supabase
    .from('qa_scenarios')
    .select('role_required', { count: 'exact' });

  if (verifyError) {
    console.error('Verification error:', verifyError.message);
  } else {
    const roleCounts = {};
    finalScenarios.forEach(s => {
      roleCounts[s.role_required] = (roleCounts[s.role_required] || 0) + 1;
    });

    console.log('\nFinal scenario counts by role:');
    Object.entries(roleCounts).sort().forEach(([role, count]) => {
      console.log(`  ${role}: ${count}`);
    });
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Total scenarios inserted: ${totalInserted}`);
  console.log('\nPer-role breakdown:');
  Object.entries(roleStats).forEach(([role, stats]) => {
    console.log(`  ${role}:`);
    console.log(`    Total in doc: ${stats.total}`);
    console.log(`    New (inserted): ${stats.unique}`);
    console.log(`    Skipped (duplicate): ${stats.skipped}`);
  });

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(err => console.log(`  - ${err}`));
  } else {
    console.log('\nNo errors encountered.');
  }

  console.log('\n=== DONE ===\n');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
