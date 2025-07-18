#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

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

async function uploadUsers() {
  console.log('📚 Reading Excel file...');
  
  const workbook = XLSX.readFile('LISTADO DE INSCRIPCIÓN EN PLATAFORMA.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const users = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`✅ Found ${users.length} users to upload\n`);
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  // Process users in batches to avoid overwhelming the database
  const batchSize = 10;
  
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);
    const promises = batch.map(async (user, index) => {
      let email = user['Correo electrónico']?.trim();
      const firstName = user['Nombre']?.trim();
      const lastName = user['Apellido']?.trim();
      const role = user['Rol']?.toLowerCase().trim();
      const school = user['Colegio']?.trim();
      const generation = user['Generación'];
      const community = user['Comunidad de crecimiento']?.trim();
      
      // Fix email with special characters (ñ -> n)
      if (email) {
        email = email.replace(/ñ/g, 'n');
      }
      
      if (!email || !firstName || !lastName) {
        errors.push({
          row: i + index + 2,
          email: email || 'N/A',
          error: 'Missing required fields (email, name, or lastname)'
        });
        errorCount++;
        return;
      }
      
      try {
        // 1. Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: email,
          password: 'FNE123!',
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName
          }
        });
        
        if (authError) {
          if (authError.message.includes('already exists')) {
            errors.push({
              row: i + index + 2,
              email: email,
              error: 'User already exists'
            });
            errorCount++;
            return;
          }
          throw authError;
        }
        
        // 2. Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: email,
            first_name: firstName,
            last_name: lastName,
            must_change_password: true
          });
          
        if (profileError) throw profileError;
        
        // 3. Assign role (default to 'docente' if not specified)
        const roleType = role || 'docente';
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role_type: roleType
          });
          
        if (roleError) throw roleError;
        
        // 4. Assign to school if specified
        if (school) {
          // First, find the school
          const { data: schoolData, error: schoolError } = await supabase
            .from('schools')
            .select('id')
            .ilike('name', `%${school}%`)
            .single();
            
          if (schoolData) {
            const { error: assignError } = await supabase
              .from('user_school_assignments')
              .insert({
                user_id: authData.user.id,
                school_id: schoolData.id
              });
              
            if (assignError) console.warn(`Warning: Could not assign user to school: ${assignError.message}`);
          }
        }
        
        // 5. Assign to community if specified
        if (community) {
          // Find the community
          const { data: communityData, error: communityError } = await supabase
            .from('communities')
            .select('id')
            .ilike('name', `%${community}%`)
            .single();
            
          if (communityData) {
            const { error: assignError } = await supabase
              .from('user_community_assignments')
              .insert({
                user_id: authData.user.id,
                community_id: communityData.id
              });
              
            if (assignError) console.warn(`Warning: Could not assign user to community: ${assignError.message}`);
          }
        }
        
        successCount++;
        console.log(`✅ Created user: ${email}`);
        
      } catch (error) {
        errors.push({
          row: i + index + 2,
          email: email,
          error: error.message
        });
        errorCount++;
        console.error(`❌ Error creating user ${email}: ${error.message}`);
      }
    });
    
    // Wait for batch to complete
    await Promise.all(promises);
    
    console.log(`\nProgress: ${Math.min(i + batchSize, users.length)}/${users.length} processed`);
  }
  
  // Summary
  console.log('\n=== UPLOAD SUMMARY ===');
  console.log(`✅ Successfully created: ${successCount} users`);
  console.log(`❌ Errors: ${errorCount} users`);
  console.log(`📊 Total processed: ${users.length} users`);
  
  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    errors.forEach(err => {
      console.log(`Row ${err.row} - ${err.email}: ${err.error}`);
    });
    
    // Write errors to file
    const errorFile = 'bulk-upload-errors.json';
    fs.writeFileSync(errorFile, JSON.stringify(errors, null, 2));
    console.log(`\n📄 Error details saved to: ${errorFile}`);
  }
  
  console.log('\n=== IMPORTANT NOTES ===');
  console.log('1. All users have been created with password: FNE123!');
  console.log('2. Users will be forced to change their password on first login');
  console.log('3. School and community assignments were attempted based on name matching');
  console.log('4. Review any warnings above for assignments that may need manual correction');
}

// Run the upload
uploadUsers().catch(console.error);