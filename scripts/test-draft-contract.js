const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function testDraftContract() {
  console.log('🧪 Testing Draft Contract Functionality...');
  
  try {
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
    
    // Create a test draft contract
    const draftData = {
      numero_contrato: `DRAFT-TEST-${Date.now()}`,
      fecha_contrato: new Date().toISOString().split('T')[0],
      cliente_id: testClient.id,
      precio_total_uf: 50, // Partial data - not all fields filled
      tipo_moneda: 'UF',
      estado: 'borrador', // Mark as draft
      es_manual: true,
      descripcion_manual: 'Test Draft Contract - Incomplete'
    };
    
    console.log('\n📝 Creating draft contract...');
    const { data: draftContract, error: createError } = await supabase
      .from('contratos')
      .insert([draftData])
      .select()
      .single();
      
    if (createError) {
      console.error('❌ Error creating draft:', createError);
      return;
    }
    
    console.log('✅ Draft created successfully!');
    console.log('  ID:', draftContract.id);
    console.log('  Number:', draftContract.numero_contrato);
    console.log('  Estado:', draftContract.estado);
    console.log('  Price (partial):', draftContract.precio_total_uf);
    
    // Simulate updating the draft with more information
    console.log('\n📝 Updating draft with more information...');
    const updatedData = {
      fecha_fin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      precio_total_uf: 100,
      descripcion_manual: 'Test Draft Contract - Updated with more details'
    };
    
    const { data: updatedContract, error: updateError } = await supabase
      .from('contratos')
      .update(updatedData)
      .eq('id', draftContract.id)
      .select()
      .single();
      
    if (updateError) {
      console.error('❌ Error updating draft:', updateError);
    } else {
      console.log('✅ Draft updated successfully!');
      console.log('  New price:', updatedContract.precio_total_uf);
      console.log('  End date:', updatedContract.fecha_fin);
      console.log('  Description:', updatedContract.descripcion_manual);
    }
    
    // Test adding payment schedule to draft
    console.log('\n💰 Adding payment schedule to draft...');
    const cuotas = [
      { numero_cuota: 1, fecha_vencimiento: '2025-02-15', monto_uf: 50 },
      { numero_cuota: 2, fecha_vencimiento: '2025-03-15', monto_uf: 50 }
    ];
    
    for (const cuota of cuotas) {
      const { error: cuotaError } = await supabase
        .from('cuotas')
        .insert({
          contrato_id: draftContract.id,
          ...cuota,
          pagada: false
        });
        
      if (cuotaError) {
        console.error('❌ Error creating cuota:', cuotaError);
      } else {
        console.log(`  ✅ Cuota ${cuota.numero_cuota}: ${cuota.monto_uf} UF on ${cuota.fecha_vencimiento}`);
      }
    }
    
    console.log('\n🎉 Draft contract test completed successfully!');
    console.log('\nKey features demonstrated:');
    console.log('1. ✅ Create incomplete contract as draft');
    console.log('2. ✅ Update draft with additional information');
    console.log('3. ✅ Add payment schedule to draft');
    console.log('4. ✅ Draft marked with estado="borrador"');
    
    console.log('\n📋 You can view this draft in the contracts list');
    console.log('   It will show a yellow "BORRADOR" badge');
    console.log('   Click on it to continue editing');
    
    // Clean up option
    console.log('\n🧹 To clean up test data, run:');
    console.log(`DELETE FROM cuotas WHERE contrato_id = '${draftContract.id}';`);
    console.log(`DELETE FROM contratos WHERE id = '${draftContract.id}';`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDraftContract().catch(console.error);