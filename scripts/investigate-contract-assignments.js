require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateContractAssignments() {
  try {
    console.log('🔍 Investigating contract assignments...\n');
    
    // Get the last few contracts (especially the ones in question)
    const { data: contracts, error: contractsError } = await supabase
      .from('contratos')
      .select(`
        id,
        numero_contrato,
        fecha_contrato,
        cliente_id,
        clientes (
          id,
          nombre_legal,
          nombre_fantasia,
          rut,
          direccion,
          ciudad
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (contractsError) {
      console.error('Error fetching contracts:', contractsError);
      return;
    }

    console.log('📋 Last 5 contracts created:\n');

    for (const contract of contracts) {
      console.log(`📄 Contract: ${contract.numero_contrato}`);
      console.log(`   Client ID: ${contract.cliente_id}`);
      console.log(`   Client Name: ${contract.clientes.nombre_legal}`);
      console.log(`   Client RUT: ${contract.clientes.rut}`);
      console.log(`   Client City: ${contract.clientes.ciudad}`);
      console.log(`   Date: ${contract.fecha_contrato}`);
      
      // Check if there are other contracts with the same client
      const { data: sameClientContracts, error: sameClientError } = await supabase
        .from('contratos')
        .select('numero_contrato, fecha_contrato')
        .eq('cliente_id', contract.cliente_id);

      if (sameClientError) {
        console.error('Error checking same client contracts:', sameClientError);
        continue;
      }

      if (sameClientContracts.length > 1) {
        console.log(`   ⚠️  This client has ${sameClientContracts.length} contracts:`);
        sameClientContracts.forEach(c => {
          console.log(`      - ${c.numero_contrato} (${c.fecha_contrato})`);
        });
      } else {
        console.log(`   ✅ This client has only 1 contract`);
      }

      // Check if there are other clients with the same RUT
      const { data: sameRutClients, error: sameRutError } = await supabase
        .from('clientes')
        .select('id, nombre_legal, rut, ciudad')
        .eq('rut', contract.clientes.rut);

      if (sameRutError) {
        console.error('Error checking same RUT clients:', sameRutError);
        continue;
      }

      if (sameRutClients.length > 1) {
        console.log(`   🚨 DUPLICATE RUT FOUND! ${sameRutClients.length} clients with RUT ${contract.clientes.rut}:`);
        sameRutClients.forEach((client, index) => {
          console.log(`      ${index + 1}. ID: ${client.id}`);
          console.log(`         Name: ${client.nombre_legal}`);
          console.log(`         City: ${client.ciudad}`);
        });
      }

      console.log('\n' + '─'.repeat(80) + '\n');
    }

    // Special check for the problematic contracts
    console.log('🎯 Special investigation for contracts FNE-2025-05-290 and FNE-2025-05-312:\n');

    const problematicContracts = ['FNE-2025-05-290', 'FNE-2025-05-312'];
    
    for (const contractNumber of problematicContracts) {
      const { data: contract, error } = await supabase
        .from('contratos')
        .select(`
          *,
          clientes (*)
        `)
        .eq('numero_contrato', contractNumber)
        .single();

      if (error) {
        console.error(`Error fetching contract ${contractNumber}:`, error);
        continue;
      }

      console.log(`📄 Contract: ${contractNumber}`);
      console.log(`   Assigned to client: ${contract.clientes.nombre_legal}`);
      console.log(`   Client RUT: ${contract.clientes.rut}`);
      console.log(`   Client location: ${contract.clientes.ciudad}`);
      console.log(`   Contract date: ${contract.fecha_contrato}`);
      console.log(`   Client created: ${contract.clientes.created_at}`);
      console.log(`   Contract created: ${contract.created_at}`);

      // Check if this RUT should belong to a different client
      const { data: allSameRutClients } = await supabase
        .from('clientes')
        .select('*')
        .eq('rut', contract.clientes.rut)
        .order('created_at');

      if (allSameRutClients && allSameRutClients.length > 1) {
        console.log(`   🚨 This RUT (${contract.clientes.rut}) has ${allSameRutClients.length} clients:`);
        allSameRutClients.forEach((client, index) => {
          console.log(`      ${index + 1}. ${client.nombre_legal} (${client.ciudad}) - Created: ${client.created_at}`);
        });
      }

      console.log('\n');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the investigation
investigateContractAssignments();