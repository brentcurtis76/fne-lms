#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixUsersData() {
  console.log('🔧 Fixing user names and roles...\n');
  
  // Read Excel to get correct data
  const workbook = XLSX.readFile('LISTADO DE INSCRIPCIÓN EN PLATAFORMA.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const excelUsers = XLSX.utils.sheet_to_json(worksheet);
  
  const validExcelUsers = excelUsers.filter(user => 
    user['Correo electrónico']?.trim() && 
    user['Nombre']?.trim() && 
    user['Apellido']?.trim()
  );
  
  console.log(`📊 Processing ${validExcelUsers.length} users\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const excelUser of validExcelUsers) {
    let email = excelUser['Correo electrónico'].trim().replace(/ñ/g, 'n');
    const firstName = excelUser['Nombre'].trim();
    const lastName = excelUser['Apellido'].trim();
    const role = excelUser['Rol']?.toLowerCase().trim() || 'docente';
    const school = excelUser['Colegio']?.trim();
    const generation = excelUser['Generación'];
    const community = excelUser['Comunidad de crecimiento']?.trim();
    
    try {
      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
        
      if (profileError || !profile) {
        console.log(`❌ ${email} - User not found`);
        errorCount++;
        continue;
      }
      
      // Update profile with names
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          school: school || null
        })
        .eq('id', profile.id);
        
      if (updateError) throw updateError;
      
      // Check if role exists
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', profile.id)
        .single();
        
      // Get school_id if needed for role
      let schoolId = null;
      if (role !== 'admin' && school) {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('id')
          .ilike('name', `%${school}%`)
          .single();
          
        if (schoolData) {
          schoolId = schoolData.id;
        } else {
          // If no school found by name, get any school (required for docente role)
          const { data: anySchool } = await supabase
            .from('schools')
            .select('id')
            .limit(1)
            .single();
            
          if (anySchool) {
            schoolId = anySchool.id;
            console.log(`   Using default school for ${email}`);
          }
        }
      }
      
      if (!existingRole) {
        // Insert role with school_id if required
        const roleData = {
          user_id: profile.id,
          role_type: role
        };
        
        if (role !== 'admin' && schoolId) {
          roleData.school_id = schoolId;
        }
        
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert(roleData);
          
        if (roleError) throw roleError;
      } else {
        // Update existing role
        const updateData = { role_type: role };
        if (role !== 'admin' && schoolId) {
          updateData.school_id = schoolId;
        }
        
        const { error: roleUpdateError } = await supabase
          .from('user_roles')
          .update(updateData)
          .eq('user_id', profile.id);
          
        if (roleUpdateError) throw roleUpdateError;
      }
      
      // Try to assign to school if specified
      if (school) {
        const { data: schoolData } = await supabase
          .from('schools')
          .select('id')
          .ilike('name', `%${school}%`)
          .single();
          
        if (schoolData) {
          // Check if assignment exists
          const { data: existingAssignment } = await supabase
            .from('user_school_assignments')
            .select('id')
            .eq('user_id', profile.id)
            .eq('school_id', schoolData.id)
            .single();
            
          if (!existingAssignment) {
            await supabase
              .from('user_school_assignments')
              .insert({
                user_id: profile.id,
                school_id: schoolData.id
              });
          }
        }
      }
      
      // Try to assign to community if specified
      if (community) {
        const { data: communityData } = await supabase
          .from('communities')
          .select('id')
          .ilike('name', `%${community}%`)
          .single();
          
        if (communityData) {
          // Check if assignment exists
          const { data: existingAssignment } = await supabase
            .from('user_community_assignments')
            .select('id')
            .eq('user_id', profile.id)
            .eq('community_id', communityData.id)
            .single();
            
          if (!existingAssignment) {
            await supabase
              .from('user_community_assignments')
              .insert({
                user_id: profile.id,
                community_id: communityData.id
              });
          }
        }
      }
      
      successCount++;
      console.log(`✅ Fixed: ${email} - ${firstName} ${lastName} (${role})`);
      
    } catch (error) {
      errorCount++;
      console.error(`❌ Error fixing ${email}: ${error.message}`);
    }
  }
  
  console.log('\n=== FIX SUMMARY ===');
  console.log(`✅ Successfully fixed: ${successCount} users`);
  console.log(`❌ Errors: ${errorCount} users`);
  console.log(`📊 Total processed: ${validExcelUsers.length} users`);
}

// Run the fix
fixUsersData().catch(console.error);