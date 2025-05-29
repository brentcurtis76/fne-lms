require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addCashFlowField() {
  try {
    console.log('🔧 Adding incluir_en_flujo field to contratos table...\n');
    
    // Add the incluir_en_flujo column
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE contratos 
        ADD COLUMN IF NOT EXISTS incluir_en_flujo BOOLEAN DEFAULT FALSE;
      `
    });

    if (alterError) {
      console.error('❌ Error adding column:', alterError);
      return;
    }

    console.log('✅ Successfully added incluir_en_flujo column');

    // Update existing contracts to be included in cash flow by default
    const { data: updateData, error: updateError } = await supabase
      .from('contratos')
      .update({ incluir_en_flujo: true })
      .is('incluir_en_flujo', null)
      .select('numero_contrato');

    if (updateError) {
      console.error('❌ Error updating existing contracts:', updateError);
      return;
    }

    console.log(`✅ Updated ${updateData ? updateData.length : 0} existing contracts to include in cash flow`);

    // Verify the changes
    const { data: contracts, error: selectError } = await supabase
      .from('contratos')
      .select('numero_contrato, incluir_en_flujo')
      .order('numero_contrato');

    if (selectError) {
      console.error('❌ Error verifying changes:', selectError);
      return;
    }

    console.log('\n📋 All contracts with cash flow status:');
    contracts.forEach(contract => {
      console.log(`   ${contract.numero_contrato}: ${contract.incluir_en_flujo ? 'En Flujo' : 'Fuera de Flujo'}`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the migration
addCashFlowField();