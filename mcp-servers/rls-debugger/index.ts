#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[RLS-DEBUGGER-MCP] Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
}

// Create admin Supabase client
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Define tools
const tools: Tool[] = [
  {
    name: 'test_rls_policy',
    description: 'Test if a specific user can perform an operation (SELECT, INSERT, UPDATE, DELETE) on a table. Creates a temporary session for that user and attempts the operation.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The name of the table to test (e.g., "courses", "users")'
        },
        user_id: {
          type: 'string',
          description: 'The UUID of the user to test access for'
        },
        operation: {
          type: 'string',
          enum: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
          description: 'The operation to test'
        },
        schema_name: {
          type: 'string',
          description: 'The schema name (default: "public")',
          default: 'public'
        },
        test_data: {
          type: 'object',
          description: 'Optional test data for INSERT/UPDATE operations',
        },
        record_id: {
          type: 'string',
          description: 'Optional record ID for UPDATE/DELETE operations'
        }
      },
      required: ['table_name', 'user_id', 'operation']
    }
  },
  {
    name: 'get_rls_policies',
    description: 'Get all RLS policies for a specific table, including policy names, commands, and the USING/WITH CHECK clauses.',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'The name of the table to get policies for'
        },
        schema_name: {
          type: 'string',
          description: 'The schema name (default: "public")',
          default: 'public'
        }
      },
      required: ['table_name']
    }
  },
  {
    name: 'find_rls_gaps',
    description: 'Find tables that don\'t have proper RLS policies. Checks if RLS is enabled and if policies exist for all CRUD operations.',
    inputSchema: {
      type: 'object',
      properties: {
        schema_name: {
          type: 'string',
          description: 'The schema name to check (default: "public")',
          default: 'public'
        },
        include_system_tables: {
          type: 'boolean',
          description: 'Include system tables in the check (default: false)',
          default: false
        }
      }
    }
  }
];

/**
 * Execute SQL query with user context (for RLS testing)
 * This sets the role and JWT claims before executing the query
 */
async function executeAsUser(userId: string, sql: string): Promise<any> {
  console.error(`[RLS-DEBUGGER-MCP] Executing SQL as user: ${userId}`);

  // Verify user exists
  const { data: userData, error: userError } = await adminClient.auth.admin.listUsers();

  if (userError) {
    throw new Error(`Failed to get user list: ${userError.message}`);
  }

  const userList = userData?.users ?? [];
  const user = userList.find(u => u.id === userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Get user roles from database
  const { data: userRoles, error: rolesError } = await adminClient
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId);

  const roles = userRoles?.map(r => r.role_type) || [];

  // Execute query with user context
  // We use a transaction to set local variables that RLS policies can check
  const contextSql = `
    BEGIN;
    -- Set the role to authenticated to trigger RLS
    SET LOCAL role TO authenticated;

    -- Set JWT claims that RLS policies typically check
    SET LOCAL request.jwt.claims TO '${JSON.stringify({
      sub: userId,
      email: user.email,
      role: roles.length > 0 ? roles[0] : 'authenticated',
      user_metadata: {
        roles: roles
      }
    }).replace(/'/g, "''")}';

    -- Execute the actual query
    ${sql};

    COMMIT;
  `;

  try {
    const { data, error } = await adminClient.rpc('exec_sql', {
      sql: contextSql
    });

    return { data, error };
  } catch (error: any) {
    return { data: null, error };
  }
}

/**
 * Test RLS policy for a specific user and operation
 */
async function testRlsPolicy(args: any) {
  const {
    table_name,
    user_id,
    operation,
    schema_name = 'public',
    test_data,
    record_id
  } = args;

  console.error(`[RLS-DEBUGGER-MCP] Testing ${operation} on ${schema_name}.${table_name} for user ${user_id}`);

  try {
    let sql: string;

    switch (operation.toUpperCase()) {
      case 'SELECT':
        if (record_id) {
          sql = `SELECT * FROM ${schema_name}.${table_name} WHERE id = '${record_id}'`;
        } else {
          sql = `SELECT * FROM ${schema_name}.${table_name} LIMIT 1`;
        }
        break;

      case 'INSERT':
        if (!test_data) {
          return {
            success: false,
            error: 'test_data is required for INSERT operations',
            details: 'Provide a test_data object with the fields to insert'
          };
        }
        const insertColumns = Object.keys(test_data).join(', ');
        const insertValues = Object.values(test_data)
          .map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v)
          .join(', ');
        sql = `INSERT INTO ${schema_name}.${table_name} (${insertColumns}) VALUES (${insertValues}) RETURNING *`;
        break;

      case 'UPDATE':
        if (!record_id) {
          return {
            success: false,
            error: 'record_id is required for UPDATE operations',
            details: 'Provide a record_id to update'
          };
        }
        if (!test_data) {
          return {
            success: false,
            error: 'test_data is required for UPDATE operations',
            details: 'Provide a test_data object with the fields to update'
          };
        }
        const updateSet = Object.entries(test_data)
          .map(([k, v]) => `${k} = ${typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v}`)
          .join(', ');
        sql = `UPDATE ${schema_name}.${table_name} SET ${updateSet} WHERE id = '${record_id}' RETURNING *`;
        break;

      case 'DELETE':
        if (!record_id) {
          return {
            success: false,
            error: 'record_id is required for DELETE operations',
            details: 'Provide a record_id to delete'
          };
        }
        sql = `DELETE FROM ${schema_name}.${table_name} WHERE id = '${record_id}' RETURNING *`;
        break;

      default:
        return {
          success: false,
          error: `Invalid operation: ${operation}`,
          details: 'Must be one of: SELECT, INSERT, UPDATE, DELETE'
        };
    }

    // Execute the SQL with user context
    const result = await executeAsUser(user_id, sql);

    if (result.error) {
      console.error(`[RLS-DEBUGGER-MCP] Operation failed:`, result.error);
      const errorMessage = result.error.message || String(result.error);
      return {
        success: false,
        operation,
        table: `${schema_name}.${table_name}`,
        user_id,
        error: errorMessage,
        sql_executed: sql,
        blocked_by_rls: errorMessage.toLowerCase().includes('policy') ||
                        errorMessage.toLowerCase().includes('permission') ||
                        errorMessage.toLowerCase().includes('row-level security')
      };
    }

    console.error(`[RLS-DEBUGGER-MCP] Operation succeeded`);
    return {
      success: true,
      operation,
      table: `${schema_name}.${table_name}`,
      user_id,
      data: result.data,
      sql_executed: sql,
      message: `${operation} operation succeeded`,
      records_affected: Array.isArray(result.data) ? result.data.length : (result.data ? 1 : 0)
    };

  } catch (error: any) {
    console.error(`[RLS-DEBUGGER-MCP] Unexpected error:`, error);
    return {
      success: false,
      operation,
      table: `${schema_name}.${table_name}`,
      user_id,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Get all RLS policies for a table
 */
async function getRlsPolicies(args: any) {
  const { table_name, schema_name = 'public' } = args;

  console.error(`[RLS-DEBUGGER-MCP] Getting RLS policies for ${schema_name}.${table_name}`);

  try {
    // Check if RLS is enabled
    const { data: rlsStatus, error: rlsError } = await adminClient.rpc('exec_sql', {
      sql: `
        SELECT relrowsecurity as rls_enabled
        FROM pg_class
        WHERE relname = '${table_name}'
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema_name}')
      `
    });

    // Get policies from pg_policies view
    const { data: policies, error: policiesError } = await adminClient
      .from('pg_policies')
      .select('*')
      .eq('tablename', table_name)
      .eq('schemaname', schema_name);

    if (policiesError) {
      // If pg_policies view is not accessible, try direct query
      const { data: directPolicies, error: directError } = await adminClient.rpc('exec_sql', {
        sql: `
          SELECT
            policyname as name,
            cmd as command,
            qual as using_clause,
            with_check as with_check_clause,
            roles
          FROM pg_policies
          WHERE tablename = '${table_name}'
            AND schemaname = '${schema_name}'
        `
      });

      if (directError) {
        throw new Error(`Failed to get policies: ${directError.message}`);
      }

      return {
        success: true,
        table: `${schema_name}.${table_name}`,
        rls_enabled: rlsStatus?.[0]?.rls_enabled ?? 'unknown',
        policies: directPolicies || [],
        policy_count: directPolicies?.length || 0
      };
    }

    return {
      success: true,
      table: `${schema_name}.${table_name}`,
      rls_enabled: rlsStatus?.[0]?.rls_enabled ?? 'unknown',
      policies: policies || [],
      policy_count: policies?.length || 0,
      policies_by_command: {
        SELECT: policies?.filter(p => p.cmd === 'SELECT') || [],
        INSERT: policies?.filter(p => p.cmd === 'INSERT') || [],
        UPDATE: policies?.filter(p => p.cmd === 'UPDATE') || [],
        DELETE: policies?.filter(p => p.cmd === 'DELETE') || [],
        ALL: policies?.filter(p => p.cmd === 'ALL' || p.cmd === '*') || []
      }
    };

  } catch (error: any) {
    console.error(`[RLS-DEBUGGER-MCP] Error getting policies:`, error);
    return {
      success: false,
      table: `${schema_name}.${table_name}`,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Find tables with missing or incomplete RLS policies
 */
async function findRlsGaps(args: any) {
  const { schema_name = 'public', include_system_tables = false } = args;

  console.error(`[RLS-DEBUGGER-MCP] Finding RLS gaps in schema: ${schema_name}`);

  try {
    // Get all tables in the schema
    const { data: tables, error: tablesError } = await adminClient.rpc('exec_sql', {
      sql: `
        SELECT
          c.relname as table_name,
          c.relrowsecurity as rls_enabled,
          (SELECT COUNT(*) FROM pg_policies WHERE tablename = c.relname AND schemaname = '${schema_name}') as policy_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = '${schema_name}'
          AND c.relkind = 'r'
          ${!include_system_tables ? "AND c.relname NOT LIKE 'pg_%' AND c.relname NOT LIKE 'sql_%'" : ''}
        ORDER BY c.relname
      `
    });

    if (tablesError) {
      throw new Error(`Failed to get tables: ${tablesError.message}`);
    }

    const gaps = [];

    for (const table of tables || []) {
      const issues = [];

      // Check if RLS is enabled
      if (!table.rls_enabled) {
        issues.push('RLS is not enabled');
      }

      // Check if policies exist
      if (table.policy_count === 0) {
        issues.push('No policies defined');
      } else {
        // Get detailed policy info
        const { data: policies } = await adminClient.rpc('exec_sql', {
          sql: `
            SELECT cmd as command
            FROM pg_policies
            WHERE tablename = '${table.table_name}'
              AND schemaname = '${schema_name}'
          `
        });

        const commands = new Set((policies || []).map((p: any) => p.command));

        // Check for missing CRUD operations
        const requiredOps = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
        const missingOps = requiredOps.filter(op =>
          !commands.has(op) && !commands.has('ALL') && !commands.has('*')
        );

        if (missingOps.length > 0) {
          issues.push(`Missing policies for: ${missingOps.join(', ')}`);
        }
      }

      if (issues.length > 0) {
        gaps.push({
          table_name: table.table_name,
          rls_enabled: table.rls_enabled,
          policy_count: table.policy_count,
          issues
        });
      }
    }

    console.error(`[RLS-DEBUGGER-MCP] Found ${gaps.length} tables with RLS gaps`);

    return {
      success: true,
      schema: schema_name,
      total_tables: tables?.length || 0,
      tables_with_gaps: gaps.length,
      gaps,
      summary: {
        no_rls_enabled: gaps.filter(g => g.issues.includes('RLS is not enabled')).length,
        no_policies: gaps.filter(g => g.issues.includes('No policies defined')).length,
        incomplete_policies: gaps.filter(g => g.issues.some(i => i.startsWith('Missing policies'))).length
      }
    };

  } catch (error: any) {
    console.error(`[RLS-DEBUGGER-MCP] Error finding RLS gaps:`, error);
    return {
      success: false,
      schema: schema_name,
      error: error.message,
      stack: error.stack
    };
  }
}

// Create and configure server
const server = new Server(
  {
    name: 'rls-debugger',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[RLS-DEBUGGER-MCP] Listing available tools');
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[RLS-DEBUGGER-MCP] Tool called: ${name}`);

  try {
    switch (name) {
      case 'test_rls_policy':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await testRlsPolicy(args), null, 2)
            }
          ]
        };

      case 'get_rls_policies':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await getRlsPolicies(args), null, 2)
            }
          ]
        };

      case 'find_rls_gaps':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await findRlsGaps(args), null, 2)
            }
          ]
        };

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`
              })
            }
          ],
          isError: true
        };
    }
  } catch (error: any) {
    console.error(`[RLS-DEBUGGER-MCP] Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
          }, null, 2)
        }
      ],
      isError: true
    };
  }
});

// Start server
async function main() {
  console.error('[RLS-DEBUGGER-MCP] Starting RLS Debugger MCP server...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[RLS-DEBUGGER-MCP] Server running and ready to accept requests');
}

main().catch((error) => {
  console.error('[RLS-DEBUGGER-MCP] Fatal error:', error);
  process.exit(1);
});
