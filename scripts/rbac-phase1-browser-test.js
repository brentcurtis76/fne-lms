// ============================================================================
// RBAC Phase 1 Browser Test Script
// Run this in the browser console while logged in as superadmin
// ============================================================================

// Store test run ID globally for cleanup
let testRunId = null;

// Helper function to print results nicely
function logResult(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(data, null, 2));
}

// Step 1: Dry-run test (preview only)
async function testDryRun() {
  console.log('\n🔍 STEP 1: DRY-RUN TEST');
  
  const response = await fetch('/api/admin/roles/permissions/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      role_type: 'docente',
      permission_key: 'create_course',
      granted: true,
      reason: 'Prueba Fase 1 (dry-run)',
      dry_run: true
    })
  });
  
  const data = await response.json();
  logResult('DRY-RUN RESULT', data);
  
  if (!response.ok) {
    console.error('❌ Dry-run failed:', data.error);
    return false;
  }
  
  console.log('✅ Dry-run successful - would create overlay');
  return true;
}

// Step 2: Apply real overlay
async function applyOverlay() {
  console.log('\n🚀 STEP 2: APPLYING REAL OVERLAY');
  
  const response = await fetch('/api/admin/roles/permissions/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      role_type: 'docente',
      permission_key: 'create_course',
      granted: true,
      reason: 'Prueba Fase 1 - Test overlay from browser'
    })
  });
  
  const data = await response.json();
  logResult('OVERLAY CREATION RESULT', data);
  
  if (!response.ok) {
    console.error('❌ Overlay creation failed:', data.error);
    return false;
  }
  
  // Store test run ID for cleanup
  testRunId = data.test_run_id || data.overlay?.test_run_id;
  
  console.log('✅ Overlay created successfully');
  console.log('📝 Test Run ID:', testRunId);
  console.log('🔄 Now refresh the page to see the change in the matrix');
  
  return true;
}

// Step 3: Preview cleanup
async function previewCleanup() {
  console.log('\n👀 STEP 3: PREVIEW CLEANUP');
  
  if (!testRunId) {
    console.error('❌ No test run ID found. Run applyOverlay() first.');
    return false;
  }
  
  const response = await fetch('/api/admin/test-runs/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ 
      test_run_id: testRunId, 
      confirm: false 
    })
  });
  
  const data = await response.json();
  logResult('CLEANUP PREVIEW RESULT', data);
  
  if (!response.ok) {
    console.error('❌ Cleanup preview failed:', data.error);
    return false;
  }
  
  console.log('✅ Cleanup preview successful');
  console.log(`📊 Would remove ${data.preview?.overlays_to_remove || 0} overlays`);
  
  return true;
}

// Step 4: Confirm cleanup
async function confirmCleanup() {
  console.log('\n🧹 STEP 4: CONFIRMING CLEANUP');
  
  if (!testRunId) {
    console.error('❌ No test run ID found. Run applyOverlay() first.');
    return false;
  }
  
  const response = await fetch('/api/admin/test-runs/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ 
      test_run_id: testRunId, 
      confirm: true 
    })
  });
  
  const data = await response.json();
  logResult('CLEANUP CONFIRM RESULT', data);
  
  if (!response.ok) {
    console.error('❌ Cleanup failed:', data.error);
    return false;
  }
  
  console.log('✅ Cleanup successful');
  console.log(`🗑️ Removed ${data.removed_count || 0} overlays`);
  console.log('🔄 Refresh the page to confirm matrix is back to baseline');
  
  // Clear stored test run ID
  testRunId = null;
  
  return true;
}

// Run all steps in sequence
async function runFullTest() {
  console.log('🎯 STARTING FULL RBAC PHASE 1 TEST');
  console.log('=====================================');
  
  // Step 1: Dry-run
  const dryRunOk = await testDryRun();
  if (!dryRunOk) {
    console.error('❌ Test aborted due to dry-run failure');
    return;
  }
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Step 2: Apply overlay
  const overlayOk = await applyOverlay();
  if (!overlayOk) {
    console.error('❌ Test aborted due to overlay creation failure');
    return;
  }
  
  console.log('\n⏸️ PAUSE: Please refresh the page and verify "Docente" now has "CREATE COURSE" permission');
  console.log('Then run: previewCleanup() and confirmCleanup()');
}

// Instructions
console.log('📖 RBAC PHASE 1 TEST SCRIPT LOADED');
console.log('====================================');
console.log('Available commands:');
console.log('  runFullTest()     - Run steps 1-2 (dry-run and apply)');
console.log('  previewCleanup()  - Preview what cleanup would do');
console.log('  confirmCleanup()  - Actually clean up the test overlay');
console.log('');
console.log('Or run individual steps:');
console.log('  testDryRun()      - Test dry-run only');
console.log('  applyOverlay()    - Apply real overlay');
console.log('');
console.log('Start with: runFullTest()');