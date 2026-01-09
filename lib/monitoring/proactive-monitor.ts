/**
 * Proactive Monitoring System
 *
 * Automatically monitors the application for issues and creates bugs when problems are detected.
 * Integrates with debug_logs and debug_bugs tables, and sends critical alerts to Sentry.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Monitoring rule definition
interface MonitoringRule {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'auth' | 'database' | 'rls' | 'performance' | 'realtime';
  check: (supabase: SupabaseClient) => Promise<{ passed: boolean; details?: any; count?: number }>;
  createBugIfFailed: boolean;
  threshold?: number; // For rate-based checks
}

// Bug creation data
interface BugCreationData {
  title: string;
  description: string;
  severity: string;
  category: string;
  status: string;
  detected_by?: string;
  metadata?: any;
}

export class ProactiveMonitor {
  private supabase: SupabaseClient;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs: number;
  private rules: MonitoringRule[];

  constructor(checkIntervalMs: number = 300000) { // Default: 5 minutes
    // Initialize Supabase client with service role for admin access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('[PROACTIVE-MONITOR] Missing Supabase credentials');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.checkIntervalMs = checkIntervalMs;
    this.rules = this.defineMonitoringRules();

    console.log(`[PROACTIVE-MONITOR] Initialized with ${this.rules.length} monitoring rules`);
  }

  /**
   * Define all monitoring rules
   */
  private defineMonitoringRules(): MonitoringRule[] {
    return [
      // Rule 1: High authentication failure rate
      {
        id: 'auth-failure-rate',
        name: 'High Authentication Failure Rate',
        description: 'Detects when authentication failures exceed normal thresholds',
        severity: 'critical',
        category: 'auth',
        threshold: 10, // 10 failures in check window
        createBugIfFailed: true,
        check: async (supabase: SupabaseClient) => {
          const checkWindowMinutes = 15;
          const threshold = 10;
          const since = new Date(Date.now() - checkWindowMinutes * 60 * 1000).toISOString();

          const { data: logs, error } = await supabase
            .from('debug_logs')
            .select('id, message, created_at')
            .eq('log_level', 'error')
            .ilike('message', '%authentication%')
            .gte('created_at', since);

          if (error) {
            console.error('[PROACTIVE-MONITOR] Error checking auth failures:', error);
            return { passed: true }; // Don't create bug for monitoring errors
          }

          const failureCount = logs?.length || 0;
          const passed = failureCount < threshold;

          return {
            passed,
            count: failureCount,
            details: {
              window_minutes: checkWindowMinutes,
              threshold,
              recent_failures: logs?.slice(0, 5).map(l => ({
                message: l.message,
                time: l.created_at
              }))
            }
          };
        }
      },

      // Rule 2: RLS policy denial spike
      {
        id: 'rls-denial-spike',
        name: 'RLS Policy Denial Spike',
        description: 'Detects spikes in Row Level Security policy denials',
        severity: 'high',
        category: 'rls',
        threshold: 20, // 20 denials in check window
        createBugIfFailed: true,
        check: async (supabase: SupabaseClient) => {
          const checkWindowMinutes = 15;
          const threshold = 20;
          const since = new Date(Date.now() - checkWindowMinutes * 60 * 1000).toISOString();

          const { data: logs, error } = await supabase
            .from('debug_logs')
            .select('id, message, source, created_at')
            .eq('log_level', 'error')
            .or('message.ilike.%permission denied%,message.ilike.%policy%,message.ilike.%rls%')
            .gte('created_at', since);

          if (error) {
            console.error('[PROACTIVE-MONITOR] Error checking RLS denials:', error);
            return { passed: true };
          }

          const denialCount = logs?.length || 0;
          const passed = denialCount < threshold;

          // Group by source to identify problematic areas
          const bySource: Record<string, number> = {};
          logs?.forEach(log => {
            bySource[log.source] = (bySource[log.source] || 0) + 1;
          });

          return {
            passed,
            count: denialCount,
            details: {
              window_minutes: checkWindowMinutes,
              threshold,
              by_source: bySource,
              top_sources: Object.entries(bySource)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([source, count]) => ({ source, count }))
            }
          };
        }
      },

      // Rule 3: Slow API response times
      {
        id: 'slow-api-responses',
        name: 'Slow API Response Times',
        description: 'Detects API endpoints with response times exceeding thresholds',
        severity: 'high',
        category: 'performance',
        threshold: 5, // 5 slow responses in check window
        createBugIfFailed: true,
        check: async (supabase: SupabaseClient) => {
          const checkWindowMinutes = 15;
          const threshold = 5;
          const responseTimeThreshold = 1000; // 1 second
          const since = new Date(Date.now() - checkWindowMinutes * 60 * 1000).toISOString();

          const { data: logs, error } = await supabase
            .from('debug_logs')
            .select('id, message, source, context, created_at')
            .gte('created_at', since);

          if (error) {
            console.error('[PROACTIVE-MONITOR] Error checking API response times:', error);
            return { passed: true };
          }

          // Filter logs with response time in context
          const slowLogs = logs?.filter(log => {
            const responseTime = log.context?.response_time_ms || log.context?.duration_ms;
            return responseTime && responseTime > responseTimeThreshold;
          }) || [];

          const passed = slowLogs.length < threshold;

          // Group by source
          const bySource: Record<string, { count: number; avg_time: number; max_time: number }> = {};
          slowLogs.forEach(log => {
            const responseTime = log.context?.response_time_ms || log.context?.duration_ms;
            if (!bySource[log.source]) {
              bySource[log.source] = { count: 0, avg_time: 0, max_time: 0 };
            }
            bySource[log.source].count++;
            bySource[log.source].max_time = Math.max(bySource[log.source].max_time, responseTime);
            bySource[log.source].avg_time += responseTime;
          });

          // Calculate averages
          Object.values(bySource).forEach(data => {
            data.avg_time = Math.round(data.avg_time / data.count);
          });

          return {
            passed,
            count: slowLogs.length,
            details: {
              window_minutes: checkWindowMinutes,
              threshold,
              response_time_threshold_ms: responseTimeThreshold,
              by_source: bySource,
              slowest_endpoints: Object.entries(bySource)
                .sort((a, b) => b[1].max_time - a[1].max_time)
                .slice(0, 3)
                .map(([source, data]) => ({
                  source,
                  count: data.count,
                  avg_time_ms: data.avg_time,
                  max_time_ms: data.max_time
                }))
            }
          };
        }
      },

      // Rule 4: Real-time connection failures
      {
        id: 'realtime-failures',
        name: 'Real-time Connection Failures',
        description: 'Detects failures in Supabase real-time subscriptions',
        severity: 'medium',
        category: 'realtime',
        threshold: 10, // 10 failures in check window
        createBugIfFailed: true,
        check: async (supabase: SupabaseClient) => {
          const checkWindowMinutes = 15;
          const threshold = 10;
          const since = new Date(Date.now() - checkWindowMinutes * 60 * 1000).toISOString();

          const { data: logs, error } = await supabase
            .from('debug_logs')
            .select('id, message, source, created_at')
            .eq('log_level', 'error')
            .or('message.ilike.%realtime%,message.ilike.%subscription%,message.ilike.%websocket%,source.ilike.%realtime%')
            .gte('created_at', since);

          if (error) {
            console.error('[PROACTIVE-MONITOR] Error checking realtime failures:', error);
            return { passed: true };
          }

          const failureCount = logs?.length || 0;
          const passed = failureCount < threshold;

          return {
            passed,
            count: failureCount,
            details: {
              window_minutes: checkWindowMinutes,
              threshold,
              recent_errors: logs?.slice(0, 5).map(l => ({
                source: l.source,
                message: l.message,
                time: l.created_at
              }))
            }
          };
        }
      },

      // Rule 5: Database migration/constraint errors
      {
        id: 'database-errors',
        name: 'Database Migration/Constraint Errors',
        description: 'Detects database constraint violations and migration errors',
        severity: 'critical',
        category: 'database',
        threshold: 5, // 5 errors in check window
        createBugIfFailed: true,
        check: async (supabase: SupabaseClient) => {
          const checkWindowMinutes = 15;
          const threshold = 5;
          const since = new Date(Date.now() - checkWindowMinutes * 60 * 1000).toISOString();

          const { data: logs, error } = await supabase
            .from('debug_logs')
            .select('id, message, source, created_at')
            .eq('log_level', 'error')
            .or('message.ilike.%constraint%,message.ilike.%migration%,message.ilike.%foreign key%,message.ilike.%unique violation%')
            .gte('created_at', since);

          if (error) {
            console.error('[PROACTIVE-MONITOR] Error checking database errors:', error);
            return { passed: true };
          }

          const errorCount = logs?.length || 0;
          const passed = errorCount < threshold;

          // Categorize errors
          const errorTypes: Record<string, number> = {
            constraint: 0,
            migration: 0,
            foreign_key: 0,
            unique: 0,
            other: 0
          };

          logs?.forEach(log => {
            const msg = log.message.toLowerCase();
            if (msg.includes('unique violation') || msg.includes('unique constraint')) {
              errorTypes.unique++;
            } else if (msg.includes('foreign key')) {
              errorTypes.foreign_key++;
            } else if (msg.includes('migration')) {
              errorTypes.migration++;
            } else if (msg.includes('constraint')) {
              errorTypes.constraint++;
            } else {
              errorTypes.other++;
            }
          });

          return {
            passed,
            count: errorCount,
            details: {
              window_minutes: checkWindowMinutes,
              threshold,
              error_types: errorTypes,
              recent_errors: logs?.slice(0, 5).map(l => ({
                source: l.source,
                message: l.message,
                time: l.created_at
              }))
            }
          };
        }
      }
    ];
  }

  /**
   * Check if a similar bug was created recently
   */
  private async hasSimilarRecentBug(rule: MonitoringRule): Promise<boolean> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentBugs, error } = await this.supabase
      .from('debug_bugs')
      .select('id, title, reported_at')
      .eq('detected_by', 'proactive-monitor')
      .ilike('title', `%${rule.name}%`)
      .gte('reported_at', oneDayAgo)
      .limit(1);

    if (error) {
      console.error('[PROACTIVE-MONITOR] Error checking for similar bugs:', error);
      return false; // Proceed to create bug if we can't check
    }

    return (recentBugs?.length || 0) > 0;
  }

  /**
   * Create a bug for a failed monitoring rule
   */
  private async createBugForFailure(
    rule: MonitoringRule,
    checkResult: { passed: boolean; details?: any; count?: number }
  ): Promise<void> {
    try {
      // Check for duplicate bugs
      const hasDuplicate = await this.hasSimilarRecentBug(rule);
      if (hasDuplicate) {
        console.log(`[PROACTIVE-MONITOR] Skipping bug creation for ${rule.id} - similar bug exists`);
        return;
      }

      const bugData: BugCreationData = {
        title: `[Auto-detected] ${rule.name}`,
        description: `${rule.description}\n\n**Auto-detected by proactive monitoring system**\n\nCheck failed with ${checkResult.count || 0} occurrences.\n\n**Details:**\n\`\`\`json\n${JSON.stringify(checkResult.details, null, 2)}\n\`\`\``,
        severity: rule.severity,
        category: rule.category,
        status: 'open',
        detected_by: 'proactive-monitor',
        metadata: {
          source: 'proactive-monitor',
          rule_id: rule.id,
          check_result: checkResult,
          auto_detected: true,
          detected_at: new Date().toISOString()
        }
      };

      const { data: bug, error } = await this.supabase
        .from('debug_bugs')
        .insert(bugData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`[PROACTIVE-MONITOR] Created bug for ${rule.id}: ${bug.id}`);

      // Send to Sentry if critical
      if (rule.severity === 'critical') {
        Sentry.captureMessage(`[Proactive Monitor] ${rule.name}`, {
          level: 'error',
          tags: {
            rule_id: rule.id,
            category: rule.category,
            bug_id: bug.id
          },
          extra: {
            rule: rule.name,
            description: rule.description,
            details: checkResult.details,
            count: checkResult.count
          }
        });
        console.log(`[PROACTIVE-MONITOR] Sent critical alert to Sentry for ${rule.id}`);
      }

      // Log the bug creation
      await this.supabase.from('debug_logs').insert({
        log_level: 'warn',
        message: `Proactive monitor created bug: ${rule.name}`,
        source: 'proactive-monitor',
        context: {
          bug_id: bug.id,
          rule_id: rule.id,
          severity: rule.severity,
          count: checkResult.count
        }
      });

    } catch (error: any) {
      console.error(`[PROACTIVE-MONITOR] Error creating bug for ${rule.id}:`, error);
      Sentry.captureException(error, {
        tags: {
          rule_id: rule.id,
          component: 'proactive-monitor'
        }
      });
    }
  }

  /**
   * Run all monitoring checks and return detailed results
   * Used by the API endpoint
   */
  public async runAllChecks(): Promise<Array<{
    ruleName: string;
    ruleId: string;
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    count?: number;
    details?: any;
  }>> {
    console.log('[PROACTIVE-MONITOR] Running all checks...');

    const results = await Promise.allSettled(
      this.rules.map(async (rule) => {
        try {
          const result = await rule.check(this.supabase);

          console.log(`[PROACTIVE-MONITOR] Rule ${rule.id}: ${result.passed ? 'PASSED' : 'FAILED'} (count: ${result.count || 0})`);

          // Create bug if check failed and configured to do so
          if (!result.passed && rule.createBugIfFailed) {
            await this.createBugForFailure(rule, result);
          }

          return {
            ruleName: rule.name,
            ruleId: rule.id,
            status: result.passed ? 'healthy' as const :
                   (rule.severity === 'critical' ? 'critical' as const : 'warning' as const),
            message: result.passed
              ? `Check passed (${result.count || 0} occurrences within threshold)`
              : `Check failed: ${result.count || 0} occurrences exceeded threshold of ${rule.threshold}`,
            count: result.count,
            details: result.details
          };
        } catch (error: any) {
          console.error(`[PROACTIVE-MONITOR] Error running rule ${rule.id}:`, error);
          Sentry.captureException(error, {
            tags: {
              rule_id: rule.id,
              component: 'proactive-monitor'
            }
          });
          return {
            ruleName: rule.name,
            ruleId: rule.id,
            status: 'warning' as const,
            message: `Error running check: ${error.message}`,
            details: { error: error.message }
          };
        }
      })
    );

    // Extract settled results
    const checkResults = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value);

    // Log summary
    const failedCount = checkResults.filter(r => r.status !== 'healthy').length;
    console.log(`[PROACTIVE-MONITOR] Checks complete: ${checkResults.length} rules, ${failedCount} issues found`);

    // Log the check run
    await this.supabase.from('debug_logs').insert({
      log_level: failedCount > 0 ? 'warn' : 'info',
      message: `Proactive monitor check complete: ${failedCount} issues found`,
      source: 'proactive-monitor',
      context: {
        total_rules: checkResults.length,
        issues_found: failedCount
      }
    });

    return checkResults;
  }

  /**
   * Run all monitoring checks once (legacy method for internal use)
   */
  public async runChecks(): Promise<void> {
    console.log('[PROACTIVE-MONITOR] Running checks...');

    const results = await Promise.allSettled(
      this.rules.map(async (rule) => {
        try {
          const result = await rule.check(this.supabase);

          console.log(`[PROACTIVE-MONITOR] Rule ${rule.id}: ${result.passed ? 'PASSED' : 'FAILED'} (count: ${result.count || 0})`);

          // Create bug if check failed and configured to do so
          if (!result.passed && rule.createBugIfFailed) {
            await this.createBugForFailure(rule, result);
          }

          return {
            rule_id: rule.id,
            passed: result.passed,
            count: result.count
          };
        } catch (error: any) {
          console.error(`[PROACTIVE-MONITOR] Error running rule ${rule.id}:`, error);
          Sentry.captureException(error, {
            tags: {
              rule_id: rule.id,
              component: 'proactive-monitor'
            }
          });
          return {
            rule_id: rule.id,
            error: error.message
          };
        }
      })
    );

    // Log summary
    const failedCount = results.filter(r => r.status === 'fulfilled' && !r.value.passed).length;
    const errorCount = results.filter(r => r.status === 'rejected').length;

    console.log(`[PROACTIVE-MONITOR] Check complete: ${results.length} rules, ${failedCount} failed, ${errorCount} errors`);

    // Log the check run
    await this.supabase.from('debug_logs').insert({
      log_level: failedCount > 0 ? 'warn' : 'info',
      message: `Proactive monitor check complete: ${failedCount} rules failed`,
      source: 'proactive-monitor',
      context: {
        total_rules: results.length,
        failed_count: failedCount,
        error_count: errorCount
      }
    });
  }

  /**
   * Start the monitoring system
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('[PROACTIVE-MONITOR] Already running');
      return;
    }

    console.log(`[PROACTIVE-MONITOR] Starting monitoring (interval: ${this.checkIntervalMs}ms)`);

    // Run checks immediately
    this.runChecks();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.runChecks();
    }, this.checkIntervalMs);

    this.isRunning = true;
  }

  /**
   * Stop the monitoring system
   */
  public stop(): void {
    if (!this.isRunning) {
      console.warn('[PROACTIVE-MONITOR] Not running');
      return;
    }

    console.log('[PROACTIVE-MONITOR] Stopping monitoring');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Get monitoring status
   */
  public getStatus(): {
    isRunning: boolean;
    checkIntervalMs: number;
    rulesCount: number;
    rules: Array<{ id: string; name: string; severity: string; category: string }>;
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      rulesCount: this.rules.length,
      rules: this.rules.map(r => ({
        id: r.id,
        name: r.name,
        severity: r.severity,
        category: r.category
      }))
    };
  }
}

// Singleton instance
let monitorInstance: ProactiveMonitor | null = null;

/**
 * Get or create the singleton monitor instance
 */
export function getMonitor(checkIntervalMs?: number): ProactiveMonitor {
  if (!monitorInstance) {
    monitorInstance = new ProactiveMonitor(checkIntervalMs);
  }
  return monitorInstance;
}

/**
 * Get the monitor instance (alias for API compatibility)
 */
export function getMonitorInstance(checkIntervalMs?: number): ProactiveMonitor {
  return getMonitor(checkIntervalMs);
}

/**
 * Initialize and start the proactive monitor
 * Call this from your application initialization (e.g., _app.tsx)
 */
export function initializeProactiveMonitoring(checkIntervalMs?: number): void {
  try {
    const monitor = getMonitor(checkIntervalMs);
    monitor.start();
    console.log('[PROACTIVE-MONITOR] Proactive monitoring initialized');
  } catch (error) {
    console.error('[PROACTIVE-MONITOR] Failed to initialize:', error);
    Sentry.captureException(error, {
      tags: {
        component: 'proactive-monitor-init'
      }
    });
  }
}
