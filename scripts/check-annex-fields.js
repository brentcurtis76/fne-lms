require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAnnexFields() {
  try {
    console.log('🔍 Checking if annex fields exist in contratos table...\n');
    
    // Define the fields we're looking for
    const annexFields = [
      'is_anexo',
      'parent_contrato_id', 
      'anexo_numero',
      'anexo_fecha',
      'numero_participantes',
      'nombre_ciclo'
    ];
    
    console.log('📋 Checking for the following annex fields:');
    annexFields.forEach(field => console.log(`   - ${field}`));
    console.log('');
    
    // Try to select all annex fields to see which ones exist
    const { data: contracts, error } = await supabase
      .from('contratos')
      .select(`numero_contrato, ${annexFields.join(', ')}`)
      .limit(1);

    if (error) {
      console.error('❌ Error reading annex fields:', error.message);
      
      // Check which specific fields are missing
      const missingFields = annexFields.filter(field => 
        error.message.includes(field)
      );
      
      if (missingFields.length > 0) {
        console.log('🔧 The following annex columns are missing from the contratos table:');
        missingFields.forEach(field => console.log(`   - ${field}`));
        console.log('\n📝 You need to run the annex migration to add these columns.');
        console.log('\nTo add the missing columns, run:');
        console.log('node scripts/apply-annex-migration.js');
        console.log('\nOr manually run the SQL in Supabase SQL editor:');
        console.log('File: database/add-annex-support.sql');
      } else {
        console.log('❓ Unknown error occurred. Please check the database schema manually.');
      }
      return;
    }

    console.log('✅ All annex fields exist in the contratos table!');
    console.log('📋 Sample contract data:');
    if (contracts && contracts.length > 0) {
      const contract = contracts[0];
      console.log(`   Contract: ${contract.numero_contrato}`);
      console.log(`   Is Annex: ${contract.is_anexo ? 'Yes' : 'No'}`);
      console.log(`   Parent Contract ID: ${contract.parent_contrato_id || 'N/A'}`);
      console.log(`   Annex Number: ${contract.anexo_numero || 'N/A'}`);
      console.log(`   Annex Date: ${contract.anexo_fecha || 'N/A'}`);
      console.log(`   Participants: ${contract.numero_participantes || 'N/A'}`);
      console.log(`   Cycle Name: ${contract.nombre_ciclo || 'N/A'}`);
    }

    // Get count of annexes vs main contracts
    const { data: annexStats, error: statsError } = await supabase
      .from('contratos')
      .select('is_anexo')
      .neq('is_anexo', null);

    if (!statsError && annexStats) {
      const annexCount = annexStats.filter(c => c.is_anexo).length;
      const mainContractCount = annexStats.filter(c => !c.is_anexo).length;
      
      console.log('\n📊 Contract Statistics:');
      console.log(`   Main Contracts: ${mainContractCount}`);
      console.log(`   Annexes: ${annexCount}`);
      console.log(`   Total: ${annexStats.length}`);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkAnnexFields();