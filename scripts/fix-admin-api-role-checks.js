const fs = require('fs');
const path = require('path');

// List of admin API files that need to be updated
const adminApiFiles = [
  'pages/api/admin/check-permissions.ts',
  'pages/api/admin/user-roles.ts',
  'pages/api/admin/retrieve-import-passwords.ts',
  'pages/api/admin/notification-types.ts',
  'pages/api/admin/system-updates.ts',
  'pages/api/admin/schools.ts',
  'pages/api/admin/notification-analytics.ts',
  'pages/api/admin/consultant-assignment-users.ts',
  'pages/api/admin/bulk-create-users.ts',
  'pages/api/admin/approve-user.ts'
];

console.log('🔧 Fixing admin API role checks to use user_roles table...\n');

let filesFixed = 0;
let filesSkipped = 0;

adminApiFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${file}`);
    filesSkipped++;
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Pattern 1: Simple profile?.role check
  const pattern1 = /const\s*{\s*data:\s*profile[^}]*}\s*=\s*await\s+supabase[\s\S]*?\.from\(['"]profiles['"]\)[\s\S]*?\.select\(['"]role['"]\)[\s\S]*?\.single\(\);[\s\S]*?if\s*\([^)]*profile\?\.role\s*!==\s*['"]admin['"]/g;
  
  // Pattern 2: profileData?.role check
  const pattern2 = /const\s*{\s*data:\s*profileData[^}]*}\s*=\s*await\s+supabase[\s\S]*?\.from\(['"]profiles['"]\)[\s\S]*?\.select\(['"]role['"]\)[\s\S]*?\.single\(\);[\s\S]*?profileData\?\.role\s*===\s*['"]admin['"]/g;
  
  // Check if file needs updating
  if (!content.includes('.from(\'profiles\')') || !content.includes('.select(\'role\')')) {
    console.log(`✅ ${file} - Already updated or doesn't need fixing`);
    filesSkipped++;
    return;
  }
  
  // Replace the patterns
  // For pattern like profile?.role !== 'admin'
  content = content.replace(
    /const\s*{\s*data:\s*profile,\s*error:\s*profileError\s*}\s*=\s*await\s+supabase\s*\.from\(['"]profiles['"]\)\s*\.select\(['"]role['"]\)\s*\.eq\(['"]id['"]\s*,\s*user\.id\)\s*\.single\(\);\s*if\s*\(\s*profileError\s*\|\|\s*profile\?\.role\s*!==\s*['"]admin['"]\s*\)/g,
    `const { data: adminRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!adminRole)`
  );
  
  // For pattern like profileData?.role === 'admin'
  content = content.replace(
    /const\s*{\s*data:\s*profileData\s*}\s*=\s*await\s+supabaseAdmin\s*\.from\(['"]profiles['"]\)\s*\.select\(['"]role['"]\)\s*\.eq\(['"]id['"]\s*,\s*user\.id\)\s*\.single\(\);/g,
    `const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();`
  );
  
  // Replace profileData?.role === 'admin' checks
  content = content.replace(/profileData\?\.role\s*===\s*['"]admin['"]/g, 'adminRole !== null');
  
  // Replace isAdminFromProfile variable
  content = content.replace(/const\s+isAdminFromProfile\s*=\s*profileData\?\.role\s*===\s*['"]admin['"];?/g, 'const isAdminFromRoles = adminRole !== null;');
  content = content.replace(/!isAdminFromMetadata\s*&&\s*!isAdminFromProfile/g, '!isAdminFromMetadata && !isAdminFromRoles');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed: ${file}`);
    filesFixed++;
  } else {
    console.log(`⚠️  ${file} - Pattern not found, manual fix needed`);
    filesSkipped++;
  }
});

console.log(`\n📊 Summary:`);
console.log(`   - Files fixed: ${filesFixed}`);
console.log(`   - Files skipped: ${filesSkipped}`);
console.log(`   - Total files: ${adminApiFiles.length}`);

if (filesFixed > 0) {
  console.log('\n✅ Admin API role checks updated to use user_roles table!');
  console.log('🚀 Next steps:');
  console.log('   1. Build the project: npm run build');
  console.log('   2. Commit and push the changes');
  console.log('   3. Test admin functionality after deployment');
}