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

async function verifyUsers() {
  console.log('🔍 Verifying user import...\n');
  
  // Read Excel to get expected data
  const workbook = XLSX.readFile('LISTADO DE INSCRIPCIÓN EN PLATAFORMA.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const excelUsers = XLSX.utils.sheet_to_json(worksheet);
  
  const validExcelUsers = excelUsers.filter(user => 
    user['Correo electrónico']?.trim() && 
    user['Nombre']?.trim() && 
    user['Apellido']?.trim()
  );
  
  console.log(`📊 Excel file has ${validExcelUsers.length} valid users\n`);
  
  // Check each user
  for (const excelUser of validExcelUsers) {
    let email = excelUser['Correo electrónico'].trim().replace(/ñ/g, 'n');
    const expectedFirstName = excelUser['Nombre'].trim();
    const expectedLastName = excelUser['Apellido'].trim();
    const expectedRole = excelUser['Rol']?.toLowerCase().trim() || 'docente';
    
    // Get profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', email)
      .single();
      
    if (profileError || !profile) {
      console.log(`❌ ${email} - NOT FOUND in database`);
      continue;
    }
    
    // Get role data
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', profile.id);
      
    const userRole = roles && roles.length > 0 ? roles[0].role_type : 'NO ROLE';
    
    // Check if data matches
    const nameMatch = profile.first_name === expectedFirstName && profile.last_name === expectedLastName;
    const roleMatch = userRole === expectedRole;
    
    if (!nameMatch || !roleMatch) {
      console.log(`⚠️  ${email}:`);
      if (!nameMatch) {
        console.log(`   Name mismatch - DB: "${profile.first_name} ${profile.last_name}" vs Excel: "${expectedFirstName} ${expectedLastName}"`);
      }
      if (!roleMatch) {
        console.log(`   Role mismatch - DB: "${userRole}" vs Excel: "${expectedRole}"`);
      }
    } else {
      console.log(`✅ ${email} - Name and role correct`);
    }
  }
  
  console.log('\n📋 Checking a sample user in detail...');
  const sampleEmail = 'maria.pinto@lisamvallenar.cl';
  
  const { data: sampleProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', sampleEmail)
    .single();
    
  console.log('\nSample user profile:', JSON.stringify(sampleProfile, null, 2));
}

verifyUsers().catch(console.error);