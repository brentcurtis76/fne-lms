#!/usr/bin/env node

/**
 * Script to apply the fix for community leader role assignment
 * without generations when school has generations disabled
 */

const fs = require('fs').promises;
const path = require('path');

async function generateInstructions() {
  try {
    console.log('🔧 Community Leader Without Generations Fix\n');
    console.log('This fix allows assigning community leader roles to users in schools');
    console.log('that have generations disabled, without requiring a generation selection.\n');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'fix-community-leader-without-generation.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');
    
    console.log('📋 Steps to apply the fix:\n');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to the SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Copy and paste the following SQL:\n');
    console.log('=' .repeat(80));
    console.log(sql);
    console.log('=' .repeat(80));
    console.log('\n5. Click "Run" to execute the fix\n');
    
    console.log('✅ What this fix does:');
    console.log('   - Updates the check_community_organization() function');
    console.log('   - Allows communities without generation_id for schools with has_generations=false');
    console.log('   - Prevents "generation_id is required" error for these schools');
    console.log('   - Maintains backward compatibility\n');
    
    console.log('🎯 After applying this fix:');
    console.log('   - You can assign "Líder de Comunidad" role without selecting a generation');
    console.log('   - The community will be created directly under the school');
    console.log('   - Schools with generations enabled still require generation selection\n');
    
    console.log('⚠️  Note: The frontend has also been updated to:');
    console.log('   - Show clearer messages when school has no generations');
    console.log('   - Prevent assigning "Líder de Generación" role to schools without generations');
    console.log('   - Mark generation as optional for community leaders in no-generation schools\n');
    
  } catch (error) {
    console.error('❌ Error reading fix file:', error);
  }
}

// Run the instructions
generateInstructions();