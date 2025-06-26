#!/usr/bin/env node

/**
 * Test script for bulk user import functionality
 * This script generates sample CSV data and tests the parsing
 */

const { parseBulkUserData, generateSampleCSV, exportAsCSV } = require('../utils/bulkUserParser');
const { validateRut } = require('../utils/rutValidation');
const { generatePassword } = require('../utils/passwordGenerator');

console.log('🧪 Testing Bulk User Import Functionality\n');

// Test 1: Generate sample CSV
console.log('1️⃣ Generating sample CSV data...');
const sampleCSV = generateSampleCSV(5);
console.log('Sample CSV:');
console.log(sampleCSV);
console.log('\n');

// Test 2: Parse the sample CSV
console.log('2️⃣ Parsing sample CSV data...');
const parseResult = parseBulkUserData(sampleCSV);
console.log(`✅ Valid users: ${parseResult.valid.length}`);
console.log(`❌ Invalid users: ${parseResult.invalid.length}`);
console.log(`⚠️  Users with warnings: ${parseResult.summary.hasWarnings}`);
console.log('\n');

// Test 3: Show parsed users
console.log('3️⃣ Parsed user details:');
parseResult.valid.forEach((user, index) => {
  console.log(`User ${index + 1}:`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Name: ${user.firstName} ${user.lastName}`);
  console.log(`  Role: ${user.role}`);
  console.log(`  RUT: ${user.rut || 'Not provided'}`);
  console.log(`  Password: ${user.password}`);
  console.log('');
});

// Test 4: Test with invalid data
console.log('4️⃣ Testing with invalid data...');
const invalidCSV = `email,firstName,lastName,role,rut
invalid-email,John,Doe,admin,invalid-rut
,Jane,Smith,docente,11.111.111-1
test@example.com,,,invalid_role,`;

const invalidResult = parseBulkUserData(invalidCSV);
console.log(`✅ Valid users: ${invalidResult.valid.length}`);
console.log(`❌ Invalid users: ${invalidResult.invalid.length}`);

if (invalidResult.invalid.length > 0) {
  console.log('\nInvalid user errors:');
  invalidResult.invalid.forEach((user) => {
    console.log(`  Row ${user.rowNumber}: ${user.errors?.join(', ')}`);
  });
}
console.log('\n');

// Test 5: Test RUT validation
console.log('5️⃣ Testing RUT validation...');
const testRuts = ['11.111.111-1', '12.345.678-5', '5.126.663-3', 'invalid-rut'];
testRuts.forEach(rut => {
  const isValid = validateRut(rut);
  console.log(`  ${rut}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
});
console.log('\n');

// Test 6: Test password generation
console.log('6️⃣ Testing password generation...');
for (let i = 0; i < 5; i++) {
  const password = generatePassword();
  console.log(`  Generated password ${i + 1}: ${password}`);
}

console.log('\n✨ All tests completed!');