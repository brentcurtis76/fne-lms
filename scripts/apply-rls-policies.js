#!/usr/bin/env node
/**
 * Apply RLS policy fixes directly to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function executeSql(sql, description) {
  console.log(`\n⚙️  ${description}...`);

  const { data, error } = await supabase.rpc('query', {
    query_text: sql
  });

  if (error) {
    // Try alternative method
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ query_text: sql })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error: ${errorText}`);
      throw new Error(errorText);
    }

    console.log(`✅ ${description} - Success`);
    return await response.json();
  }

  console.log(`✅ ${description} - Success`);
  return data;
}

async function main() {
  console.log('🚀 Applying RLS Policy Fixes\n');
  console.log('=' .repeat(60));

  try {
    // Drop old policy
    await executeSql(
      'DROP POLICY IF EXISTS "expense_items_access" ON expense_items;',
      'Dropping old expense_items_access policy'
    );

    // Create SELECT policy
    await executeSql(`
      CREATE POLICY "expense_items_select" ON expense_items
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.report_id
              AND (
                (
                  er.submitted_by = auth.uid()
                  AND EXISTS (
                    SELECT 1 FROM expense_report_access
                    WHERE user_id = auth.uid()
                      AND can_submit = TRUE
                  )
                )
                OR COALESCE(is_global_admin(auth.uid()), FALSE)
              )
          )
        );
    `, 'Creating expense_items_select policy');

    // Create INSERT policy
    await executeSql(`
      CREATE POLICY "expense_items_insert" ON expense_items
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.report_id
              AND er.submitted_by = auth.uid()
              AND er.status = 'draft'
          )
          AND (
            EXISTS (
              SELECT 1 FROM expense_report_access
              WHERE user_id = auth.uid()
                AND can_submit = TRUE
            )
            OR COALESCE(is_global_admin(auth.uid()), FALSE)
          )
        );
    `, 'Creating expense_items_insert policy');

    // Create UPDATE policy
    await executeSql(`
      CREATE POLICY "expense_items_update" ON expense_items
        FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.report_id
              AND er.submitted_by = auth.uid()
              AND er.status = 'draft'
          )
          AND (
            EXISTS (
              SELECT 1 FROM expense_report_access
              WHERE user_id = auth.uid()
                AND can_submit = TRUE
            )
            OR COALESCE(is_global_admin(auth.uid()), FALSE)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.report_id
              AND er.submitted_by = auth.uid()
              AND er.status = 'draft'
          )
          AND (
            EXISTS (
              SELECT 1 FROM expense_report_access
              WHERE user_id = auth.uid()
                AND can_submit = TRUE
            )
            OR COALESCE(is_global_admin(auth.uid()), FALSE)
          )
        );
    `, 'Creating expense_items_update policy');

    // Create DELETE policy
    await executeSql(`
      CREATE POLICY "expense_items_delete" ON expense_items
        FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM expense_reports er
            WHERE er.id = expense_items.report_id
              AND er.submitted_by = auth.uid()
              AND er.status = 'draft'
          )
          AND (
            EXISTS (
              SELECT 1 FROM expense_report_access
              WHERE user_id = auth.uid()
                AND can_submit = TRUE
            )
            OR COALESCE(is_global_admin(auth.uid()), FALSE)
          )
        );
    `, 'Creating expense_items_delete policy');

    console.log('\n' + '='.repeat(60));
    console.log('✅ All RLS policies applied successfully!');
    console.log('\n📝 Next step: Ask Andrea to try uploading a receipt again');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n⚠️  Falling back to manual application:');
    console.log('   1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql');
    console.log('   2. Copy contents of: database/fix-expense-items-rls.sql');
    console.log('   3. Paste and run in SQL Editor');
    process.exit(1);
  }
}

main();