#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

console.log(`
🔧 FIXING SUPABASE SCHEMA CACHE ISSUE
=====================================

The RPC functions exist in your database but PostgREST's schema cache is outdated.

To fix this, you need to:

1. Go to https://app.supabase.com
2. Select your project (sxlogxqzmarhqsblxmtj)
3. Go to Settings → API
4. Click "Reload Schema" button

Alternative fix:
1. Go to SQL Editor
2. Run this command:

   NOTIFY pgrst, 'reload schema';

Or run this to force a cache refresh:

   SELECT pg_notify('pgrst', 'reload schema');

After doing this, the learning paths should work immediately.

Note: Sometimes it takes 1-2 minutes for the cache to fully refresh.
`);

// Let's also try to call pg_notify programmatically
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseServiceKey) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log('Attempting to refresh schema cache programmatically...');
  
  supabase
    .rpc('pg_notify', { channel: 'pgrst', payload: 'reload schema' })
    .then(({ data, error }) => {
      if (error) {
        console.log('Could not call pg_notify directly:', error.message);
        console.log('Please use the manual methods above.');
      } else {
        console.log('✅ Schema cache refresh requested!');
        console.log('Wait 1-2 minutes then try creating a learning path again.');
      }
    });
}