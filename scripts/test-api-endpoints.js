#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Since we're running locally, we'll start a minimal Express server to test the API endpoints
const express = require('express');
const app = express();
app.use(express.json());

// Import the API handlers
const assignRoleHandler = require('../pages/api/admin/assign-role').default;
const removeRoleHandler = require('../pages/api/admin/remove-role').default;

// Test configuration
const MORA_EMAIL = 'mdelfresno@nuevaeducacion.org';
const TEST_USER_EMAIL = 'makarena.saldana@lisamvallenar.cl';

async function setupTestServer() {
  // Mount the API endpoints
  app.post('/api/admin/assign-role', (req, res) => {
    // Simulate Next.js API request/response
    req.headers.authorization = req.headers.authorization || `Bearer test-token`;
    assignRoleHandler(req, res);
  });

  app.post('/api/admin/remove-role', (req, res) => {
    req.headers.authorization = req.headers.authorization || `Bearer test-token`;
    removeRoleHandler(req, res);
  });

  const server = app.listen(0); // Random port
  const port = server.address().port;
  return { server, port };
}

async function testAPIEndpoints() {
  console.log('🧪 Testing API Endpoints for Role Assignment\n');

  let server;
  try {
    // Setup test server
    const { server: testServer, port } = await setupTestServer();
    server = testServer;
    const baseUrl = `http://localhost:${port}`;

    // Get Mora's data
    const { data: moraProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', MORA_EMAIL)
      .single();

    // Get test user
    const { data: testUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', TEST_USER_EMAIL)
      .single();

    // Get Mora's session token (simulate)
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    const moraAuthUser = users?.find(u => u.email === MORA_EMAIL);
    
    if (!moraAuthUser) {
      throw new Error('Could not find Mora in auth users');
    }

    // Create a mock session for Mora
    const { data: session, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: MORA_EMAIL,
    });

    console.log('1️⃣ Testing assign-role endpoint...');
    
    // Test assign role endpoint
    const assignResponse = await fetch(`${baseUrl}/api/admin/assign-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${moraAuthUser.id}` // Mock token
      },
      body: JSON.stringify({
        targetUserId: testUser.id,
        roleType: 'docente',
        assignedBy: moraProfile.id,
        organizationalScope: {
          schoolId: 21 // Los Pellines
        }
      })
    });

    const assignResult = await assignResponse.json();
    console.log('Assign role response:', assignResult);

    if (assignResponse.ok) {
      console.log('✅ Assign role endpoint working!');
    } else {
      console.log('❌ Assign role endpoint failed:', assignResult.error);
    }

    // Clean up by removing the role
    if (assignResult.roleId) {
      console.log('\n2️⃣ Testing remove-role endpoint...');
      
      const removeResponse = await fetch(`${baseUrl}/api/admin/remove-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${moraAuthUser.id}`
        },
        body: JSON.stringify({
          roleId: assignResult.roleId,
          removedBy: moraProfile.id
        })
      });

      const removeResult = await removeResponse.json();
      console.log('Remove role response:', removeResult);

      if (removeResponse.ok) {
        console.log('✅ Remove role endpoint working!');
      } else {
        console.log('❌ Remove role endpoint failed:', removeResult.error);
      }
    }

    console.log('\n✅ API endpoint tests completed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (server) {
      server.close();
    }
  }
}

// Check if express is installed
try {
  require('express');
  testAPIEndpoints();
} catch (e) {
  console.log('📦 Installing express for testing...');
  require('child_process').execSync('npm install express --save-dev', { stdio: 'inherit' });
  testAPIEndpoints();
}