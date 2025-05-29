require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCashFlowField() {
  try {
    console.log('🔍 Checking if incluir_en_flujo field exists...\n');
    
    // Try to select the field to see if it exists
    const { data: contracts, error } = await supabase
      .from('contratos')
      .select('numero_contrato, incluir_en_flujo')
      .limit(1);

    if (error) {
      console.error('❌ Error reading incluir_en_flujo field:', error.message);
      if (error.message.includes('incluir_en_flujo')) {
        console.log('🔧 The incluir_en_flujo column does not exist in the contratos table.');
        console.log('📝 You need to add this column using the Supabase SQL editor or database migration tool.');
        console.log('\nSQL to run in Supabase SQL editor:');
        console.log('ALTER TABLE contratos ADD COLUMN incluir_en_flujo BOOLEAN DEFAULT FALSE;');
        console.log('UPDATE contratos SET incluir_en_flujo = TRUE WHERE incluir_en_flujo IS NULL;');
      }
      return;
    }

    console.log('✅ incluir_en_flujo field exists!');
    console.log('📋 Sample contract data:');
    if (contracts && contracts.length > 0) {
      console.log(`   ${contracts[0].numero_contrato}: ${contracts[0].incluir_en_flujo ? 'En Flujo' : 'Fuera de Flujo'}`);
    }

    // Get all contracts with their cash flow status
    const { data: allContracts, error: allError } = await supabase
      .from('contratos')
      .select('numero_contrato, incluir_en_flujo')
      .order('numero_contrato');

    if (allError) {
      console.error('Error getting all contracts:', allError);
      return;
    }

    console.log('\n📋 All contracts with cash flow status:');
    allContracts.forEach(contract => {
      console.log(`   ${contract.numero_contrato}: ${contract.incluir_en_flujo ? 'En Flujo' : 'Fuera de Flujo'}`);
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkCashFlowField();