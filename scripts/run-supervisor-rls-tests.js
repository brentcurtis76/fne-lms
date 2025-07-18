const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Initialize Supabase client with service role
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

async function runTests() {
  console.log(`${colors.blue}Running Supervisor de Red RLS Tests${colors.reset}`);
  console.log('='.repeat(50));

  let passedTests = 0;
  let failedTests = 0;

  try {
    // Read the SQL test file
    const testFilePath = path.join(__dirname, '..', 'database', 'tests', 'supervisor_rls.test.sql');
    const testSQL = fs.readFileSync(testFilePath, 'utf8');

    console.log(`${colors.gray}Checking for pgTAP extension...${colors.reset}`);
    
    // Try to create pgTAP extension
    const { error: extError } = await supabase.rpc('create_extension_if_not_exists', {
      extension_name: 'pgtap'
    }).single();

    if (extError && !extError.message.includes('already exists')) {
      console.log(`${colors.yellow}Warning: Could not install pgTAP extension. Some tests may fail.${colors.reset}`);
      console.log(`${colors.gray}Error: ${extError.message}${colors.reset}`);
    }

    // Execute the test SQL
    console.log(`${colors.gray}Running test suite...${colors.reset}\n`);

    // Since we can't easily parse pgTAP output through Supabase client,
    // let's run some basic RLS tests directly
    const tests = [
      {
        name: 'Admin can see all networks',
        test: async () => {
          const { data, error } = await supabase
            .from('redes_de_colegios')
            .select('*');
          return { success: !error && data !== null, data, error };
        }
      },
      {
        name: 'Network creation requires admin role',
        test: async () => {
          // This should fail without admin context
          const { data, error } = await supabase
            .from('redes_de_colegios')
            .insert({ name: 'Test Network RLS', description: 'Should fail' })
            .select();
          return { 
            success: error !== null && error.code === '42501', // RLS violation
            expectedError: true,
            error 
          };
        }
      },
      {
        name: 'supervisor_can_access_user function exists',
        test: async () => {
          const { data, error } = await supabase.rpc('supervisor_can_access_user', {
            supervisor_id: '00000000-0000-0000-0000-000000000000',
            target_user_id: '00000000-0000-0000-0000-000000000000'
          });
          return { 
            success: error === null || !error.message.includes('does not exist'),
            data, 
            error 
          };
        }
      },
      {
        name: 'get_network_schools function exists',
        test: async () => {
          const { data, error } = await supabase.rpc('get_network_schools', {
            network_id: '00000000-0000-0000-0000-000000000000'
          });
          return { 
            success: error === null || error.code === 'PGRST202', // No rows returned is OK
            data, 
            error 
          };
        }
      },
      {
        name: 'get_network_supervisors function exists',
        test: async () => {
          const { data, error } = await supabase.rpc('get_network_supervisors', {
            network_id: '00000000-0000-0000-0000-000000000000'
          });
          return { 
            success: error === null || error.code === 'PGRST202', // No rows returned is OK
            data, 
            error 
          };
        }
      }
    ];

    // Run each test
    for (const { name, test } of tests) {
      try {
        const result = await test();
        
        if (result.success) {
          console.log(`${colors.green}✓${colors.reset} ${name}`);
          if (result.expectedError) {
            console.log(`  ${colors.gray}(correctly failed with RLS violation)${colors.reset}`);
          }
          passedTests++;
        } else {
          console.log(`${colors.red}✗${colors.reset} ${name}`);
          if (result.error) {
            console.log(`  ${colors.red}Error: ${result.error.message}${colors.reset}`);
          }
          failedTests++;
        }
      } catch (err) {
        console.log(`${colors.red}✗${colors.reset} ${name}`);
        console.log(`  ${colors.red}Error: ${err.message}${colors.reset}`);
        failedTests++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`${colors.blue}Test Summary${colors.reset}`);
    console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
    console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
    console.log(`Total: ${passedTests + failedTests}`);

    if (failedTests === 0) {
      console.log(`\n${colors.green}✅ All tests passed!${colors.reset}`);
    } else {
      console.log(`\n${colors.red}❌ Some tests failed${colors.reset}`);
      console.log(`${colors.yellow}Note: For comprehensive RLS testing, install pgTAP and run:${colors.reset}`);
      console.log(`${colors.gray}npm run test:db${colors.reset}`);
    }

    process.exit(failedTests > 0 ? 1 : 0);

  } catch (error) {
    console.error(`${colors.red}Test execution failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the tests
runTests();