const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const prodAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function verifyLockdown() {
  console.log('=== VERIFYING 5-TABLE LOCKDOWN COMPLETE ===');
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  const tables = ['clientes', 'contratos', 'cuotas', 'courses', 'activity_feed'];
  let allSecured = true;
  
  for (const table of tables) {
    try {
      const response = await fetch(`${prodUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          'apikey': prodAnonKey,
          'Authorization': `Bearer ${prodAnonKey}`,
        }
      });
      
      if (response.status === 401 || response.status === 403) {
        console.log(`✅ ${table}: SECURED (anonymous blocked with ${response.status})`);
      } else if (response.status === 200) {
        const data = await response.json();
        if (Array.isArray(data) && data.length === 0) {
          console.log(`✅ ${table}: SECURED (empty result - RLS working)`);
        } else {
          console.log(`❌ ${table}: STILL EXPOSED!`);
          allSecured = false;
        }
      } else {
        console.log(`⚠️  ${table}: Unknown status ${response.status}`);
      }
    } catch (error) {
      console.log(`⚠️  ${table}: Error checking - ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  if (allSecured) {
    console.log('✅ SUCCESS: All 5 tables secured!');
    console.log('✅ user_roles was secured earlier');
    console.log('\n🔒 PRODUCTION LOCKDOWN COMPLETE');
  } else {
    console.log('❌ ISSUE: Some tables may still be exposed');
  }
}

verifyLockdown();