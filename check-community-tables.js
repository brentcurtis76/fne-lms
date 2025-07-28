/**
 * Check what community-related tables exist in production
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCommunityTables() {
  console.log('🔍 Checking community-related tables in production...');
  
  try {
    // Get all table names that contain 'community'
    const tableNames = [
      'communities',
      'user_community_roles', 
      'community_workspaces',
      'community_posts',
      'community_members',
      'growth_communities',
      'workspace_members'
    ];
    
    for (const tableName of tableNames) {
      console.log(`\n📋 Checking table: ${tableName}`);
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
          
        if (error) {
          console.log(`❌ Table ${tableName} doesn't exist or error:`, error.message);
        } else {
          console.log(`✅ Table ${tableName} exists with columns:`, Object.keys(data[0] || {}));
          
          // If it's a user-related table, count records
          if (data.length > 0) {
            const { count } = await supabase
              .from(tableName)
              .select('*', { count: 'exact', head: true });
            console.log(`📊 Records in ${tableName}: ${count}`);
          }
        }
      } catch (err) {
        console.log(`❌ Error accessing ${tableName}:`, err.message);
      }
    }
    
    // Let's also check what Brent's user roles are
    console.log('\n👤 Checking Brent\'s user roles...');
    const { data: brentRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', '4ae17b21-8977-425c-b05a-ca7cdb8b9df5');
      
    if (rolesError) {
      console.error('❌ Error fetching Brent\'s roles:', rolesError);
    } else {
      console.log('✅ Brent\'s roles:', brentRoles);
    }
    
    // Check workspace memberships
    console.log('\n🏢 Checking workspace memberships...');
    const { data: workspaces, error: workspaceError } = await supabase
      .from('community_workspaces')
      .select('*')
      .limit(5);
      
    if (workspaceError) {
      console.error('❌ Error fetching workspaces:', workspaceError);
    } else {
      console.log('✅ Sample workspaces:', workspaces);
    }
    
  } catch (error) {
    console.error('❌ Error in check:', error);
  }
}

checkCommunityTables();