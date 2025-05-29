require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDuplicateClients() {
  try {
    console.log('🔍 Checking for duplicate client names...\n');
    
    // Get all clients
    const { data: clients, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre_legal');

    if (error) {
      console.error('Error fetching clients:', error);
      return;
    }

    // Group by nombre_legal (case-insensitive)
    const clientGroups = {};
    clients.forEach(client => {
      const normalizedName = client.nombre_legal.toLowerCase().trim();
      if (!clientGroups[normalizedName]) {
        clientGroups[normalizedName] = [];
      }
      clientGroups[normalizedName].push(client);
    });

    // Find duplicates
    const duplicates = Object.entries(clientGroups)
      .filter(([name, clients]) => clients.length > 1);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate client names found.');
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate client name(s):\n`);

    duplicates.forEach(([normalizedName, duplicateClients]) => {
      console.log(`📋 "${duplicateClients[0].nombre_legal}" (${duplicateClients.length} records):`);
      
      duplicateClients.forEach((client, index) => {
        console.log(`   ${index + 1}. ID: ${client.id}`);
        console.log(`      RUT: ${client.rut}`);
        console.log(`      Nombre Fantasía: ${client.nombre_fantasia}`);
        console.log(`      Dirección: ${client.direccion}`);
        console.log(`      Comuna: ${client.comuna}, ${client.ciudad}`);
        console.log(`      Representante: ${client.nombre_representante}`);
        console.log('');
      });

      // Check if any of these clients have contracts
      checkClientContracts(duplicateClients);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

async function checkClientContracts(clients) {
  try {
    for (const client of clients) {
      const { data: contracts, error } = await supabase
        .from('contratos')
        .select('id, numero_contrato')
        .eq('cliente_id', client.id);

      if (error) {
        console.error('Error checking contracts for client:', client.id, error);
        continue;
      }

      if (contracts && contracts.length > 0) {
        console.log(`   📄 Client ID ${client.id} has ${contracts.length} contract(s):`);
        contracts.forEach(contract => {
          console.log(`      - ${contract.numero_contrato}`);
        });
      } else {
        console.log(`   📄 Client ID ${client.id} has no contracts`);
      }
    }
    console.log('\n' + '─'.repeat(80) + '\n');
  } catch (error) {
    console.error('Error checking contracts:', error);
  }
}

// Run the check
checkDuplicateClients();