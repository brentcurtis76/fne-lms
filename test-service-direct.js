#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

console.log('🔍 TESTING SERVICE LAYER DIRECTLY');
console.log('=================================');

async function testServiceDirect() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Import the service
    const { LearningPathsService } = require('./lib/services/learningPathsService');
    
    const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'; // Admin user from our previous test
    
    console.log('🧪 Step 1: Testing LearningPathsService.getUserAssignedPaths...');
    
    const assignedPaths = await LearningPathsService.getUserAssignedPaths(supabase, userId);
    console.log('✅ getUserAssignedPaths result:');
    console.log(JSON.stringify(assignedPaths, null, 2));
    
    console.log('\n🔍 Analyzing path structure:');
    assignedPaths.forEach((path, index) => {
      console.log(`\nPath ${index + 1}:`);
      console.log(`   ID: "${path.id}" (type: ${typeof path.id}, length: ${path.id?.length})`);
      console.log(`   Name: "${path.name}"`);
      console.log(`   Description: "${path.description}"`);
      console.log(`   Is ID undefined? ${path.id === undefined}`);
      console.log(`   Is ID null? ${path.id === null}`);
      console.log(`   Is ID empty? ${path.id === ''}`);
      console.log(`   All keys: [${Object.keys(path).join(', ')}]`);
    });

    // Now test getting progress for each path (mimic the API)
    console.log('\n📊 Step 2: Testing getUserPathProgress for each path...');
    
    const pathsWithProgress = await Promise.all(
      assignedPaths.map(async (path) => {
        console.log(`\n🎯 Processing path: ${path.name} (ID: ${path.id})`);
        
        try {
          const progress = await LearningPathsService.getUserPathProgress(
            supabase,
            userId,
            path.id
          );
          console.log(`✅ Progress for ${path.id}:`, JSON.stringify(progress, null, 2));
          
          const result = {
            ...path,
            progress
          };
          
          console.log(`🔄 Final path object for ${path.name}:`);
          console.log(`   ID after merge: "${result.id}" (type: ${typeof result.id})`);
          
          return result;
        } catch (progressError) {
          console.error(`❌ Progress error for path ${path.id}:`, progressError.message);
          const result = {
            ...path,
            progress: null
          };
          
          console.log(`🔄 Final path object with error for ${path.name}:`);
          console.log(`   ID after merge: "${result.id}" (type: ${typeof result.id})`);
          
          return result;
        }
      })
    );
    
    console.log('\n🎯 Step 3: Final API response simulation:');
    console.log(JSON.stringify(pathsWithProgress, null, 2));
    
    console.log('\n🔍 Final ID Analysis:');
    pathsWithProgress.forEach((path, index) => {
      console.log(`\nFinal Path ${index + 1}:`);
      console.log(`   ID: "${path.id}" (type: ${typeof path.id})`);
      console.log(`   Name: "${path.name}"`);
      console.log(`   Will router.push work? ${path.id && typeof path.id === 'string' && path.id.length > 0}`);
      
      // Simulate what the frontend onClick would do
      console.log(`   Frontend would call: router.push("/my-paths/${path.id}")`);
      console.log(`   Resulting URL: /my-paths/${path.id}`);
    });

    // Test if there's a specific issue with the progress function
    console.log('\n🧪 Step 4: Testing getUserPathProgress independently...');
    
    for (const path of assignedPaths) {
      console.log(`\n🎯 Independent progress test for: ${path.name}`);
      console.log(`   Input path ID: "${path.id}" (type: ${typeof path.id})`);
      
      try {
        const directProgress = await LearningPathsService.getUserPathProgress(
          supabase,
          userId,
          path.id
        );
        console.log(`✅ Direct progress result:`, JSON.stringify(directProgress, null, 2));
      } catch (error) {
        console.error(`❌ Direct progress error:`, error);
      }
    }

  } catch (error) {
    console.error('❌ Unexpected Error:', error);
    console.error('Stack:', error.stack);
  }
}

testServiceDirect();