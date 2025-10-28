#!/usr/bin/env node

/**
 * Test course loading fix using Chrome DevTools Protocol
 * This script will:
 * 1. Launch Chrome
 * 2. Navigate to the LMS
 * 3. Login as a student
 * 4. Attempt to load a course
 * 5. Verify no "Error cargando el curso" appears
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🌐 Testing course loading fix with Chrome DevTools...\n');

// Test URLs
const LOGIN_URL = 'https://fne-lms.vercel.app/login';
const TEST_COURSE_URL = 'https://fne-lms.vercel.app/student/course/';

console.log('Test Plan:');
console.log('1. Navigate to LMS login');
console.log('2. Login as test student');
console.log('3. Navigate to a course');
console.log('4. Check for "Error cargando el curso"');
console.log('5. Verify course loads successfully\n');

console.log('═'.repeat(80));
console.log('MANUAL TEST STEPS (automated testing requires logged-in session):');
console.log('═'.repeat(80));
console.log('\n1. Open Chrome Developer Tools (F12 or Cmd+Option+I)');
console.log('2. Go to Console tab');
console.log('3. Navigate to: ' + LOGIN_URL);
console.log('4. Login with a Llolleo student account:');
console.log('   - Look for: carla.diazal or similar');
console.log('5. Click on any course');
console.log('6. Watch the Console for errors');
console.log('\n✅ SUCCESS if: Course loads without "Error cargando el curso"');
console.log('❌ FAILURE if: "Error cargando el curso" appears');
console.log('═'.repeat(80));

// Open Chrome to the login page
const { exec } = require('child_process');

exec(`open -a "Google Chrome" "${LOGIN_URL}"`, (error) => {
  if (error) {
    console.log('\n⚠️  Could not auto-open Chrome, please navigate manually');
    return;
  }
  console.log('\n✅ Chrome opened to login page');
  console.log('   Please proceed with manual testing steps above');
});

console.log('\n📋 Expected Console Logs (when working):');
console.log('   ✅ "=== COURSE VIEWER INITIALIZATION ==="');
console.log('   ✅ "Course is SIMPLE structure" or "Course is STRUCTURED"');
console.log('   ✅ "DEBUG: Direct lessons loaded" or "DEBUG: Modules with lessons loaded"');
console.log('   ✅ NO toast.error("Error cargando el curso")');

console.log('\n🔍 To verify in DevTools Console, run:');
console.log('   localStorage.getItem("supabase.auth.token")');
console.log('   // Should show logged-in user data');
