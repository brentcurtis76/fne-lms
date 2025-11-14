#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[LOG-ANALYZER-MCP] Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
}

// Create admin Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Define tools
const tools: Tool[] = [
  {
    name: 'analyze_logs',
    description: 'Analyze logs for patterns, errors, and trends. Returns statistics about log levels, sources, error rates, and top errors.',
    inputSchema: {
      type: 'object',
      properties: {
        time_range: {
          type: 'object',
          description: 'Time range for analysis',
          properties: {
            start: {
              type: 'string',
              description: 'Start time in ISO 8601 format (e.g., "2025-01-01T00:00:00Z")'
            },
            end: {
              type: 'string',
              description: 'End time in ISO 8601 format (e.g., "2025-01-02T00:00:00Z")'
            }
          }
        },
        log_level: {
          type: 'array',
          description: 'Filter by log levels (e.g., ["error", "warn"])',
          items: {
            type: 'string',
            enum: ['debug', 'info', 'warn', 'error']
          }
        },
        source_pattern: {
          type: 'string',
          description: 'Filter by source pattern (e.g., "api/*")'
        },
        group_by: {
          type: 'string',
          enum: ['level', 'source', 'hour', 'day'],
          description: 'How to group the results (default: "level")',
          default: 'level'
        }
      }
    }
  },
  {
    name: 'search_logs',
    description: 'Search logs by text pattern or context. Returns matching log entries with full details.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in log messages or context'
        },
        log_level: {
          type: 'array',
          description: 'Filter by log levels',
          items: {
            type: 'string',
            enum: ['debug', 'info', 'warn', 'error']
          }
        },
        source: {
          type: 'string',
          description: 'Filter by exact source (e.g., "api/courses/create")'
        },
        user_id: {
          type: 'string',
          description: 'Filter by user ID'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 100)',
          default: 100
        },
        offset: {
          type: 'number',
          description: 'Number of results to skip (default: 0)',
          default: 0
        }
      }
    }
  },
  {
    name: 'detect_anomalies',
    description: 'Detect unusual patterns in logs such as spikes in errors, new error types, or unusual activity patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        baseline_hours: {
          type: 'number',
          description: 'Number of hours to use as baseline for comparison (default: 24)',
          default: 24
        },
        sensitivity: {
          type: 'number',
          description: 'Sensitivity threshold for anomaly detection (default: 2.0 = 2x baseline)',
          default: 2.0
        },
        check_window_minutes: {
          type: 'number',
          description: 'Size of the window to check for anomalies in minutes (default: 60)',
          default: 60
        }
      }
    }
  },
  {
    name: 'link_logs_to_bug',
    description: 'Link related logs to an existing bug for better tracking and context.',
    inputSchema: {
      type: 'object',
      properties: {
        bug_id: {
          type: 'string',
          description: 'The ID of the bug to link logs to'
        },
        log_ids: {
          type: 'array',
          description: 'Array of log IDs to link to the bug',
          items: {
            type: 'string'
          }
        },
        auto_link: {
          type: 'boolean',
          description: 'If true, automatically find and link similar logs (default: false)',
          default: false
        },
        similarity_threshold: {
          type: 'number',
          description: 'For auto_link: minimum similarity score (0-1, default: 0.8)',
          default: 0.8
        }
      },
      required: ['bug_id']
    }
  }
];

/**
 * Analyze logs for patterns, errors, and trends
 */
async function analyzeLogs(args: any) {
  const {
    time_range,
    log_level,
    source_pattern,
    group_by = 'level'
  } = args;

  console.error('[LOG-ANALYZER-MCP] Analyzing logs with filters:', { time_range, log_level, source_pattern, group_by });

  try {
    // Build query
    let query = supabase.from('debug_logs').select('*', { count: 'exact' });

    // Apply time range filter
    if (time_range?.start) {
      query = query.gte('created_at', time_range.start);
    }
    if (time_range?.end) {
      query = query.lte('created_at', time_range.end);
    }

    // Apply log level filter
    if (log_level && log_level.length > 0) {
      query = query.in('level', log_level);
    }

    // Apply source pattern filter
    if (source_pattern) {
      query = query.ilike('source', source_pattern.replace('*', '%'));
    }

    const { data: logs, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch logs: ${error.message}`);
    }

    // Calculate statistics
    const byLevel: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const topErrors: Array<{ message: string; count: number; first_seen: string; last_seen: string }> = [];
    const errorMessages: Record<string, { count: number; first: string; last: string }> = {};

    logs?.forEach(log => {
      // Count by level
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;

      // Count by source
      bySource[log.source] = (bySource[log.source] || 0) + 1;

      // Track error messages
      if (log.level === 'error' && log.message) {
        if (!errorMessages[log.message]) {
          errorMessages[log.message] = {
            count: 0,
            first: log.created_at,
            last: log.created_at
          };
        }
        errorMessages[log.message].count++;
        if (log.created_at < errorMessages[log.message].first) {
          errorMessages[log.message].first = log.created_at;
        }
        if (log.created_at > errorMessages[log.message].last) {
          errorMessages[log.message].last = log.created_at;
        }
      }
    });

    // Convert error messages to top errors array
    Object.entries(errorMessages)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .forEach(([message, data]) => {
        topErrors.push({
          message,
          count: data.count,
          first_seen: data.first,
          last_seen: data.last
        });
      });

    // Calculate error rate
    const totalLogs = count || 0;
    const errorCount = byLevel['error'] || 0;
    const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;

    // Group results
    let groupedResults: any = {};
    if (group_by === 'level') {
      groupedResults = byLevel;
    } else if (group_by === 'source') {
      groupedResults = bySource;
    } else if (group_by === 'hour' || group_by === 'day') {
      // Group by time
      const timeGroups: Record<string, number> = {};
      logs?.forEach(log => {
        const date = new Date(log.created_at);
        const key = group_by === 'hour'
          ? date.toISOString().slice(0, 13) + ':00:00Z'
          : date.toISOString().slice(0, 10);
        timeGroups[key] = (timeGroups[key] || 0) + 1;
      });
      groupedResults = timeGroups;
    }

    console.error(`[LOG-ANALYZER-MCP] Analysis complete: ${totalLogs} logs, ${errorCount} errors`);

    return {
      success: true,
      total_logs: totalLogs,
      time_range: time_range || { start: 'all', end: 'all' },
      by_level: byLevel,
      by_source: Object.entries(bySource)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
      error_rate: `${errorRate.toFixed(2)}%`,
      top_errors: topErrors,
      grouped_by: group_by,
      grouped_results: groupedResults
    };

  } catch (error: any) {
    console.error('[LOG-ANALYZER-MCP] Error analyzing logs:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Search logs by text pattern or context
 */
async function searchLogs(args: any) {
  const {
    query: searchQuery,
    log_level,
    source,
    user_id,
    limit = 100,
    offset = 0
  } = args;

  console.error('[LOG-ANALYZER-MCP] Searching logs:', { searchQuery, log_level, source, user_id, limit, offset });

  try {
    let query = supabase
      .from('debug_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Search in message or context
    if (searchQuery) {
      query = query.or(`message.ilike.%${searchQuery}%,context.cs.{"search":"${searchQuery}"}`);
    }

    // Apply filters
    if (log_level && log_level.length > 0) {
      query = query.in('level', log_level);
    }

    if (source) {
      query = query.eq('source', source);
    }

    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      throw new Error(`Failed to search logs: ${error.message}`);
    }

    console.error(`[LOG-ANALYZER-MCP] Found ${logs?.length || 0} matching logs`);

    return {
      success: true,
      total_matches: logs?.length || 0,
      logs: logs || [],
      query: searchQuery,
      filters: { log_level, source, user_id },
      pagination: { limit, offset }
    };

  } catch (error: any) {
    console.error('[LOG-ANALYZER-MCP] Error searching logs:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Detect unusual patterns in logs
 */
async function detectAnomalies(args: any) {
  const {
    baseline_hours = 24,
    sensitivity = 2.0,
    check_window_minutes = 60
  } = args;

  console.error('[LOG-ANALYZER-MCP] Detecting anomalies:', { baseline_hours, sensitivity, check_window_minutes });

  try {
    const now = new Date();
    const checkWindowStart = new Date(now.getTime() - check_window_minutes * 60 * 1000);
    const baselineStart = new Date(now.getTime() - baseline_hours * 60 * 60 * 1000);

    // Get baseline data
    const { data: baselineLogs, error: baselineError } = await supabase
      .from('debug_logs')
      .select('level, source, message')
      .gte('created_at', baselineStart.toISOString())
      .lt('created_at', checkWindowStart.toISOString());

    if (baselineError) {
      throw new Error(`Failed to fetch baseline logs: ${baselineError.message}`);
    }

    // Get recent data
    const { data: recentLogs, error: recentError } = await supabase
      .from('debug_logs')
      .select('level, source, message, created_at')
      .gte('created_at', checkWindowStart.toISOString());

    if (recentError) {
      throw new Error(`Failed to fetch recent logs: ${recentError.message}`);
    }

    // Calculate baseline rates
    const baselineCount = baselineLogs?.length || 0;
    const baselineErrorCount = baselineLogs?.filter(l => l.level === 'error').length || 0;
    const baselineHours = baseline_hours - (check_window_minutes / 60);
    const baselineErrorRate = baselineCount > 0 ? baselineErrorCount / baselineHours : 0;

    // Calculate recent rates
    const recentCount = recentLogs?.length || 0;
    const recentErrorCount = recentLogs?.filter(l => l.level === 'error').length || 0;
    const recentHours = check_window_minutes / 60;
    const recentErrorRate = recentErrorCount / recentHours;

    const anomalies: Array<any> = [];

    // Check for error rate spike
    if (recentErrorRate > baselineErrorRate * sensitivity) {
      anomalies.push({
        type: 'error_spike',
        severity: 'high',
        description: `Error rate is ${(recentErrorRate / baselineErrorRate).toFixed(2)}x higher than baseline`,
        baseline_rate: baselineErrorRate.toFixed(2),
        current_rate: recentErrorRate.toFixed(2),
        threshold: sensitivity
      });
    }

    // Check for new error types
    const baselineErrorMessages = new Set(
      baselineLogs?.filter(l => l.level === 'error').map(l => l.message) || []
    );
    const newErrors = recentLogs
      ?.filter(l => l.level === 'error' && !baselineErrorMessages.has(l.message))
      .reduce((acc: Record<string, number>, log) => {
        acc[log.message] = (acc[log.message] || 0) + 1;
        return acc;
      }, {});

    if (newErrors && Object.keys(newErrors).length > 0) {
      anomalies.push({
        type: 'new_errors',
        severity: 'medium',
        description: `${Object.keys(newErrors).length} new error types detected`,
        new_error_types: Object.entries(newErrors).map(([message, count]) => ({
          message,
          count
        }))
      });
    }

    // Check for unusual sources
    const baselineSources = new Set(baselineLogs?.map(l => l.source) || []);
    const newSources = recentLogs
      ?.filter(l => !baselineSources.has(l.source))
      .map(l => l.source);

    if (newSources && newSources.length > 0) {
      const uniqueNewSources = [...new Set(newSources)];
      if (uniqueNewSources.length > 5) {
        anomalies.push({
          type: 'new_sources',
          severity: 'low',
          description: `${uniqueNewSources.length} new log sources detected`,
          new_sources: uniqueNewSources.slice(0, 10)
        });
      }
    }

    console.error(`[LOG-ANALYZER-MCP] Detected ${anomalies.length} anomalies`);

    return {
      success: true,
      anomalies_detected: anomalies.length,
      anomalies,
      baseline_period: `${baseline_hours} hours`,
      check_window: `${check_window_minutes} minutes`,
      baseline_stats: {
        total_logs: baselineCount,
        error_count: baselineErrorCount,
        error_rate_per_hour: baselineErrorRate.toFixed(2)
      },
      recent_stats: {
        total_logs: recentCount,
        error_count: recentErrorCount,
        error_rate_per_hour: recentErrorRate.toFixed(2)
      }
    };

  } catch (error: any) {
    console.error('[LOG-ANALYZER-MCP] Error detecting anomalies:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * Link logs to a bug
 */
async function linkLogsToBug(args: any) {
  const {
    bug_id,
    log_ids = [],
    auto_link = false,
    similarity_threshold = 0.8
  } = args;

  console.error('[LOG-ANALYZER-MCP] Linking logs to bug:', { bug_id, log_ids, auto_link });

  try {
    // Verify bug exists
    const { data: bug, error: bugError } = await supabase
      .from('bugs')
      .select('*')
      .eq('id', bug_id)
      .single();

    if (bugError || !bug) {
      throw new Error(`Bug not found: ${bug_id}`);
    }

    let logsToLink = log_ids;

    // Auto-link similar logs
    if (auto_link) {
      console.error('[LOG-ANALYZER-MCP] Auto-linking similar logs...');

      // Get existing linked logs to find patterns
      const { data: existingLinks } = await supabase
        .from('bug_logs')
        .select('log_id')
        .eq('bug_id', bug_id);

      if (existingLinks && existingLinks.length > 0) {
        const linkedLogIds = existingLinks.map(l => l.log_id);

        // Get the linked logs
        const { data: linkedLogs } = await supabase
          .from('debug_logs')
          .select('*')
          .in('id', linkedLogIds);

        if (linkedLogs && linkedLogs.length > 0) {
          // Find similar logs (simple similarity based on message and source)
          const sources = [...new Set(linkedLogs.map(l => l.source))];
          const errorPatterns = linkedLogs
            .filter(l => l.level === 'error')
            .map(l => l.message);

          // Search for similar logs
          const { data: similarLogs } = await supabase
            .from('debug_logs')
            .select('id')
            .in('source', sources)
            .eq('level', 'error')
            .limit(100);

          if (similarLogs) {
            const newLogIds = similarLogs
              .filter(l => !linkedLogIds.includes(l.id))
              .map(l => l.id);
            logsToLink = [...new Set([...logsToLink, ...newLogIds])];
          }
        }
      }
    }

    // Link logs to bug
    const linksToCreate = logsToLink.map((log_id: string) => ({
      bug_id,
      log_id,
      linked_at: new Date().toISOString()
    }));

    if (linksToCreate.length > 0) {
      const { data: links, error: linkError } = await supabase
        .from('bug_logs')
        .upsert(linksToCreate, { onConflict: 'bug_id,log_id' })
        .select();

      if (linkError) {
        throw new Error(`Failed to link logs: ${linkError.message}`);
      }

      console.error(`[LOG-ANALYZER-MCP] Linked ${links?.length || 0} logs to bug ${bug_id}`);

      return {
        success: true,
        bug_id,
        logs_linked: links?.length || 0,
        auto_linked: auto_link,
        links: links
      };
    } else {
      return {
        success: true,
        bug_id,
        logs_linked: 0,
        message: 'No logs to link'
      };
    }

  } catch (error: any) {
    console.error('[LOG-ANALYZER-MCP] Error linking logs to bug:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Create and configure server
const server = new Server(
  {
    name: 'log-analyzer',
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
  console.error('[LOG-ANALYZER-MCP] Listing available tools');
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[LOG-ANALYZER-MCP] Tool called: ${name}`);

  try {
    switch (name) {
      case 'analyze_logs':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await analyzeLogs(args), null, 2)
            }
          ]
        };

      case 'search_logs':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await searchLogs(args), null, 2)
            }
          ]
        };

      case 'detect_anomalies':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await detectAnomalies(args), null, 2)
            }
          ]
        };

      case 'link_logs_to_bug':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await linkLogsToBug(args), null, 2)
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
    console.error(`[LOG-ANALYZER-MCP] Error executing tool ${name}:`, error);
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
  console.error('[LOG-ANALYZER-MCP] Starting Log Analyzer MCP server...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[LOG-ANALYZER-MCP] Server running and ready to accept requests');
}

main().catch((error) => {
  console.error('[LOG-ANALYZER-MCP] Fatal error:', error);
  process.exit(1);
});
