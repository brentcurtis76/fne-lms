#!/usr/bin/env node

/**
 * Test script to verify assignment IDs are valid UUIDs
 * Run with: node scripts/test-assignment-ids.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function testAssignmentIds() {
  console.log('Testing assignment IDs from blocks table...\n');

  try {
    // Get some group assignment blocks
    const { data: blocks, error } = await supabase
      .from('blocks')
      .select('id, lesson_id, position, type, payload')
      .in('type', ['group-assignment', 'group_assignment'])
      .limit(10);

    if (error) {
      console.error('Error fetching blocks:', error);
      return;
    }

    console.log(`Found ${blocks.length} group assignment blocks\n`);

    // Test each block
    let validCount = 0;
    let invalidCount = 0;

    blocks.forEach((block, index) => {
      const isValidUUID = UUID_REGEX.test(block.id);
      
      console.log(`Block ${index + 1}:`);
      console.log(`  ID: ${block.id}`);
      console.log(`  Valid UUID: ${isValidUUID ? '✅' : '❌'}`);
      console.log(`  Lesson ID: ${block.lesson_id}`);
      console.log(`  Position: ${block.position}`);
      console.log(`  Title: ${block.payload?.title || 'No title'}`);
      console.log('');

      if (isValidUUID) validCount++;
      else invalidCount++;
    });

    console.log('Summary:');
    console.log(`  Valid UUIDs: ${validCount}`);
    console.log(`  Invalid IDs: ${invalidCount}`);
    console.log(`  Total: ${blocks.length}`);

    // Test that we can query with these IDs
    if (blocks.length > 0) {
      console.log('\nTesting database query with block ID...');
      const testId = blocks[0].id;
      
      const { data: testQuery, error: testError } = await supabase
        .from('blocks')
        .select('id')
        .eq('id', testId)
        .single();

      if (testError) {
        console.log(`❌ Query failed with ID ${testId}:`, testError.message);
      } else {
        console.log(`✅ Successfully queried with UUID: ${testId}`);
      }
    }

  } catch (err) {
    console.error('Test failed:', err);
  }
}

testAssignmentIds();