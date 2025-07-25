/**
 * FNE LMS Dashboard - Master Data Seeding Script
 * 
 * Orchestrates comprehensive test data generation for unified dashboard validation
 * Supports multiple scenarios, realistic patterns, and data integrity validation
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Import generators
const { generateUsers } = require('./generators/users');
const { generateOrganizations } = require('./generators/organizations');
const { generateCourses } = require('./generators/courses');
const { generateActivity } = require('./generators/activity');
const { generateProgress } = require('./generators/progress');

// Import configuration
const scenarios = require('./config/scenarios');
const { confirmAndGetSandboxClient, logProgress, generateReport, cleanupTestData } = require('./utils/database');

class DataSeedingMaster {
  constructor() {
    this.supabase = null;
    this.generatedData = {
      users: [],
      schools: [],
      communities: [],
      courses: [],
      activities: [],
      progress: []
    };
    this.startTime = Date.now();
  }

  async initialize() {
    // 🚨 CRITICAL SECURITY CHECK: Use secure sandbox client
    console.log('🔒 INITIALIZING SECURE DATA SEEDING ENVIRONMENT');
    
    try {
      this.supabase = await confirmAndGetSandboxClient();
    } catch (error) {
      console.error('🚨 SECURITY VALIDATION FAILED:', error.message);
      throw new Error('Cannot proceed - security requirements not met');
    }

    console.log('🚀 FNE LMS Data Seeding Master Initialized');
    console.log(`📊 Target Scenarios: ${Object.keys(scenarios.SCENARIOS).length}`);
    console.log(`👥 Target Users: ${scenarios.DATA_VOLUMES.users}`);
    console.log(`📚 Target Courses: ${scenarios.DATA_VOLUMES.courses}`);
    console.log(`⏰ Time Span: ${scenarios.DATA_VOLUMES.timespan}\n`);
  }

  async cleanExistingData(options = {}) {
    const { skipConfirmation = false } = options;
    
    // 🚨 USE SECURE CLEANUP FUNCTION with interactive confirmation
    console.log('🧹 Initiating secure data cleanup process...');
    
    try {
      const cleanupSuccessful = await cleanupTestData(
        this.supabase, 
        [], // Use default tables
        skipConfirmation || process.env.CI || process.env.SKIP_CONFIRMATION
      );
      
      if (!cleanupSuccessful) {
        throw new Error('Data cleanup was cancelled or failed');
      }
      
      console.log('✅ Secure cleanup completed\n');
    } catch (error) {
      console.error('❌ Secure cleanup error:', error.message);
      throw error;
    }
  }

  async executePhase(phaseName, generator, dependencies = []) {
    console.log(`\n🔄 Phase: ${phaseName}`);
    const phaseStart = Date.now();

    try {
      // Verify dependencies
      for (const dep of dependencies) {
        if (!this.generatedData[dep] || this.generatedData[dep].length === 0) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }

      // Execute generator
      const result = await generator.call(this);
      const phaseTime = Date.now() - phaseStart;

      console.log(`✅ ${phaseName} completed in ${phaseTime}ms`);
      console.log(`   Generated: ${Array.isArray(result) ? result.length : 'N/A'} records\n`);

      return result;
    } catch (error) {
      console.error(`❌ ${phaseName} failed:`, error.message);
      throw error;
    }
  }

  async generateOrganizationalStructure() {
    return await generateOrganizations(this.supabase, scenarios);
  }

  async generateUserPersonas() {
    return await generateUsers(this.supabase, scenarios, { organizations: this.generatedData.organizations });
  }

  async generateLearningContent() {
    return await generateCourses(this.supabase, scenarios, this.generatedData);
  }

  async generateCollaborativeActivity() {
    return await generateActivity(this.supabase, scenarios, this.generatedData);
  }

  async generateLearningProgress() {
    return await generateProgress(this.supabase, scenarios, this.generatedData);
  }

  async validateDataIntegrity() {
    console.log('🔍 Validating data integrity...');
    
    const validations = [
      {
        name: 'User Profiles',
        query: "SELECT COUNT(*) as count FROM profiles WHERE metadata->>'test_data' = 'true'",
        expected: scenarios.DATA_VOLUMES.users
      },
      {
        name: 'Schools',
        query: "SELECT COUNT(*) as count FROM schools WHERE metadata->>'test_data' = 'true'",
        expected: scenarios.DATA_VOLUMES.schools
      },
      {
        name: 'Communities',
        query: "SELECT COUNT(*) as count FROM growth_communities WHERE metadata->>'test_data' = 'true'",
        expected: scenarios.DATA_VOLUMES.communities
      },
      {
        name: 'Courses',
        query: "SELECT COUNT(*) as count FROM courses WHERE metadata->>'test_data' = 'true'",
        expected: scenarios.DATA_VOLUMES.courses
      },
      {
        name: 'Activity Feed',
        query: "SELECT COUNT(*) as count FROM activity_feed WHERE metadata->>'test_data' = 'true'",
        minimum: scenarios.DATA_VOLUMES.activities
      }
    ];

    let allValid = true;
    for (const validation of validations) {
      try {
        const { data, error } = await this.supabase.rpc('execute_sql', { 
          sql: validation.query 
        });
        
        if (error) {
          console.warn(`⚠️  ${validation.name}: Query failed - ${error.message}`);
          continue;
        }

        const count = data?.[0]?.count || 0;
        const isValid = validation.expected 
          ? count === validation.expected
          : count >= validation.minimum;

        if (isValid) {
          console.log(`✅ ${validation.name}: ${count} records`);
        } else {
          console.log(`❌ ${validation.name}: ${count} records (expected: ${validation.expected || `>=${validation.minimum}`})`);
          allValid = false;
        }
      } catch (error) {
        console.warn(`⚠️  ${validation.name}: Validation error - ${error.message}`);
      }
    }

    return allValid;
  }

  async generateSummaryReport() {
    const totalTime = Date.now() - this.startTime;
    
    console.log('\n📊 DATA SEEDING SUMMARY REPORT');
    console.log('================================');
    console.log(`⏱️  Total Time: ${Math.round(totalTime / 1000)}s`);
    console.log(`📅 Generated: ${new Date().toLocaleString()}`);
    console.log(`🎯 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Generate detailed analytics
    try {
      const report = await generateReport(this.supabase);
      
      console.log('\n📈 Data Distribution:');
      console.log(`   Users by Role: ${JSON.stringify(report.usersByRole, null, 2)}`);
      console.log(`   Communities by Health: ${JSON.stringify(report.communitiesByHealth, null, 2)}`);
      console.log(`   Activity by Type: ${JSON.stringify(report.activityByType, null, 2)}`);
      console.log(`   Completion Rates: ${report.averageCompletion}%`);
      
      // Save report to file
      const reportPath = path.join(__dirname, 'reports', `seeding-report-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        duration: totalTime,
        summary: report,
        scenarios: scenarios.SCENARIOS
      }, null, 2));
      
      console.log(`\n💾 Detailed report saved: ${reportPath}`);
    } catch (error) {
      console.warn('⚠️  Report generation failed:', error.message);
    }
  }

  async run(options = {}) {
    try {
      await this.initialize();

      // Clean existing data if requested
      if (options.clean !== false) {
        await this.cleanExistingData(options);
      }

      // Phase 1: Organizational Structure
      this.generatedData.organizations = await this.executePhase(
        'Organizational Structure',
        this.generateOrganizationalStructure
      );

      // Phase 2: User Personas
      this.generatedData.users = await this.executePhase(
        'User Personas',
        this.generateUserPersonas,
        ['organizations']
      );

      // Phase 3: Learning Content
      this.generatedData.courses = await this.executePhase(
        'Learning Content',
        this.generateLearningContent,
        ['users', 'organizations']
      );

      // Phase 4: Collaborative Activity
      this.generatedData.activities = await this.executePhase(
        'Collaborative Activity',
        this.generateCollaborativeActivity,
        ['users', 'organizations']
      );

      // Phase 5: Learning Progress
      this.generatedData.progress = await this.executePhase(
        'Learning Progress',
        this.generateLearningProgress,
        ['users', 'courses']
      );

      // Validation and Reporting
      console.log('\n🔍 Final Validation...');
      const isValid = await this.validateDataIntegrity();
      
      if (isValid) {
        console.log('✅ All data integrity checks passed');
      } else {
        console.log('⚠️  Some validation checks failed - review above');
      }

      await this.generateSummaryReport();

      console.log('\n🎉 DATA SEEDING COMPLETED SUCCESSFULLY!');
      console.log('   Dashboard testing data is ready');
      console.log('   Navigate to /admin/new-reporting to validate\n');

      return true;
    } catch (error) {
      console.error('\n❌ DATA SEEDING FAILED:', error.message);
      console.error('   Check logs above for specific errors');
      throw error;
    }
  }
}

// Command line execution
async function main() {
  const options = {
    clean: !process.argv.includes('--no-clean'),
    skipConfirmation: process.argv.includes('--yes') || process.env.CI
  };

  const seeder = new DataSeedingMaster();
  try {
    await seeder.run(options);
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { DataSeedingMaster };

// Run if called directly
if (require.main === module) {
  main();
}