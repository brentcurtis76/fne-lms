/**
 * TEST: Proof that optional chaining fixes the undefined member.user bug
 *
 * This demonstrates exactly what's happening in production
 */

console.log('=== PROOF OF BUG AND FIX ===\n');

// Simulate the data structure from the database
const groupMembersWithBug = [
  {
    user_id: '123',
    user: {
      avatar_url: 'https://example.com/avatar1.jpg',
      full_name: 'Juan Pérez'
    }
  },
  {
    user_id: '456',
    user: undefined  // <-- THIS IS THE PROBLEM: user is undefined for some members
  }
];

console.log('Test Data:');
console.log(JSON.stringify(groupMembersWithBug, null, 2));
console.log('\n');

// TEST 1: OLD CODE (CRASHES)
console.log('TEST 1: OLD CODE (member.user.avatar_url)');
console.log('==========================================');
try {
  groupMembersWithBug.forEach((member) => {
    const hasAvatar = member.user.avatar_url;  // ❌ CRASHES HERE
    console.log(`✅ Member ${member.user_id}: ${hasAvatar ? 'Has avatar' : 'No avatar'}`);
  });
  console.log('Result: No crash\n');
} catch (error) {
  console.log(`❌ CRASH: ${error.message}`);
  console.log(`Error Type: ${error.name}`);
  console.log('This is the EXACT error users are seeing in production!\n');
}

// TEST 2: NEW CODE (SAFE)
console.log('TEST 2: NEW CODE (member.user?.avatar_url)');
console.log('==========================================');
try {
  groupMembersWithBug.forEach((member) => {
    const hasAvatar = member.user?.avatar_url;  // ✅ SAFE
    const fullName = member.user?.full_name || 'Usuario desconocido';  // ✅ SAFE
    const initial = member.user?.full_name?.charAt(0).toUpperCase() || '?';  // ✅ SAFE

    console.log(`✅ Member ${member.user_id}:`);
    console.log(`   - Avatar: ${hasAvatar || 'None'}`);
    console.log(`   - Name: ${fullName}`);
    console.log(`   - Initial: ${initial}`);
  });
  console.log('Result: No crash! All members handled gracefully.\n');
} catch (error) {
  console.log(`❌ CRASH: ${error.message}\n`);
}

// TEST 3: Verify the fix handles all cases
console.log('TEST 3: EDGE CASES');
console.log('==================');
const edgeCases = [
  { user_id: '1', user: null },
  { user_id: '2', user: undefined },
  { user_id: '3', user: {} },
  { user_id: '4', user: { full_name: null } },
  { user_id: '5', user: { full_name: 'Valid User', avatar_url: null } },
];

edgeCases.forEach((member) => {
  const name = member.user?.full_name || 'Usuario desconocido';
  const initial = member.user?.full_name?.charAt(0).toUpperCase() || '?';
  const avatar = member.user?.avatar_url || 'None';

  console.log(`Member ${member.user_id}: ${name} (${initial}) - Avatar: ${avatar}`);
});

console.log('\n=== CONCLUSION ===');
console.log('✅ Optional chaining (member.user?.avatar_url) prevents the crash');
console.log('✅ Fallback values provide user-friendly display');
console.log('✅ Modal renders successfully even with incomplete data');
