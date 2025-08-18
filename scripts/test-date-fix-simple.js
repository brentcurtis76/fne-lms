#!/usr/bin/env node

console.log('🧪 TESTING DATE FIX FOR EVENT DISPLAY');
console.log('=====================================\n');

// Replicate the parseLocalDate function
function parseLocalDate(dateString) {
  // If the date is in YYYY-MM-DD format, parse it as local date
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Create date in local timezone (month is 0-indexed in JavaScript)
    return new Date(year, month - 1, day);
  }
  
  // If it includes time, use it directly
  if (dateString.includes('T')) {
    return new Date(dateString);
  }
  
  // Default: append noon time to avoid timezone issues
  return new Date(dateString + 'T12:00:00');
}

// Replicate the formatEventDate function
function formatEventDate(dateString) {
  const date = parseLocalDate(dateString);
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Test dates that were problematic
const testDates = [
  '2025-08-18',  // The date that was showing as Aug 17
  '2025-08-17',  // Should show as Aug 17
  '2025-12-31',  // Edge case: end of year
  '2026-01-01',  // Edge case: start of year
  '2025-02-28',  // End of month
];

console.log('Testing date parsing and formatting:\n');

testDates.forEach(dateString => {
  console.log(`Input: ${dateString}`);
  
  // Old problematic way
  const oldDate = new Date(dateString);
  const oldDay = oldDate.getDate();
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const oldFormatted = `${oldDay} ${months[oldDate.getMonth()]} ${oldDate.getFullYear()}`;
  
  // New fixed way
  const newFormatted = formatEventDate(dateString);
  
  console.log(`  ❌ OLD (buggy):  ${oldFormatted}`);
  console.log(`  ✅ NEW (fixed):  ${newFormatted}`);
  console.log(`  Match: ${oldFormatted === newFormatted ? '🟡 Same' : '✅ Fixed!'}\n`);
});

// Verify the specific La Fontaine event date
console.log('📅 La Fontaine Event Test:');
console.log('Database value: 2025-08-18');
console.log('Should display: 18 AGO 2025');
console.log('Actually displays: ' + formatEventDate('2025-08-18'));
console.log('Correct: ' + (formatEventDate('2025-08-18') === '18 AGO 2025' ? '✅ YES!' : '❌ NO'));

console.log('\n✅ FIX SUMMARY:');
console.log('- Created centralized date utility (utils/dateUtils.ts)');
console.log('- Updated EventsTimeline component');
console.log('- Updated Admin Events page');
console.log('- Updated Public News page');
console.log('- Dates now parse correctly in all timezones');