const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function testManualContract() {
  console.log('🧪 Testing Manual Contract Creation...');
  
  // First, check if columns exist
  const { data: testContract, error: columnCheckError } = await supabase
    .from('contratos')
    .select('id, numero_contrato, es_manual, descripcion_manual')
    .limit(1);
    
  if (columnCheckError && columnCheckError.message.includes('column')) {
    console.error('❌ Manual contract columns not found. Please apply migration first.');
    console.log('\nRun this SQL in Supabase dashboard:');
    console.log('ALTER TABLE contratos ADD COLUMN IF NOT EXISTS es_manual BOOLEAN DEFAULT false;');
    console.log('ALTER TABLE contratos ADD COLUMN IF NOT EXISTS descripcion_manual TEXT;');
    return;
  }
  
  console.log('✅ Columns exist. Proceeding with test...');
  
  // Get a test client
  const { data: clients } = await supabase
    .from('clientes')
    .select('id, nombre_legal')
    .limit(1);
    
  if (!clients || clients.length === 0) {
    console.error('❌ No clients found for testing');
    return;
  }
  
  const testClient = clients[0];
  console.log(`Using client: ${testClient.nombre_legal}`);
  
  // Create a test manual contract
  const testData = {
    numero_contrato: `MANUAL-TEST-${Date.now()}`,
    fecha_contrato: new Date().toISOString().split('T')[0],
    fecha_fin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    cliente_id: testClient.id,
    programa_id: null, // NULL for manual contracts
    precio_total_uf: 100,
    tipo_moneda: 'UF',
    es_manual: true,
    descripcion_manual: 'Test Manual Contract - Asesoría Especial 2025',
    estado: 'pendiente',
    incluir_en_flujo: true
  };
  
  console.log('\n📝 Creating manual contract...');
  const { data: newContract, error: createError } = await supabase
    .from('contratos')
    .insert([testData])
    .select()
    .single();
    
  if (createError) {
    console.error('❌ Error creating manual contract:', createError);
    return;
  }
  
  console.log('✅ Manual contract created successfully!');
  console.log('  ID:', newContract.id);
  console.log('  Number:', newContract.numero_contrato);
  console.log('  Description:', newContract.descripcion_manual);
  console.log('  Is Manual:', newContract.es_manual);
  
  // Create test payment schedule
  const cuotas = [
    { numero_cuota: 1, fecha_vencimiento: '2025-02-01', monto_uf: 50 },
    { numero_cuota: 2, fecha_vencimiento: '2025-03-01', monto_uf: 50 }
  ];
  
  console.log('\n💰 Creating payment schedule...');
  for (const cuota of cuotas) {
    const { error: cuotaError } = await supabase
      .from('cuotas')
      .insert({
        contrato_id: newContract.id,
        ...cuota,
        pagada: false
      });
      
    if (cuotaError) {
      console.error('❌ Error creating cuota:', cuotaError);
    } else {
      console.log(`  ✅ Cuota ${cuota.numero_cuota}: ${cuota.monto_uf} UF on ${cuota.fecha_vencimiento}`);
    }
  }
  
  console.log('\n🎉 Manual contract test completed successfully!');
  console.log('\nYou can now:');
  console.log('1. View it in the contracts list');
  console.log('2. Upload a PDF for it');
  console.log('3. Track payments in cash flow');
  console.log('4. Manage invoicing');
  
  // Clean up option
  console.log('\n🧹 To clean up test data, run:');
  console.log(`DELETE FROM cuotas WHERE contrato_id = '${newContract.id}';`);
  console.log(`DELETE FROM contratos WHERE id = '${newContract.id}';`);
}

testManualContract().catch(console.error);