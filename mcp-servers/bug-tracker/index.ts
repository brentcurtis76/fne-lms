#!/usr/bin/env node

/**
 * Bug Tracker MCP Server
 *
 * Model Context Protocol server for tracking and managing bugs in the FNE LMS system.
 * Provides tools for logging bugs, searching historical issues, finding similar bugs,
 * updating bug status, and recording debugging sessions.
 *
 * @see database/migrations/103_create_debugging_infrastructure.sql
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

type BugCategory = 'auth' | 'database' | 'ui' | 'rls' | 'realtime' | 'performance' | 'api';
type BugSeverity = 'critical' | 'high' | 'medium' | 'low';
type BugStatus = 'open' | 'investigating' | 'resolved' | 'wont_fix';
type BugEnvironment = 'development' | 'staging' | 'production';
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogBugParams {
  title: string;
  category: BugCategory;
  severity: BugSeverity;
  description?: string;
  error_message?: string;
  stack_trace?: string;
  reproduction_steps?: string;
  affected_files?: string[];
  related_roles?: string[];
  environment?: BugEnvironment;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface SearchBugsParams {
  query?: string;
  category?: BugCategory;
  severity?: BugSeverity;
  status?: BugStatus;
  tags?: string[];
  limit?: number;
}

interface GetSimilarBugsParams {
  bug_id?: string;
  search_text?: string;
  similarity_threshold?: number;
  limit?: number;
}

interface UpdateBugParams {
  bug_id: string;
  status?: BugStatus;
  solution?: string;
  resolved_at?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface LogDebugSessionParams {
  bug_id: string;
  agent_version?: string;
  steps_taken?: Array<Record<string, any>>;
  outcome?: string;
  files_modified?: string[];
  completed?: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[BUG-TRACKER-MCP] ERROR: Missing required environment variables');
  console.error('[BUG-TRACKER-MCP] Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('[BUG-TRACKER-MCP] Supabase client initialized');

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS: Tool[] = [
  {
    name: 'log_bug',
    description: 'Record a new bug in the debugging system. Captures all relevant information including error messages, stack traces, affected files, and metadata for future reference and pattern matching.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short, descriptive title of the bug'
        },
        category: {
          type: 'string',
          enum: ['auth', 'database', 'ui', 'rls', 'realtime', 'performance', 'api'],
          description: 'System area where bug occurred'
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Bug severity level'
        },
        description: {
          type: 'string',
          description: 'Detailed description of the bug'
        },
        error_message: {
          type: 'string',
          description: 'Error message text'
        },
        stack_trace: {
          type: 'string',
          description: 'Full stack trace of the error'
        },
        reproduction_steps: {
          type: 'string',
          description: 'Steps to reproduce the bug'
        },
        affected_files: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of file paths affected by this bug'
        },
        related_roles: {
          type: 'array',
          items: { type: 'string' },
          description: 'User roles that may be affected'
        },
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          description: 'Environment where bug occurred (default: development)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorization and search'
        },
        metadata: {
          type: 'object',
          description: 'Additional context as JSON'
        }
      },
      required: ['title', 'category', 'severity']
    }
  },
  {
    name: 'search_bugs',
    description: 'Search for historical bugs using various filters. Useful for finding past issues, checking if a bug has been seen before, or analyzing bug patterns over time.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Full-text search query across title, description, and error messages'
        },
        category: {
          type: 'string',
          enum: ['auth', 'database', 'ui', 'rls', 'realtime', 'performance', 'api'],
          description: 'Filter by bug category'
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Filter by severity level'
        },
        status: {
          type: 'string',
          enum: ['open', 'investigating', 'resolved', 'wont_fix'],
          description: 'Filter by bug status'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (bugs matching any of the provided tags)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)'
        }
      }
    }
  },
  {
    name: 'get_similar_bugs',
    description: 'Find bugs similar to a given bug or search text using pattern matching and full-text search. Helps identify duplicate issues or related problems that might have known solutions.',
    inputSchema: {
      type: 'object',
      properties: {
        bug_id: {
          type: 'string',
          description: 'UUID of the bug to find similar issues for'
        },
        search_text: {
          type: 'string',
          description: 'Text to search for similar bugs (alternative to bug_id)'
        },
        similarity_threshold: {
          type: 'number',
          description: 'Minimum similarity score (0.0-1.0, default: 0.3)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 5)'
        }
      }
    }
  },
  {
    name: 'update_bug',
    description: 'Update an existing bug\'s status, solution, or other fields. Use this when a bug has been resolved, needs status changes, or requires additional information.',
    inputSchema: {
      type: 'object',
      properties: {
        bug_id: {
          type: 'string',
          description: 'UUID of the bug to update'
        },
        status: {
          type: 'string',
          enum: ['open', 'investigating', 'resolved', 'wont_fix'],
          description: 'New status for the bug'
        },
        solution: {
          type: 'string',
          description: 'Description of the solution or fix'
        },
        resolved_at: {
          type: 'string',
          description: 'ISO 8601 timestamp when bug was resolved'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated tags (replaces existing tags)'
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata (merged with existing)'
        }
      },
      required: ['bug_id']
    }
  },
  {
    name: 'log_debug_session',
    description: 'Record a debugging session including the steps taken, files modified, and outcome. Creates a record of how a bug was investigated and resolved for future reference.',
    inputSchema: {
      type: 'object',
      properties: {
        bug_id: {
          type: 'string',
          description: 'UUID of the bug being debugged'
        },
        agent_version: {
          type: 'string',
          description: 'Version of Claude or debugging agent (e.g., "claude-sonnet-4-5")'
        },
        steps_taken: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of step objects documenting the debugging process'
        },
        outcome: {
          type: 'string',
          description: 'Final result or resolution notes'
        },
        files_modified: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files that were modified during debugging'
        },
        completed: {
          type: 'boolean',
          description: 'Whether the session is complete (sets completed_at timestamp)'
        }
      },
      required: ['bug_id']
    }
  }
];

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

/**
 * Log a new bug to the debugging system
 */
async function logBug(params: LogBugParams) {
  console.log('[BUG-TRACKER-MCP] Logging new bug:', params.title);

  try {
    const { data, error } = await supabase
      .from('debug_bugs')
      .insert({
        title: params.title,
        category: params.category,
        severity: params.severity,
        description: params.description,
        error_message: params.error_message,
        stack_trace: params.stack_trace,
        reproduction_steps: params.reproduction_steps,
        affected_files: params.affected_files,
        related_roles: params.related_roles,
        environment: params.environment || 'development',
        tags: params.tags || [],
        metadata: params.metadata || {},
        status: 'open',
        reported_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[BUG-TRACKER-MCP] Error logging bug:', error);
      throw error;
    }

    console.log('[BUG-TRACKER-MCP] Bug logged successfully:', data.id);
    return {
      success: true,
      bug_id: data.id,
      message: `Bug logged successfully: ${data.title}`,
      data
    };
  } catch (error: any) {
    console.error('[BUG-TRACKER-MCP] Exception logging bug:', error);
    return {
      success: false,
      error: error.message || 'Failed to log bug',
      details: error
    };
  }
}

/**
 * Search for bugs using various filters
 */
async function searchBugs(params: SearchBugsParams) {
  console.log('[BUG-TRACKER-MCP] Searching bugs with filters:', params);

  try {
    let query = supabase.from('debug_bugs').select('*');

    // Apply filters
    if (params.category) {
      query = query.eq('category', params.category);
    }
    if (params.severity) {
      query = query.eq('severity', params.severity);
    }
    if (params.status) {
      query = query.eq('status', params.status);
    }
    if (params.tags && params.tags.length > 0) {
      query = query.overlaps('tags', params.tags);
    }

    // Full-text search if query provided
    if (params.query) {
      // Use the PostgreSQL full-text search function
      const { data: searchResults, error: searchError } = await supabase
        .rpc('search_bugs_by_similarity', {
          search_query: params.query,
          similarity_threshold: 0.1,
          result_limit: params.limit || 10
        });

      if (searchError) {
        console.error('[BUG-TRACKER-MCP] Search error:', searchError);
        throw searchError;
      }

      console.log('[BUG-TRACKER-MCP] Found', searchResults?.length || 0, 'bugs');
      return {
        success: true,
        count: searchResults?.length || 0,
        bugs: searchResults || []
      };
    }

    // Regular filtered query
    query = query
      .order('reported_at', { ascending: false })
      .limit(params.limit || 10);

    const { data, error } = await query;

    if (error) {
      console.error('[BUG-TRACKER-MCP] Search error:', error);
      throw error;
    }

    console.log('[BUG-TRACKER-MCP] Found', data?.length || 0, 'bugs');
    return {
      success: true,
      count: data?.length || 0,
      bugs: data || []
    };
  } catch (error: any) {
    console.error('[BUG-TRACKER-MCP] Exception searching bugs:', error);
    return {
      success: false,
      error: error.message || 'Failed to search bugs',
      details: error
    };
  }
}

/**
 * Get bugs similar to a given bug or search text
 */
async function getSimilarBugs(params: GetSimilarBugsParams) {
  console.log('[BUG-TRACKER-MCP] Finding similar bugs:', params);

  try {
    if (params.bug_id) {
      // Use the get_related_bugs function for tag/file-based similarity
      const { data, error } = await supabase
        .rpc('get_related_bugs', {
          target_bug_id: params.bug_id,
          result_limit: params.limit || 5
        });

      if (error) {
        console.error('[BUG-TRACKER-MCP] Error finding related bugs:', error);
        throw error;
      }

      console.log('[BUG-TRACKER-MCP] Found', data?.length || 0, 'similar bugs');
      return {
        success: true,
        count: data?.length || 0,
        similar_bugs: data || []
      };
    } else if (params.search_text) {
      // Use full-text similarity search
      const { data, error } = await supabase
        .rpc('search_bugs_by_similarity', {
          search_query: params.search_text,
          similarity_threshold: params.similarity_threshold || 0.3,
          result_limit: params.limit || 5
        });

      if (error) {
        console.error('[BUG-TRACKER-MCP] Error in similarity search:', error);
        throw error;
      }

      console.log('[BUG-TRACKER-MCP] Found', data?.length || 0, 'similar bugs');
      return {
        success: true,
        count: data?.length || 0,
        similar_bugs: data || []
      };
    } else {
      return {
        success: false,
        error: 'Either bug_id or search_text must be provided'
      };
    }
  } catch (error: any) {
    console.error('[BUG-TRACKER-MCP] Exception finding similar bugs:', error);
    return {
      success: false,
      error: error.message || 'Failed to find similar bugs',
      details: error
    };
  }
}

/**
 * Update an existing bug
 */
async function updateBug(params: UpdateBugParams) {
  console.log('[BUG-TRACKER-MCP] Updating bug:', params.bug_id);

  try {
    const updateData: any = {};

    if (params.status) {
      updateData.status = params.status;

      // Auto-set resolved_at if status is 'resolved' and not provided
      if (params.status === 'resolved' && !params.resolved_at) {
        updateData.resolved_at = new Date().toISOString();
      }
    }

    if (params.solution !== undefined) {
      updateData.solution = params.solution;
    }

    if (params.resolved_at) {
      updateData.resolved_at = params.resolved_at;
    }

    if (params.tags) {
      updateData.tags = params.tags;
    }

    if (params.metadata) {
      // Merge with existing metadata
      const { data: existing } = await supabase
        .from('debug_bugs')
        .select('metadata')
        .eq('id', params.bug_id)
        .single();

      updateData.metadata = {
        ...(existing?.metadata || {}),
        ...params.metadata
      };
    }

    const { data, error } = await supabase
      .from('debug_bugs')
      .update(updateData)
      .eq('id', params.bug_id)
      .select()
      .single();

    if (error) {
      console.error('[BUG-TRACKER-MCP] Error updating bug:', error);
      throw error;
    }

    console.log('[BUG-TRACKER-MCP] Bug updated successfully:', params.bug_id);
    return {
      success: true,
      message: 'Bug updated successfully',
      data
    };
  } catch (error: any) {
    console.error('[BUG-TRACKER-MCP] Exception updating bug:', error);
    return {
      success: false,
      error: error.message || 'Failed to update bug',
      details: error
    };
  }
}

/**
 * Log a debugging session
 */
async function logDebugSession(params: LogDebugSessionParams) {
  console.log('[BUG-TRACKER-MCP] Logging debug session for bug:', params.bug_id);

  try {
    const sessionData: any = {
      bug_id: params.bug_id,
      agent_version: params.agent_version || 'unknown',
      started_at: new Date().toISOString(),
      steps_taken: params.steps_taken || [],
      outcome: params.outcome,
      files_modified: params.files_modified || []
    };

    if (params.completed) {
      sessionData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('debug_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      console.error('[BUG-TRACKER-MCP] Error logging debug session:', error);
      throw error;
    }

    console.log('[BUG-TRACKER-MCP] Debug session logged successfully:', data.id);
    return {
      success: true,
      session_id: data.id,
      message: 'Debug session logged successfully',
      data
    };
  } catch (error: any) {
    console.error('[BUG-TRACKER-MCP] Exception logging debug session:', error);
    return {
      success: false,
      error: error.message || 'Failed to log debug session',
      details: error
    };
  }
}

// =============================================================================
// SERVER SETUP
// =============================================================================

const server = new Server(
  {
    name: 'bug-tracker',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log('[BUG-TRACKER-MCP] Listing available tools');
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log('[BUG-TRACKER-MCP] Tool called:', name);

  try {
    switch (name) {
      case 'log_bug':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await logBug(args as any as LogBugParams), null, 2)
            }
          ]
        };

      case 'search_bugs':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await searchBugs(args as any as SearchBugsParams), null, 2)
            }
          ]
        };

      case 'get_similar_bugs':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await getSimilarBugs(args as any as GetSimilarBugsParams), null, 2)
            }
          ]
        };

      case 'update_bug':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await updateBug(args as any as UpdateBugParams), null, 2)
            }
          ]
        };

      case 'log_debug_session':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await logDebugSession(args as any as LogDebugSessionParams), null, 2)
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
    console.error('[BUG-TRACKER-MCP] Error executing tool:', error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message || 'Tool execution failed',
            details: error
          })
        }
      ],
      isError: true
    };
  }
});

// =============================================================================
// START SERVER
// =============================================================================

async function main() {
  console.log('[BUG-TRACKER-MCP] Starting Bug Tracker MCP Server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('[BUG-TRACKER-MCP] Server running and ready to accept requests');
}

main().catch((error) => {
  console.error('[BUG-TRACKER-MCP] Fatal error:', error);
  process.exit(1);
});
