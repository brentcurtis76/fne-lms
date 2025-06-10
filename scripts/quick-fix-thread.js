#!/usr/bin/env node

/**
 * Quick fix for the Alice Example thread
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixAliceThread() {
  try {
    console.log('🔧 Fixing Alice Example thread...\n');

    // Update the thread to be created by Mora instead of Alice
    const { error } = await supabase
      .from('message_threads')
      .update({ 
        created_by: 'e4216c21-083c-40b5-9b98-ca81cba11b66' // Mora's ID
      })
      .eq('id', 'c415a9f1-81bf-4004-b87e-83f54253997f'); // Thread ID

    if (error) {
      console.error('❌ Error updating thread:', error);
    } else {
      console.log('✅ Thread updated successfully!');
      console.log('   The thread should now show "Por Mora del Fresno"');
      console.log('   Please refresh your browser to see the change.');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the fix
fixAliceThread();