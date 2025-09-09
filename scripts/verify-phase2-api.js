const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Production database credentials
const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E',
  { auth: { persistSession: false } }
);

async function testAPI() {
  let output = '=== RBAC Phase 2 API Verification ===\n';
  output += `Timestamp: ${new Date().toISOString()}\n`;
  output += 'Base URL: http://localhost:3000\n\n';

  // 1. Sign in to get a token
  output += '1. Authentication\n';
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'brentcurtis76@gmail.com',
    password: 'mBX5XBdp'
  });

  if (authError) {
    output += `   ❌ Failed to authenticate: ${authError.message}\n`;
    console.log(output);
    return;
  }

  const token = authData.session.access_token;
  output += `   ✅ Successfully authenticated\n`;
  output += `   User ID: ${authData.user.id}\n\n`;

  // 2. Test is-superadmin endpoint
  output += '2. GET /api/admin/auth/is-superadmin\n';
  try {
    const superadminRes = await fetch('http://localhost:3000/api/admin/auth/is-superadmin', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const superadminData = await superadminRes.json();
    output += `   Status: ${superadminRes.status}\n`;
    output += `   Response: ${JSON.stringify(superadminData, null, 2)}\n\n`;
  } catch (err) {
    output += `   ❌ Error: ${err.message}\n\n`;
  }

  // 3. Test permissions endpoint
  output += '3. GET /api/admin/roles/permissions\n';
  try {
    const permRes = await fetch('http://localhost:3000/api/admin/roles/permissions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const permData = await permRes.json();
    output += `   Status: ${permRes.status}\n`;
    if (permRes.ok) {
      output += `   is_mock: ${permData.is_mock}\n`;
      output += `   test_mode: ${permData.test_mode}\n`;
      output += `   Roles found: ${Object.keys(permData.permissions || {}).length}\n`;
      output += `   Sample permissions:\n`;
      const roles = Object.keys(permData.permissions || {}).slice(0, 2);
      roles.forEach(role => {
        const perms = Object.keys(permData.permissions[role]).slice(0, 3);
        perms.forEach(perm => {
          output += `     ${role}.${perm}: ${permData.permissions[role][perm]}\n`;
        });
      });
    } else {
      output += `   Error: ${JSON.stringify(permData)}\n`;
    }
    output += '\n';
  } catch (err) {
    output += `   ❌ Error: ${err.message}\n\n`;
  }

  // 4. Test overlay endpoint with dry_run
  output += '4. POST /api/admin/roles/permissions/overlay (dry_run)\n';
  try {
    const overlayRes = await fetch('http://localhost:3000/api/admin/roles/permissions/overlay', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dry_run: true,
        changes: [{
          role_type: 'docente',
          permission_key: 'view_reports',
          granted: false
        }]
      })
    });
    const overlayData = await overlayRes.json();
    output += `   Status: ${overlayRes.status}\n`;
    output += `   Response: ${JSON.stringify(overlayData, null, 2)}\n\n`;
  } catch (err) {
    output += `   ❌ Error: ${err.message}\n\n`;
  }

  // 5. Test without token (should fail)
  output += '5. GET /api/admin/roles/permissions (no token)\n';
  try {
    const noAuthRes = await fetch('http://localhost:3000/api/admin/roles/permissions');
    output += `   Status: ${noAuthRes.status} (expect 401)\n`;
    const noAuthData = await noAuthRes.json();
    output += `   Response: ${JSON.stringify(noAuthData)}\n\n`;
  } catch (err) {
    output += `   ❌ Error: ${err.message}\n\n`;
  }

  // 6. Test with feature flag disabled
  output += '6. Testing feature flag enforcement\n';
  output += '   Note: Would require server restart with FEATURE_SUPERADMIN_RBAC=false\n';
  output += '   Skipping to avoid disrupting current test\n\n';

  output += '=== API Verification Complete ===\n';

  // Save to log file
  const logPath = path.join(__dirname, '..', 'logs', 'mcp', '20250909', 'api-phase2-local.txt');
  fs.writeFileSync(logPath, output);
  
  console.log(output);
  console.log(`\nLog saved to: ${logPath}`);
}

testAPI().catch(console.error);