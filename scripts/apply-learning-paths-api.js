#!/usr/bin/env node

/**
 * Apply Learning Paths Migration via Supabase API
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

async function applyMigration() {
  console.log('🚀 Applying Learning Paths migration via API...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'learning-paths-rpc-functions.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded successfully');
    
    // Use the Supabase REST API directly
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc`;
    
    // First, let's check if we can execute raw SQL
    const testQuery = "SELECT 1 as test";
    
    const testResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: testQuery
      })
    });

    console.log('Test query response status:', testResponse.status);
    
    if (!testResponse.ok) {
      console.log('\n⚠️  Direct SQL execution not available via REST API\n');
      console.log('Please apply the migration manually:');
      console.log('1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
      console.log('2. Copy the contents of:', migrationPath);
      console.log('3. Paste into the SQL editor');
      console.log('4. Click "Run" to execute\n');
      console.log('The migration will create these functions:');
      console.log('- create_full_learning_path');
      console.log('- update_full_learning_path');
      console.log('- batch_assign_learning_path\n');
      
      // Also save to a convenient location
      const outputPath = path.join(process.env.HOME, 'Desktop', 'learning-paths-migration.sql');
      await fs.writeFile(outputPath, migrationSQL);
      console.log('💾 Migration SQL has been saved to your Desktop:', outputPath);
      console.log('\nYou can copy it from there and paste into Supabase SQL Editor.');
      
      return;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyMigration();