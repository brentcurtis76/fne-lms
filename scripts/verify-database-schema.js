require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyDatabaseSchema() {
  try {
    console.log('🔍 Comprehensive Database Schema Verification\n');
    console.log('=' .repeat(50));
    
    // Check contratos table structure
    console.log('\n📋 CONTRATOS TABLE VERIFICATION');
    console.log('-'.repeat(30));
    
    const annexFields = [
      'is_anexo',
      'parent_contrato_id', 
      'anexo_numero',
      'anexo_fecha',
      'numero_participantes',
      'nombre_ciclo'
    ];
    
    let allFieldsExist = true;
    const fieldStatus = {};
    
    for (const field of annexFields) {
      try {
        const { data, error } = await supabase
          .from('contratos')
          .select(field)
          .limit(1);
          
        if (error) {
          fieldStatus[field] = 'MISSING';
          allFieldsExist = false;
        } else {
          fieldStatus[field] = 'EXISTS';
        }
      } catch (err) {
        fieldStatus[field] = 'ERROR';
        allFieldsExist = false;
      }
    }
    
    console.log('Field Status:');
    Object.entries(fieldStatus).forEach(([field, status]) => {
      const emoji = status === 'EXISTS' ? '✅' : '❌';
      console.log(`   ${emoji} ${field}: ${status}`);
    });
    
    if (allFieldsExist) {
      console.log('\n🎉 All annex fields are present!');
      
      // Get usage statistics
      const { data: contracts, error: statsError } = await supabase
        .from('contratos')
        .select('numero_contrato, is_anexo, parent_contrato_id, anexo_numero, nombre_ciclo');
        
      if (!statsError && contracts) {
        const mainContracts = contracts.filter(c => !c.is_anexo);
        const annexes = contracts.filter(c => c.is_anexo);
        
        console.log('\n📊 Current Usage:');
        console.log(`   Total contracts: ${contracts.length}`);
        console.log(`   Main contracts: ${mainContracts.length}`);
        console.log(`   Annexes: ${annexes.length}`);
        
        if (annexes.length > 0) {
          console.log('\n🔗 Active Annexes:');
          annexes.forEach(annex => {
            const parent = mainContracts.find(c => c.id === annex.parent_contrato_id);
            console.log(`   ${annex.numero_contrato} (${annex.nombre_ciclo || 'No cycle'}) -> Parent: ${parent?.numero_contrato || 'Unknown'}`);
          });
        }
      }
      
    } else {
      console.log('\n⚠️  Some annex fields are missing!');
      console.log('To add missing fields, run:');
      console.log('   node scripts/apply-annex-migration.js');
    }
    
    // Check for migration files
    console.log('\n📁 MIGRATION FILES VERIFICATION');
    console.log('-'.repeat(30));
    
    const fs = require('fs');
    const path = require('path');
    
    const migrationFiles = [
      'database/add-annex-support.sql',
      'supabase/migrations/'
    ];
    
    migrationFiles.forEach(filePath => {
      const fullPath = path.join(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(fullPath);
          console.log(`✅ ${filePath}: ${files.length} migration files`);
          files.forEach(file => console.log(`     - ${file}`));
        } else {
          console.log(`✅ ${filePath}: Available`);
        }
      } else {
        console.log(`❌ ${filePath}: Not found`);
      }
    });
    
    // Summary
    console.log('\n📝 SUMMARY');
    console.log('-'.repeat(30));
    
    if (allFieldsExist) {
      console.log('✅ Database schema is up to date');
      console.log('✅ Annex functionality is ready to use');
      console.log('✅ No migration needed');
      
      console.log('\n🚀 Next steps:');
      console.log('   - You can create annexes using the contract form');
      console.log('   - Annexes will be properly linked to parent contracts');
      console.log('   - All annex metadata (cycle, participants, etc.) is tracked');
    } else {
      console.log('⚠️  Database schema needs updating');
      console.log('🔧 Run the annex migration to add missing fields');
      console.log('📁 Migration file: database/add-annex-support.sql');
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

// Run the verification
verifyDatabaseSchema();