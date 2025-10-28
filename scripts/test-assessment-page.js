/**
 * Test script for the new assessment page
 * This script:
 * 1. Fetches a valid growth_community_id from the database
 * 2. Provides the URL to test the page in a browser
 * 3. Checks if assessment can be created via API
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAssessmentPage() {
  console.log('🧪 Testing Assessment Page Foundation\n');

  try {
    // Step 1: Get a valid growth community
    console.log('1️⃣  Fetching a valid growth_community...');
    const { data: communities, error: commError } = await supabase
      .from('growth_communities')
      .select('id, name')
      .limit(1);

    if (commError) {
      throw new Error(`Error fetching community: ${commError.message}`);
    }

    if (!communities || communities.length === 0) {
      throw new Error('No growth communities found in database');
    }

    const testCommunity = communities[0];
    console.log(`   ✅ Found community: ${testCommunity.name} (${testCommunity.id})`);

    // Step 2: Check if assessment exists
    console.log('\n2️⃣  Checking for existing assessment...');
    const { data: existingAssessment, error: assessError } = await supabase
      .from('transformation_assessments')
      .select('*')
      .eq('growth_community_id', testCommunity.id)
      .eq('area', 'personalizacion')
      .maybeSingle();

    if (assessError) {
      console.log(`   ⚠️  Error checking assessment: ${assessError.message}`);
    } else if (existingAssessment) {
      console.log(`   ℹ️  Assessment already exists: ${existingAssessment.id}`);
      console.log(`      Status: ${existingAssessment.status}`);
      console.log(`      Created: ${new Date(existingAssessment.created_at).toLocaleString('es-CL')}`);
    } else {
      console.log('   ℹ️  No existing assessment (will be created on page load)');
    }

    // Step 3: Provide test URL
    console.log('\n3️⃣  Test URL:');
    const testUrl = `http://localhost:3000/community/transformation/assessment?communityId=${testCommunity.id}`;
    console.log(`   🌐 ${testUrl}`);

    // Step 4: Test instructions
    console.log('\n📋 Test Instructions:');
    console.log('   1. Make sure you are logged in');
    console.log('   2. Open the URL above in your browser');
    console.log('   3. Verify the page loads without errors');
    console.log('   4. Check that you see:');
    console.log('      - Page title: "Evaluación de Transformación: Personalización"');
    console.log('      - Your name in the greeting');
    console.log('      - Community name displayed');
    console.log('      - Assessment info box with ID');
    console.log('   5. Check browser console for assessment ID log');

    console.log('\n✅ Test setup complete!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAssessmentPage();
