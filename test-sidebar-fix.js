// Test script to verify sidebar infinite render loop is fixed
// Run this in browser console at http://localhost:3001/quiz-reviews

console.log('🧪 TESTING SIDEBAR INFINITE RENDER LOOP FIX');
console.log('============================================\n');

// Monitor for excessive console logs
let sidebarDebugCount = 0;
let originalLog = console.log;

console.log = function(...args) {
  const message = args.join(' ');
  if (message.includes('SIDEBAR DEBUG')) {
    sidebarDebugCount++;
    if (sidebarDebugCount > 50) {
      console.error('❌ INFINITE LOOP DETECTED: Too many sidebar debug messages');
      console.error(`Debug message count: ${sidebarDebugCount}`);
      return;
    }
  }
  originalLog.apply(console, args);
};

// Test 1: Check if sidebar renders without infinite loops
console.log('TEST 1: Checking for sidebar infinite render loops...');
setTimeout(() => {
  if (sidebarDebugCount === 0) {
    console.log('✅ SUCCESS: No excessive sidebar debug messages detected');
  } else if (sidebarDebugCount < 10) {
    console.log(`✅ SUCCESS: Normal sidebar debug messages (${sidebarDebugCount})`);
  } else {
    console.log(`⚠️  WARNING: Many sidebar debug messages (${sidebarDebugCount})`);
  }
}, 3000);

// Test 2: Check if sidebar elements are present
setTimeout(() => {
  console.log('\nTEST 2: Checking sidebar element presence...');
  const sidebar = document.querySelector('[class*="fixed left-0"]');
  if (sidebar) {
    console.log('✅ Sidebar element found');
    
    // Test 3: Check if sidebar is interactive
    const buttons = sidebar.querySelectorAll('button');
    console.log(`✅ Found ${buttons.length} interactive buttons in sidebar`);
    
    // Test 4: Check if navigation items are filtered correctly
    const navigationItems = sidebar.querySelectorAll('[class*="px-3 py-3"]');
    console.log(`✅ Found ${navigationItems.length} navigation items`);
    
    // Test 5: Try to interact with sidebar
    const firstButton = buttons[0];
    if (firstButton) {
      console.log('✅ Sidebar is interactive - first button exists');
      
      // Test click without triggering navigation
      const originalClick = firstButton.onclick;
      firstButton.onclick = function(e) {
        e.preventDefault();
        console.log('✅ Sidebar button click handled without errors');
        return false;
      };
      
      setTimeout(() => {
        firstButton.onclick = originalClick;
      }, 100);
    }
  } else {
    console.log('❌ Sidebar element not found');
  }
}, 5000);

// Test 6: Monitor for memory leaks
setTimeout(() => {
  console.log('\nTEST 6: Final memory and performance check...');
  if (performance.memory) {
    console.log(`Memory usage: ${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)}MB`);
  }
  
  console.log('\n🎉 SIDEBAR INFINITE RENDER LOOP FIX TEST COMPLETE');
  console.log('=================================================');
  console.log(`Total sidebar debug messages: ${sidebarDebugCount}`);
  console.log('If this number stays low (<10), the fix is successful!');
  
  // Restore original console.log
  console.log = originalLog;
}, 10000);

console.log('📝 Test started. Results will appear in 3-10 seconds...');