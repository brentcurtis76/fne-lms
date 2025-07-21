#!/usr/bin/env node

/**
 * Audit School Generation Flags for Data Consistency
 * 
 * This script checks for inconsistencies between:
 * 1. schools.has_generations flag
 * 2. Actual generations in the database
 * 3. Communities that require generations
 * 
 * Purpose: Identify data issues that could cause community creation failures
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function auditSchoolGenerationFlags() {
  console.log('🔍 AUDITING SCHOOL GENERATION FLAGS\n');

  try {
    // 1. Get all schools with their generation flags
    console.log('1️⃣ Fetching schools data...');
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('name');

    if (schoolsError) {
      throw new Error(`Error fetching schools: ${schoolsError.message}`);
    }

    console.log(`   Found ${schools.length} schools\n`);

    // 2. Get all generations grouped by school
    console.log('2️⃣ Fetching generations data...');
    const { data: generations, error: genError } = await supabase
      .from('generations')
      .select('id, name, school_id')
      .order('school_id, name');

    if (genError) {
      throw new Error(`Error fetching generations: ${genError.message}`);
    }

    // Group generations by school_id
    const generationsBySchool = {};
    generations.forEach(gen => {
      if (!generationsBySchool[gen.school_id]) {
        generationsBySchool[gen.school_id] = [];
      }
      generationsBySchool[gen.school_id].push(gen);
    });

    console.log(`   Found ${generations.length} generations across ${Object.keys(generationsBySchool).length} schools\n`);

    // 3. Get communities that might be affected
    console.log('3️⃣ Fetching communities data...');
    const { data: communities, error: commError } = await supabase
      .from('growth_communities')
      .select('id, name, school_id, generation_id')
      .order('school_id, name');

    if (commError) {
      throw new Error(`Error fetching communities: ${commError.message}`);
    }

    console.log(`   Found ${communities.length} communities\n`);

    // 4. Analyze inconsistencies
    console.log('4️⃣ ANALYZING INCONSISTENCIES\n');
    
    const issues = [];
    let healthySchools = 0;

    schools.forEach(school => {
      const schoolGens = generationsBySchool[school.id] || [];
      const schoolComms = communities.filter(c => c.school_id === school.id);
      const hasGenerationsInDB = schoolGens.length > 0;
      const flagValue = school.has_generations;
      
      let schoolIssues = [];

      // Check for flag mismatches
      if (flagValue === true && !hasGenerationsInDB) {
        schoolIssues.push('⚠️  Flag says has_generations=true but no generations found in database');
      }
      
      if (flagValue === false && hasGenerationsInDB) {
        schoolIssues.push('⚠️  Flag says has_generations=false but generations exist in database');
      }

      if (flagValue === null) {
        if (hasGenerationsInDB) {
          schoolIssues.push('⚠️  Flag is NULL but generations exist (should be true)');
        } else {
          schoolIssues.push('ℹ️  Flag is NULL and no generations (should be false)');
        }
      }

      // Check for communities with missing generation_id when school has generations
      const communitiesWithoutGeneration = schoolComms.filter(c => !c.generation_id);
      if ((flagValue === true || hasGenerationsInDB) && communitiesWithoutGeneration.length > 0) {
        schoolIssues.push(`⚠️  ${communitiesWithoutGeneration.length} communities without generation_id despite school having generations`);
      }

      if (schoolIssues.length > 0) {
        issues.push({
          school,
          generations: schoolGens,
          communities: schoolComms,
          issues: schoolIssues
        });
      } else {
        healthySchools++;
      }
    });

    // 5. Report findings
    console.log('📊 AUDIT RESULTS\n');
    console.log(`✅ Healthy schools: ${healthySchools}`);
    console.log(`⚠️  Schools with issues: ${issues.length}`);
    
    if (issues.length > 0) {
      console.log('\n🔴 SCHOOLS WITH ISSUES:\n');
      
      issues.forEach((issue, index) => {
        console.log(`${index + 1}. 🏫 ${issue.school.name} (ID: ${issue.school.id})`);
        console.log(`   Flag: has_generations = ${issue.school.has_generations}`);
        console.log(`   Generations in DB: ${issue.generations.length}`);
        console.log(`   Communities: ${issue.communities.length}`);
        
        issue.issues.forEach(issueText => {
          console.log(`   ${issueText}`);
        });
        
        if (issue.generations.length > 0) {
          console.log(`   Generations: ${issue.generations.map(g => g.name).join(', ')}`);
        }
        
        if (issue.communities.length > 0) {
          const commsWithoutGen = issue.communities.filter(c => !c.generation_id);
          if (commsWithoutGen.length > 0) {
            console.log(`   Communities without generation: ${commsWithoutGen.map(c => c.name).join(', ')}`);
          }
        }
        
        console.log('');
      });

      // 6. Generate fix recommendations
      console.log('🔧 RECOMMENDED FIXES:\n');
      
      const flagFixes = issues.filter(i => 
        i.school.has_generations !== (i.generations.length > 0)
      );
      
      if (flagFixes.length > 0) {
        console.log('SQL commands to fix flag inconsistencies:');
        flagFixes.forEach(issue => {
          const shouldBeTrue = issue.generations.length > 0;
          console.log(`UPDATE schools SET has_generations = ${shouldBeTrue} WHERE id = '${issue.school.id}'; -- ${issue.school.name}`);
        });
        console.log('');
      }

      const communityFixes = issues.filter(i => 
        i.communities.some(c => !c.generation_id) && i.generations.length > 0
      );
      
      if (communityFixes.length > 0) {
        console.log('⚠️  Communities without generation_id in schools with generations:');
        console.log('   These may need manual review to assign appropriate generations.');
        communityFixes.forEach(issue => {
          const commsWithoutGen = issue.communities.filter(c => !c.generation_id);
          console.log(`   ${issue.school.name}: ${commsWithoutGen.length} communities need generation assignment`);
        });
      }
    } else {
      console.log('\n🎉 All schools have consistent generation flags! No issues found.');
    }

    console.log('\n✅ Audit completed successfully');

  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    process.exit(1);
  }
}

// Run the audit
auditSchoolGenerationFlags();