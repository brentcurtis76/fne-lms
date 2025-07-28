/**
 * Check if Bob Dylan is in the same community as Brent Curtis
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkBobCommunity() {
  console.log('🔍 Checking if Bob Dylan is in the same community as Brent...');
  
  try {
    const brentId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
    const brentCommunityId = 'eeac5776-98f3-4169-8ba6-3bdec1d84e03';
    const bobId = '43d87ae3-5507-431d-bc89-9bfea6da41ec';
    
    console.log('🔍 Brent Curtis:', brentId);
    console.log('🔍 Brent\'s community:', brentCommunityId);
    console.log('🔍 Bob Dylan:', bobId);
    
    // Check Bob's user roles
    console.log('\n👤 Checking Bob Dylan\'s user roles...');
    const { data: bobRoles, error: bobRolesError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', bobId);
      
    if (bobRolesError) {
      console.error('❌ Error fetching Bob\'s roles:', bobRolesError);
    } else {
      console.log(`✅ Bob Dylan has ${bobRoles?.length || 0} roles:`, bobRoles);
      
      // Check if Bob is in the same community as Brent
      const bobInSameCommunity = bobRoles?.some(role => 
        role.community_id === brentCommunityId && role.is_active
      );
      
      if (bobInSameCommunity) {
        console.log('🎉 SUCCESS: Bob Dylan is in the same community as Brent!');
      } else {
        console.log('❌ ISSUE: Bob Dylan is NOT in the same community as Brent');
        console.log('💡 SOLUTION: Need to assign Bob Dylan to community:', brentCommunityId);
        
        // Let's add Bob to the same community as Brent
        console.log('\n🔧 Adding Bob Dylan to Brent\'s community...');
        const { data: newRole, error: assignError } = await supabase
          .from('user_roles')
          .insert({
            user_id: bobId,
            role_type: 'docente',
            school_id: 19, // Same school as Brent
            generation_id: null,
            community_id: brentCommunityId,
            is_active: true,
            assigned_at: new Date().toISOString(),
            assigned_by: brentId
          })
          .select()
          .single();
          
        if (assignError) {
          console.error('❌ Error assigning Bob to community:', assignError);
        } else {
          console.log('✅ Successfully assigned Bob Dylan to community:', newRole);
        }
      }
    }
    
    // Now test the search API
    console.log('\n🔍 Testing the search API after potential fix...');
    
    // Get auth token for Brent
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'brent@perrotuertocm.cl',
      password: 'NuevaEdu2025!'
    });
    
    if (authError) {
      console.error('❌ Auth error:', authError);
      return;
    }
    
    // Test the search API
    const searchResponse = await fetch('https://fne-lms.vercel.app/api/community/search-users?q=bob', {
      headers: {
        'Authorization': `Bearer ${authData.session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('🔍 Search API Response status:', searchResponse.status);
    
    if (searchResponse.ok) {
      const searchResults = await searchResponse.json();
      console.log('✅ Search API results:', searchResults);
      
      if (searchResults.length > 0) {
        console.log('🎉 SUCCESS: Bob Dylan now appears in search results!');
      } else {
        console.log('❌ STILL ISSUE: Bob Dylan still not in search results');
      }
    } else {
      const errorText = await searchResponse.text();
      console.error('❌ Search API error:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Error in check:', error);
  }
}

checkBobCommunity();