#!/usr/bin/env node

/**
 * Performance Testing Script for Genera Reporting System
 * 
 * This script generates test data and validates performance with large datasets
 * Usage: node scripts/performance-test.js
 */

const { performance } = require('perf_hooks');

// Mock configuration - in real scenario these would connect to actual database
const CONFIG = {
  TEST_USER_COUNT: 1000,
  TEST_LESSON_COUNT: 50,
  TEST_COURSE_COUNT: 20,
  SCHOOLS_COUNT: 10,
  GENERATIONS_COUNT: 3,
  COMMUNITIES_COUNT: 30,
  PERFORMANCE_THRESHOLDS: {
    SEARCH_MAX_TIME: 500, // ms
    FILTER_MAX_TIME: 300, // ms
    PAGINATION_MAX_TIME: 200, // ms
    CHART_RENDER_MAX_TIME: 1000, // ms
    TABLE_RENDER_MAX_TIME: 800, // ms
  }
};

class PerformanceTestRunner {
  constructor() {
    this.testData = null;
    this.results = {
      tests: [],
      summary: {
        passed: 0,
        failed: 0,
        totalTime: 0,
        averageTime: 0
      }
    };
  }

  // Generate test data
  generateTestData() {
    console.log('🔄 Generating test data...');
    const startTime = performance.now();

    // Generate schools
    const schools = Array.from({ length: CONFIG.SCHOOLS_COUNT }, (_, i) => ({
      id: `school_${i + 1}`,
      name: `Escuela ${i + 1}`,
      created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
    }));

    // Generate generations
    const generations = Array.from({ length: CONFIG.GENERATIONS_COUNT }, (_, i) => ({
      id: `gen_${i + 1}`,
      name: `Generación ${2023 + i}`,
      created_at: new Date()
    }));

    // Generate communities
    const communities = Array.from({ length: CONFIG.COMMUNITIES_COUNT }, (_, i) => ({
      id: `comm_${i + 1}`,
      name: `Comunidad ${String.fromCharCode(65 + (i % 26))}`,
      school_id: schools[i % schools.length].id,
      generation_id: generations[i % generations.length].id,
      created_at: new Date()
    }));

    // Generate users
    const users = Array.from({ length: CONFIG.TEST_USER_COUNT }, (_, i) => ({
      user_id: `user_${i + 1}`,
      user_name: `Usuario Test ${i + 1}`,
      user_email: `usuario${i + 1}@test.com`,
      user_role: i < 50 ? 'admin' : 'docente',
      school_id: schools[i % schools.length].id,
      school_name: schools[i % schools.length].name,
      generation_id: generations[i % generations.length].id,
      generation_name: generations[i % generations.length].name,
      community_id: communities[i % communities.length].id,
      community_name: communities[i % communities.length].name,
      total_courses_enrolled: Math.floor(Math.random() * 5) + 1,
      completed_courses: Math.floor(Math.random() * 3),
      courses_in_progress: Math.floor(Math.random() * 2) + 1,
      total_lessons_completed: Math.floor(Math.random() * 50) + 5,
      completion_percentage: Math.floor(Math.random() * 100),
      total_time_spent_minutes: Math.floor(Math.random() * 2000) + 100,
      average_quiz_score: Math.floor(Math.random() * 40) + 60,
      last_activity_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
    }));

    // Generate lesson progress data
    const lessonProgress = [];
    users.forEach(user => {
      const lessonsForUser = Math.floor(Math.random() * CONFIG.TEST_LESSON_COUNT) + 5;
      for (let i = 0; i < lessonsForUser; i++) {
        lessonProgress.push({
          id: `progress_${user.user_id}_${i}`,
          user_id: user.user_id,
          lesson_id: `lesson_${i + 1}`,
          course_id: `course_${(i % CONFIG.TEST_COURSE_COUNT) + 1}`,
          completed_at: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
          time_spent: Math.floor(Math.random() * 120) + 5, // 5-125 minutes
          quiz_score: Math.floor(Math.random() * 40) + 60, // 60-100
        });
      }
    });

    this.testData = {
      schools,
      generations,
      communities,
      users,
      lessonProgress
    };

    const endTime = performance.now();
    console.log(`✅ Test data generated in ${Math.round(endTime - startTime)}ms`);
    console.log(`📊 Generated: ${users.length} users, ${lessonProgress.length} lesson progress records`);
  }

  // Mock search function
  performSearch(searchTerm, data) {
    return data.filter(user => 
      user.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.user_email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  // Mock filter function
  performFilter(filters, data) {
    return data.filter(user => {
      if (filters.school_id && filters.school_id !== 'all' && user.school_id !== filters.school_id) {
        return false;
      }
      if (filters.generation_id && filters.generation_id !== 'all' && user.generation_id !== filters.generation_id) {
        return false;
      }
      if (filters.community_id && filters.community_id !== 'all' && user.community_id !== filters.community_id) {
        return false;
      }
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'active' && user.completion_percentage < 10) return false;
        if (filters.status === 'completed' && user.completion_percentage < 100) return false;
      }
      return true;
    });
  }

  // Mock pagination function
  performPagination(data, page, pageSize) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      data: data.slice(start, end),
      total: data.length,
      page,
      pageSize,
      totalPages: Math.ceil(data.length / pageSize)
    };
  }

  // Mock sort function
  performSort(data, sortBy, sortOrder) {
    return [...data].sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Run performance test
  async runTest(testName, testFunction, expectedMaxTime) {
    console.log(`🧪 Running test: ${testName}`);
    
    const startTime = performance.now();
    
    try {
      const result = await testFunction();
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      const passed = executionTime <= expectedMaxTime;
      
      const testResult = {
        name: testName,
        executionTime: Math.round(executionTime * 100) / 100,
        expectedMaxTime,
        passed,
        resultSize: Array.isArray(result) ? result.length : (result.data ? result.data.length : 0)
      };
      
      this.results.tests.push(testResult);
      
      if (passed) {
        console.log(`✅ ${testName}: ${testResult.executionTime}ms (limit: ${expectedMaxTime}ms) - PASSED`);
        this.results.summary.passed++;
      } else {
        console.log(`❌ ${testName}: ${testResult.executionTime}ms (limit: ${expectedMaxTime}ms) - FAILED`);
        this.results.summary.failed++;
      }
      
      this.results.summary.totalTime += executionTime;
      
      return result;
    } catch (error) {
      console.error(`💥 ${testName}: ERROR - ${error.message}`);
      this.results.tests.push({
        name: testName,
        executionTime: 0,
        expectedMaxTime,
        passed: false,
        error: error.message
      });
      this.results.summary.failed++;
    }
  }

  // Run all performance tests
  async runAllTests() {
    console.log('🚀 Starting performance tests...\n');
    
    this.generateTestData();
    console.log('');

    // Test 1: Search Performance
    await this.runTest(
      'Search Performance',
      () => this.performSearch('Usuario', this.testData.users),
      CONFIG.PERFORMANCE_THRESHOLDS.SEARCH_MAX_TIME
    );

    // Test 2: Filter Performance
    await this.runTest(
      'Filter Performance',
      () => this.performFilter({
        school_id: 'school_1',
        generation_id: 'gen_1',
        status: 'active'
      }, this.testData.users),
      CONFIG.PERFORMANCE_THRESHOLDS.FILTER_MAX_TIME
    );

    // Test 3: Pagination Performance
    await this.runTest(
      'Pagination Performance',
      () => this.performPagination(this.testData.users, 5, 20),
      CONFIG.PERFORMANCE_THRESHOLDS.PAGINATION_MAX_TIME
    );

    // Test 4: Sort Performance
    await this.runTest(
      'Sort Performance',
      () => this.performSort(this.testData.users, 'completion_percentage', 'desc'),
      CONFIG.PERFORMANCE_THRESHOLDS.PAGINATION_MAX_TIME
    );

    // Test 5: Combined Operations (realistic scenario)
    await this.runTest(
      'Combined Operations',
      () => {
        let result = this.performSearch('Test', this.testData.users);
        result = this.performFilter({ status: 'active' }, result);
        result = this.performSort(result, 'last_activity_date', 'desc');
        return this.performPagination(result, 1, 20);
      },
      CONFIG.PERFORMANCE_THRESHOLDS.TABLE_RENDER_MAX_TIME
    );

    // Test 6: Large Dataset Filter
    await this.runTest(
      'Large Dataset Filter',
      () => {
        // Filter by completion percentage (should hit most records)
        return this.testData.users.filter(user => user.completion_percentage > 0);
      },
      CONFIG.PERFORMANCE_THRESHOLDS.FILTER_MAX_TIME
    );

    // Test 7: Complex Query Simulation
    await this.runTest(
      'Complex Query Simulation',
      () => {
        // Simulate aggregating data for charts
        const schoolStats = {};
        this.testData.users.forEach(user => {
          if (!schoolStats[user.school_id]) {
            schoolStats[user.school_id] = {
              name: user.school_name,
              totalUsers: 0,
              totalTime: 0,
              avgCompletion: 0,
              completions: []
            };
          }
          schoolStats[user.school_id].totalUsers++;
          schoolStats[user.school_id].totalTime += user.total_time_spent_minutes;
          schoolStats[user.school_id].completions.push(user.completion_percentage);
        });

        // Calculate averages
        Object.values(schoolStats).forEach(school => {
          school.avgCompletion = school.completions.reduce((a, b) => a + b, 0) / school.completions.length;
          school.avgTime = school.totalTime / school.totalUsers;
        });

        return Object.values(schoolStats);
      },
      CONFIG.PERFORMANCE_THRESHOLDS.CHART_RENDER_MAX_TIME
    );

    // Calculate summary
    this.results.summary.averageTime = this.results.summary.totalTime / this.results.tests.length;
    
    this.printResults();
  }

  // Print test results
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 PERFORMANCE TEST RESULTS');
    console.log('='.repeat(60));
    
    console.log('\n📊 Test Summary:');
    console.log(`✅ Passed: ${this.results.summary.passed}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`⏱️  Total Time: ${Math.round(this.results.summary.totalTime)}ms`);
    console.log(`📈 Average Time: ${Math.round(this.results.summary.averageTime)}ms`);
    
    const successRate = (this.results.summary.passed / this.results.tests.length) * 100;
    console.log(`🎯 Success Rate: ${Math.round(successRate)}%`);

    console.log('\n📝 Detailed Results:');
    console.table(this.results.tests.map(test => ({
      Test: test.name,
      'Time (ms)': test.executionTime,
      'Limit (ms)': test.expectedMaxTime,
      'Result Size': test.resultSize || 'N/A',
      Status: test.passed ? '✅ PASS' : '❌ FAIL'
    })));

    console.log('\n💡 Performance Recommendations:');
    
    const slowTests = this.results.tests.filter(test => 
      test.executionTime > test.expectedMaxTime * 0.8
    );
    
    if (slowTests.length > 0) {
      console.log('⚠️  Tests approaching performance limits:');
      slowTests.forEach(test => {
        console.log(`   - ${test.name}: ${test.executionTime}ms (${Math.round((test.executionTime / test.expectedMaxTime) * 100)}% of limit)`);
      });
    } else {
      console.log('✅ All tests are performing well within limits');
    }

    console.log('\n🔧 Optimization Suggestions:');
    console.log('   - Implement virtual scrolling for tables > 100 rows');
    console.log('   - Use debounced search with 300ms delay');
    console.log('   - Cache filter results for 5 minutes');
    console.log('   - Lazy load chart data on tab switch');
    console.log('   - Implement server-side pagination for > 1000 records');

    console.log('\n' + '='.repeat(60));
    
    // Exit with appropriate code
    process.exit(this.results.summary.failed > 0 ? 1 : 0);
  }
}

// Memory usage monitoring
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(usage.external / 1024 / 1024 * 100) / 100
  };
}

// Main execution
async function main() {
  console.log('🏁 Genera Performance Test Suite');
  console.log(`📊 Testing with ${CONFIG.TEST_USER_COUNT} users`);
  console.log(`💾 Initial memory usage: ${JSON.stringify(getMemoryUsage())} MB\n`);

  const testRunner = new PerformanceTestRunner();
  await testRunner.runAllTests();

  console.log(`💾 Final memory usage: ${JSON.stringify(getMemoryUsage())} MB`);
}

// Run tests if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = PerformanceTestRunner;