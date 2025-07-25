const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRecentDuplicates() {
  console.log('\n🔍 CHECKING FOR RECENT DUPLICATE NOTIFICATIONS\n');
  
  // Get notifications from the last 24 hours
  const cutoffTime = new Date();
  cutoffTime.setDate(cutoffTime.getDate() - 1);
  
  const { data: recentNotifs, error } = await supabase
    .from('user_notifications')
    .select('*')
    .gte('created_at', cutoffTime.toISOString())
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Total notifications in last 24 hours: ${recentNotifs.length}\n`);
  
  // Group by title to find duplicates
  const grouped = {};
  recentNotifs.forEach(notif => {
    const key = notif.title;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(notif);
  });
  
  // Find actual duplicates
  console.log('DUPLICATE GROUPS (same title):');
  console.log('='.repeat(50));
  
  let totalDuplicates = 0;
  
  Object.entries(grouped)
    .filter(([_, notifs]) => notifs.length > 1)
    .forEach(([title, notifs]) => {
      console.log(`\n📋 Title: "${title}"`);
      console.log(`   Count: ${notifs.length} notifications`);
      
      // Check if they're truly duplicates (same user within short time)
      const userGroups = {};
      notifs.forEach(n => {
        if (!userGroups[n.user_id]) userGroups[n.user_id] = [];
        userGroups[n.user_id].push(n);
      });
      
      Object.entries(userGroups)
        .filter(([_, userNotifs]) => userNotifs.length > 1)
        .forEach(([userId, userNotifs]) => {
          console.log(`\n   ⚠️  DUPLICATE for user ${userId.substring(0, 8)}...:`);
          userNotifs.forEach(n => {
            console.log(`      - ID: ${n.id.substring(0, 8)}... Created: ${n.created_at} Key: ${n.idempotency_key || 'NULL'}`);
          });
          totalDuplicates += (userNotifs.length - 1); // Count extras as duplicates
        });
    });
    
  console.log('\n\n📊 DUPLICATE SUMMARY:');
  console.log('='.repeat(50));
  console.log(`Total duplicate notifications found: ${totalDuplicates}`);
  
  // Check idempotency keys
  console.log('\n\n🔑 IDEMPOTENCY KEY ANALYSIS:');
  console.log('='.repeat(50));
  
  const keysMap = {};
  let nullKeyCount = 0;
  
  recentNotifs.forEach(n => {
    if (!n.idempotency_key) {
      nullKeyCount++;
    } else {
      if (!keysMap[n.idempotency_key]) keysMap[n.idempotency_key] = [];
      keysMap[n.idempotency_key].push(n);
    }
  });
  
  console.log(`Notifications without idempotency key: ${nullKeyCount}`);
  
  const duplicateKeys = Object.entries(keysMap).filter(([_, notifs]) => notifs.length > 1);
  
  if (duplicateKeys.length > 0) {
    console.log('\n⚠️  DUPLICATE IDEMPOTENCY KEYS FOUND:');
    duplicateKeys.forEach(([key, notifs]) => {
      console.log(`\n   Key: ${key}`);
      notifs.forEach(n => {
        console.log(`      - User: ${n.user_id.substring(0, 8)}... Title: "${n.title}" Created: ${n.created_at}`);
      });
    });
  } else {
    console.log('✅ No duplicate idempotency keys found');
  }
  
  // Check for notifications created within seconds of each other
  console.log('\n\n⏱️  RAPID-FIRE NOTIFICATIONS (within 5 seconds):');
  console.log('='.repeat(50));
  
  const rapidFire = [];
  
  for (let i = 0; i < recentNotifs.length - 1; i++) {
    const current = recentNotifs[i];
    const next = recentNotifs[i + 1];
    
    const timeDiff = new Date(current.created_at) - new Date(next.created_at);
    
    if (timeDiff < 5000 && current.title === next.title) { // Within 5 seconds
      rapidFire.push({ current, next, timeDiff });
    }
  }
  
  if (rapidFire.length > 0) {
    console.log(`Found ${rapidFire.length} rapid-fire notification pairs:`);
    rapidFire.forEach(({ current, next, timeDiff }) => {
      console.log(`\n   "${current.title}"`);
      console.log(`   Time difference: ${timeDiff}ms`);
      console.log(`   - ${current.id.substring(0, 8)}... (User: ${current.user_id.substring(0, 8)}...)`);
      console.log(`   - ${next.id.substring(0, 8)}... (User: ${next.user_id.substring(0, 8)}...)`);
    });
  } else {
    console.log('✅ No rapid-fire notifications found');
  }
}

async function main() {
  await checkRecentDuplicates();
}

main();