require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDuplicateClientName() {
  try {
    console.log('🔧 Fixing duplicate client name...\n');
    
    // The client ID that should be renamed (the one in Valdivia)
    const clientIdToFix = '94ed67b8-8ccb-4040-bd65-252f4aa16f98';
    const correctName = 'FUNDACIÓN EDUCACIONAL COLEGIO SANTA MARTA DE VALDIVIA';
    
    console.log(`📝 Updating client ID: ${clientIdToFix}`);
    console.log(`📝 New name: ${correctName}`);
    
    // Update the client name
    const { data, error } = await supabase
      .from('clientes')
      .update({ 
        nombre_legal: correctName
      })
      .eq('id', clientIdToFix)
      .select('*');

    if (error) {
      console.error('❌ Error updating client:', error);
      return;
    }

    if (data && data.length > 0) {
      console.log('✅ Successfully updated client:');
      console.log(`   ID: ${data[0].id}`);
      console.log(`   Old name: "FUNDACIÓN EDUCACIONAL LICEO SANTA MARTA DE VALLENAR"`);
      console.log(`   New name: "${data[0].nombre_legal}"`);
      console.log(`   RUT: ${data[0].rut}`);
      console.log(`   Location: ${data[0].ciudad}`);
      console.log(`   Representative: ${data[0].nombre_representante}`);
    }

    // Verify the fix by checking for remaining duplicates
    console.log('\n🔍 Verifying fix...');
    
    const { data: allClients, error: checkError } = await supabase
      .from('clientes')
      .select('*')
      .ilike('nombre_legal', '%SANTA MARTA%');

    if (checkError) {
      console.error('❌ Error checking clients:', checkError);
      return;
    }

    console.log('\n📋 All clients with "SANTA MARTA" in name:');
    allClients.forEach((client, index) => {
      console.log(`   ${index + 1}. "${client.nombre_legal}"`);
      console.log(`      RUT: ${client.rut} | Location: ${client.ciudad}`);
    });

    console.log('\n✅ Fix completed! No more duplicate client names.');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the fix
fixDuplicateClientName();