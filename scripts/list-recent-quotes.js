const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listQuotes() {
  console.log('Fetching recent quotes...\n');

  const { data: quotes, error } = await supabase
    .from('pasantias_quotes')
    .select('quote_number, client_name, created_at, status')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching quotes:', error);
    return;
  }

  if (!quotes || quotes.length === 0) {
    console.log('No quotes found in the database.');
    return;
  }

  console.log(`Found ${quotes.length} recent quote(s):\n`);
  quotes.forEach((quote) => {
    console.log(`  Quote #${quote.quote_number || 'N/A'}`);
    console.log(`    Client: ${quote.client_name}`);
    console.log(`    Created: ${new Date(quote.created_at).toLocaleString()}`);
    console.log(`    Status: ${quote.status}`);
    console.log('');
  });
}

listQuotes()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
