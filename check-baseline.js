const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBaseline() {
  const { count, error } = await supabase
    .from('role_permission_baseline')
    .select('*', { count: 'exact', head: true });
    
  if (error) {
    console.log('Error counting baseline:', error.message);
  } else {
    console.log(`Baseline entries count: ${count}`);
  }
}

checkBaseline().catch(console.error);
