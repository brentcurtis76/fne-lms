#!/usr/bin/env node

/**
 * Verification Script: Team Photo Grayscale Fix
 * 
 * This script verifies that all team member photos on the /equipo page
 * have the correct Tailwind CSS grayscale classes applied.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Team Photo Grayscale Implementation...\n');

// Read the equipo.tsx file
const equipoPath = path.join(__dirname, '../pages/equipo.tsx');
const content = fs.readFileSync(equipoPath, 'utf8');

// Check for correct Tailwind classes
const grayscaleMatches = content.match(/grayscale hover:grayscale-0 transition-all duration-300/g);
const teamPhotoMatches = content.match(/team-photo/g);

console.log('📊 Analysis Results:');
console.log(`✅ Tailwind grayscale classes found: ${grayscaleMatches ? grayscaleMatches.length : 0}`);
console.log(`❌ Old team-photo classes remaining: ${teamPhotoMatches ? teamPhotoMatches.length : 0}`);

// Team member names to verify
const teamMembers = [
  'Arnoldo Cisternas',
  'Joan Quintana', 
  'Gabriela Naranjo',
  'Brent Curtis',
  'Mora Del Fresno',
  'Coral Regí',
  'Jordi Mussons',
  'Boris Mir',
  'Pepe Menéndez',
  'Sandra Entrena',
  'Anna Comas',
  'Elena Guillén',
  'Sergi Del Moral',
  'Betlem Cuesta'
];

console.log('\n👥 Team Members Verification:');
teamMembers.forEach((member, index) => {
  const memberFound = content.includes(member);
  console.log(`${memberFound ? '✅' : '❌'} ${index + 1}. ${member}`);
});

// Summary
console.log('\n📋 Summary:');
if (grayscaleMatches && grayscaleMatches.length === 14 && !teamPhotoMatches) {
  console.log('🎉 SUCCESS: All team photos correctly configured with Tailwind grayscale filters');
  console.log('🎨 Effect: Photos display in black & white, turn color on hover');
  console.log('⚡ Performance: Using optimized Tailwind CSS utilities');
} else {
  console.log('⚠️  ISSUE: Implementation incomplete');
  if (grayscaleMatches && grayscaleMatches.length !== 14) {
    console.log(`   Expected 14 grayscale classes, found ${grayscaleMatches.length}`);
  }
  if (teamPhotoMatches) {
    console.log(`   Found ${teamPhotoMatches.length} remaining old team-photo classes`);
  }
}

console.log('\n🔗 Test URL: https://fne-lms.vercel.app/equipo');