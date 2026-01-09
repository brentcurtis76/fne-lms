import { NextApiRequest, NextApiResponse } from 'next';
import { getMonitorInstance } from '@/lib/monitoring/proactive-monitor';
import * as Sentry from '@sentry/nextjs';

interface MonitoringResponse {
  success: boolean;
  message: string;
  results?: Array<{
    ruleName: string;
    status: string;
    message: string;
  }>;
  summary?: {
    healthy: number;
    warning: number;
    critical: number;
    duration: number;
  };
  error?: string;
}

/**
 * API endpoint for running proactive monitoring checks
 * Called by Vercel Cron every 5 minutes
 *
 * Security: Validates Vercel Cron secret to prevent unauthorized access
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MonitoringResponse>
) {
  const startTime = Date.now();

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    // Verify the request is from Vercel Cron
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    // In production, require the cron secret
    if (process.env.NODE_ENV === 'production') {
      if (!cronSecret) {
        console.error('[MONITORING-API] CRON_SECRET not configured');
        return res.status(500).json({
          success: false,
          message: 'Server configuration error'
        });
      }

      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        console.warn('[MONITORING-API] Unauthorized cron attempt');
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }
    }

    console.log('[MONITORING-API] Starting proactive monitoring checks...');

    // Get monitor instance and run checks
    const monitor = getMonitorInstance();
    const results = await monitor.runAllChecks();

    // Calculate summary
    const summary = {
      healthy: results.filter(r => r.status === 'healthy').length,
      warning: results.filter(r => r.status === 'warning').length,
      critical: results.filter(r => r.status === 'critical').length,
      duration: Date.now() - startTime
    };

    console.log('[MONITORING-API] Checks completed:', summary);

    // Log to Sentry if there are critical issues
    if (summary.critical > 0) {
      Sentry.captureMessage(
        `Proactive monitoring found ${summary.critical} critical issue(s)`,
        {
          level: 'warning',
          tags: { component: 'monitoring-api' },
          extra: { summary, results }
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: `Monitoring completed: ${summary.healthy} healthy, ${summary.warning} warnings, ${summary.critical} critical`,
      results: results.map(r => ({
        ruleName: r.ruleName,
        status: r.status,
        message: r.message
      })),
      summary
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[MONITORING-API] Error running monitoring checks:', error);

    Sentry.captureException(error, {
      tags: { component: 'monitoring-api' },
      level: 'error'
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to run monitoring checks',
      error: error instanceof Error ? error.message : 'Unknown error',
      summary: {
        healthy: 0,
        warning: 0,
        critical: 0,
        duration
      }
    });
  }
}
