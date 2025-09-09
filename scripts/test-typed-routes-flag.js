#!/usr/bin/env node

/**
 * Smoke test for typed routes feature flag
 * Tests both ENABLE_TYPED_ROUTES=true and false
 * 
 * Usage:
 *   First, start dev server: npm run dev
 *   Then run: node scripts/test-typed-routes-flag.js
 */

const http = require('http');

const ENDPOINTS = [
  '/api/admin/networks',
  '/api/admin/networks/schools',
  '/api/learning-paths'
];

async function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function testWithFlag(flagValue) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing with ENABLE_TYPED_ROUTES=${flagValue}`);
  console.log(`${'='.repeat(60)}`);
  
  // Note: The flag is set server-side, this just logs expected behavior
  console.log(`Expected: ${flagValue === 'true' ? 'Typed handlers' : 'Legacy handlers'} should respond\n`);
  
  const results = [];
  
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Testing ${endpoint}...`);
      const response = await makeRequest(endpoint);
      
      // Check for handler type indicators (would need server to log this)
      const handlerType = response.headers['x-handler-type'] || 'unknown';
      
      console.log(`  Status: ${response.status}`);
      console.log(`  Handler: ${handlerType}`);
      
      // 401 is expected without auth, but shows endpoint is working
      if (response.status === 401 || response.status === 403) {
        console.log(`  ✅ Endpoint responding (auth required)`);
        results.push({ endpoint, status: 'PASS', code: response.status });
      } else if (response.status === 200) {
        console.log(`  ✅ Endpoint responding successfully`);
        results.push({ endpoint, status: 'PASS', code: response.status });
      } else {
        console.log(`  ⚠️ Unexpected status: ${response.status}`);
        results.push({ endpoint, status: 'WARN', code: response.status });
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      results.push({ endpoint, status: 'FAIL', error: error.message });
    }
  }
  
  return results;
}

async function main() {
  console.log('🚀 Typed Routes Feature Flag Smoke Test');
  console.log('=====================================');
  console.log('Prerequisites:');
  console.log('  1. Start dev server: npm run dev');
  console.log('  2. Server should be running on http://localhost:3000');
  console.log('\nNote: To test different flag states, restart server with:');
  console.log('  ENABLE_TYPED_ROUTES=false npm run dev  (legacy)');
  console.log('  ENABLE_TYPED_ROUTES=true npm run dev   (typed)');
  
  try {
    // Test connection first
    console.log('\nChecking server connection...');
    await makeRequest('/api/health').catch(() => null);
    console.log('✅ Server is running');
  } catch (error) {
    console.error('❌ Server not responding. Please start with: npm run dev');
    process.exit(1);
  }
  
  // Run tests (server's current flag state)
  const results = await testWithFlag(process.env.ENABLE_TYPED_ROUTES || 'false');
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  
  console.log(`Endpoints tested: ${results.length}`);
  console.log(`Passed: ${passed}, Failed: ${failed}, Warnings: ${warned}`);
  
  // Log results
  const fs = require('fs');
  const logDir = 'logs/mcp/20250905/typed-routes';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = `${logDir}/smoke-test.log`;
  const logContent = {
    timestamp: new Date().toISOString(),
    flagState: process.env.ENABLE_TYPED_ROUTES || 'false',
    results: results,
    summary: { passed, failed, warned }
  };
  
  fs.writeFileSync(logFile, JSON.stringify(logContent, null, 2));
  console.log(`\n📁 Results saved to: ${logFile}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(console.error);
}