#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function updatePasswords() {
  console.log('📚 Reading Excel file to get user list...');
  
  const workbook = XLSX.readFile('LISTADO DE INSCRIPCIÓN EN PLATAFORMA.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const users = XLSX.utils.sheet_to_json(worksheet);
  
  // Filter out empty rows
  const validUsers = users.filter(user => 
    user['Correo electrónico']?.trim() && 
    user['Nombre']?.trim() && 
    user['Apellido']?.trim()
  );
  
  console.log(`✅ Found ${validUsers.length} valid users\n`);
  console.log('🔑 Updating passwords to FNE123! for all users...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const user of validUsers) {
    let email = user['Correo electrónico'].trim();
    // Fix special characters
    email = email.replace(/ñ/g, 'n');
    
    try {
      // Get user ID from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
        
      if (profileError || !profile) {
        console.log(`⏭️  Skipping ${email} - user not found`);
        continue;
      }
      
      // Update password
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        profile.id,
        { password: 'FNE123!' }
      );
      
      if (updateError) throw updateError;
      
      // Update profile to require password change
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', profile.id);
        
      if (profileUpdateError) {
        console.warn(`⚠️  Password updated but couldn't set must_change_password for ${email}`);
      }
      
      successCount++;
      console.log(`✅ Updated password for: ${email}`);
      
    } catch (error) {
      errorCount++;
      console.error(`❌ Error updating ${email}: ${error.message}`);
    }
  }
  
  console.log('\n=== UPDATE SUMMARY ===');
  console.log(`✅ Successfully updated: ${successCount} users`);
  console.log(`❌ Errors: ${errorCount} users`);
  console.log(`📊 Total processed: ${validUsers.length} users`);
  
  console.log('\n=== IMPORTANT NOTES ===');
  console.log('1. All updated users now have password: FNE123!');
  console.log('2. Users will be forced to change their password on first login');
  console.log('3. If any users were skipped, they may not exist in the system yet');
}

// Run the update
updatePasswords().catch(console.error);