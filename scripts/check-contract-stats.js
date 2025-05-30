require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkContractStats() {
  try {
    console.log('📊 Checking contract statistics...\n');
    
    // Get all contracts with their annex status
    const { data: contracts, error } = await supabase
      .from('contratos')
      .select('numero_contrato, is_anexo, parent_contrato_id, anexo_numero, nombre_ciclo')
      .order('numero_contrato');

    if (error) {
      console.error('❌ Error fetching contracts:', error.message);
      return;
    }

    console.log(`📋 Total contracts in database: ${contracts.length}`);
    
    const mainContracts = contracts.filter(c => !c.is_anexo);
    const annexes = contracts.filter(c => c.is_anexo);
    
    console.log(`   Main contracts: ${mainContracts.length}`);
    console.log(`   Annexes: ${annexes.length}`);
    
    if (annexes.length > 0) {
      console.log('\n🔗 Annexes found:');
      annexes.forEach(annex => {
        console.log(`   ${annex.numero_contrato} (Annex #${annex.anexo_numero}) -> Parent: ${annex.parent_contrato_id}`);
        if (annex.nombre_ciclo) {
          console.log(`      Cycle: ${annex.nombre_ciclo}`);
        }
      });
    } else {
      console.log('\n📝 No annexes found yet. All contracts are main contracts.');
    }
    
    // Show sample of main contracts
    console.log('\n📋 Sample main contracts:');
    mainContracts.slice(0, 5).forEach(contract => {
      console.log(`   ${contract.numero_contrato}`);
    });
    
    if (mainContracts.length > 5) {
      console.log(`   ... and ${mainContracts.length - 5} more`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkContractStats();