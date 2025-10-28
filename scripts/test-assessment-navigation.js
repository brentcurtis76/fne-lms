/**
 * Test script for assessment page step navigation
 * This script:
 * 1. Fetches a valid growth_community_id from the database
 * 2. Provides the URL to test the page in a browser
 * 3. Checks if pre-assessment answers are saved
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAssessmentNavigation() {
  console.log('🧪 Testing Assessment Navigation & Step Management\n');

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

      // Check if pre-assessment answers exist
      if (existingAssessment.context_metadata?.preAssessmentAnswers) {
        const answers = existingAssessment.context_metadata.preAssessmentAnswers;
        const answeredCount = Object.values(answers).filter(v => {
          if (Array.isArray(v)) return v.length > 0;
          return v !== '' && v !== null;
        }).length;
        console.log(`      Pre-assessment answers: ${answeredCount}/16 questions answered`);
      } else {
        console.log('      Pre-assessment answers: Not started');
      }
    } else {
      console.log('   ℹ️  No existing assessment (will be created on page load)');
    }

    // Step 3: Provide test URL
    console.log('\n3️⃣  Test URL:');
    const testUrl = `http://localhost:3000/community/transformation/assessment?communityId=${testCommunity.id}`;
    console.log(`   🌐 ${testUrl}`);

    // Step 4: Test instructions
    console.log('\n📋 Test Instructions:');
    console.log('\n   🔹 Step 1: Pre-Assessment Questions');
    console.log('      1. Open the URL above in your browser (must be logged in)');
    console.log('      2. Verify you see "Paso 1 de 3" at the top');
    console.log('      3. Answer a few questions in the pre-assessment form');
    console.log('      4. Watch for "Guardando..." indicator (auto-save)');
    console.log('      5. Refresh the page and verify answers are preserved');
    console.log('      6. Answer all 16 questions');
    console.log('      7. Click "Continuar a la Evaluación" button');

    console.log('\n   🔹 Step 2: Questions Placeholder');
    console.log('      1. Verify you advance to "Paso 2 de 3"');
    console.log('      2. See placeholder: "Preguntas Secuenciales - próximamente"');
    console.log('      3. Click "Volver" button');
    console.log('      4. Verify you go back to Step 1 with answers preserved');

    console.log('\n   🔹 Key Features to Test:');
    console.log('      ✓ Progress indicator updates (1/3, 2/3, 3/3)');
    console.log('      ✓ Auto-save functionality (watch for "Guardando..." indicator)');
    console.log('      ✓ Answer persistence on page refresh');
    console.log('      ✓ Back button navigation');
    console.log('      ✓ Step transitions are smooth');

    console.log('\n✅ Test setup complete!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testAssessmentNavigation();
