# Enrollment Monitoring Setup Guide

**Created**: November 20, 2025
**Status**: Active
**Monitoring Type**: Daily Automated Cron Job

---

## Overview

Automated daily monitoring system to detect course enrollments with invalid `total_lessons` values (zero or NULL). This prevents regressions of the November 2025 data quality incident where 618 enrollments had `total_lessons = 0`.

---

## Architecture

### Components

1. **Cron Endpoint**: `/api/cron/monitor-enrollments`
   - Location: `pages/api/cron/monitor-enrollments.ts`
   - Schedule: Daily at midnight UTC
   - Duration: ~5-10 seconds
   - Timeout: 30 seconds max

2. **Vercel Cron Configuration**
   - File: `vercel.json`
   - Schedule: `"0 0 * * *"` (cron syntax)
   - Authorization: Bearer token via `CRON_SECRET` env var
   - **Note**: Vercel Hobby plan allows only 1 cron job (this endpoint is the only active cron)

3. **Notification System**
   - Service: `lib/notificationService.ts`
   - Recipients: All active admin users
   - Type: In-app notifications (high priority)
   - Metadata: Includes affected counts and timestamps

---

## Monitoring Queries

### Query 1: All-Time Check
```typescript
const { count: allTimeCount } = await supabase
  .from('course_enrollments')
  .select('*', { count: 'exact', head: true })
  .or('total_lessons.is.null,total_lessons.eq.0');
```

**Purpose**: Detect ANY enrollments with zero/null `total_lessons`
**Expected Result**: `0`
**Alert Threshold**: `> 0`

### Query 2: Last 24 Hours Check
```typescript
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const { count: last24hCount } = await supabase
  .from('course_enrollments')
  .select('*', { count: 'exact', head: true })
  .or('total_lessons.is.null,total_lessons.eq.0')
  .gte('created_at', yesterday);
```

**Purpose**: Detect NEW enrollments created in last 24h with invalid data
**Expected Result**: `0`
**Alert Threshold**: `> 0`

---

## Alert Behavior

### When Alerts Fire

**Condition**: `allTimeCount > 0` OR `last24hCount > 0`

**Actions**:
1. Log error to console with full details
2. Create in-app notification for all admin users
3. Return HTTP 200 with `status: "ALERT"`
4. Include metadata:
   - `zero_total_all_time`: Total count
   - `zero_total_last_24h`: Recent count
   - `timestamp`: When check ran

### Alert Message Format
```
⚠️ ENROLLMENT DATA QUALITY ALERT

Total enrollments with zero total_lessons: X
New enrollments (last 24h): Y

This indicates the auto-fill trigger may have failed or been bypassed.
Action required: Investigate course_enrollments table immediately.
```

---

## Environment Variables

### Required Variables

| Variable | Description | Location |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Vercel env vars |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin access | Vercel env vars (secret) |
| `CRON_SECRET` | Authorization token for cron jobs | Vercel env vars (secret) |

### Setting Up CRON_SECRET

```bash
# Generate a secure random secret
openssl rand -base64 32

# Add to Vercel environment variables:
# Dashboard → Project → Settings → Environment Variables
# Name: CRON_SECRET
# Value: <generated secret>
# Scope: Production, Preview, Development
```

---

## Deployment

### Initial Deployment

1. **Files Created**:
   - ✅ `pages/api/cron/monitor-enrollments.ts` - Endpoint implementation
   - ✅ `vercel.json` - Cron schedule configuration
   - ✅ `docs/ENROLLMENT_MONITORING_SETUP.md` - This documentation

2. **Environment Variables**:
   ```bash
   # In Vercel dashboard, ensure these are set:
   NEXT_PUBLIC_SUPABASE_URL=https://sxlogxqzmarhqsblxmtj.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   CRON_SECRET=<generate-new-secret>
   ```

3. **Deploy to Vercel**:
   ```bash
   git add pages/api/cron/monitor-enrollments.ts vercel.json docs/
   git commit -m "feat: add daily enrollment monitoring cron job"
   git push origin main
   ```

4. **Verify Deployment**:
   - Check Vercel dashboard → Crons tab
   - Should show `/api/cron/monitor-enrollments` scheduled daily

---

## Testing

### Manual Test (Local)

```bash
# Start dev server
npm run dev

# In another terminal, test the endpoint
curl -X POST http://localhost:3000/api/cron/monitor-enrollments \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"

# Expected response:
{
  "status": "ok",
  "zero_total_all_time": 0,
  "zero_total_last_24h": 0,
  "timestamp": "2025-11-20T16:00:00.000Z",
  "alert_sent": false
}
```

### Manual Test (Production)

```bash
# Test production endpoint
curl -X POST https://fne-lms.vercel.app/api/cron/monitor-enrollments \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Simulate Alert (Test Notification)

```sql
-- Temporarily create test enrollment with zero total_lessons
INSERT INTO course_enrollments (user_id, course_id, total_lessons, enrollment_type)
VALUES (
  (SELECT id FROM profiles LIMIT 1),
  (SELECT id FROM courses LIMIT 1),
  0,  -- This will trigger alert
  'assigned'
);

-- Run cron endpoint (should send alert)
-- Then clean up:
DELETE FROM course_enrollments WHERE total_lessons = 0 AND created_at > NOW() - INTERVAL '1 hour';
```

---

## Monitoring the Monitor

### Vercel Cron Logs

1. Go to Vercel Dashboard
2. Select project → Deployments → Functions
3. Find `/api/cron/monitor-enrollments`
4. View execution logs

### Expected Log Output (Success)

```
[CRON] Starting enrollment monitoring check...
[CRON] Enrollment monitoring results: {
  zero_total_all_time: 0,
  zero_total_last_24h: 0,
  status: 'ok',
  timestamp: '2025-11-20T00:00:00.000Z'
}
[CRON] No issues detected - all enrollments have valid total_lessons
```

### Expected Log Output (Alert)

```
[CRON] Starting enrollment monitoring check...
[CRON] Enrollment monitoring results: {
  zero_total_all_time: 5,
  zero_total_last_24h: 2,
  status: 'ALERT',
  timestamp: '2025-11-20T00:00:00.000Z'
}
[CRON] ALERT: ⚠️ ENROLLMENT DATA QUALITY ALERT...
[CRON] Alert notifications sent to 3 admins
```

---

## Troubleshooting

### Cron Not Running

**Symptom**: No logs in Vercel dashboard

**Checks**:
1. Verify `vercel.json` has correct cron configuration
2. Check Vercel dashboard → Crons tab shows the schedule
3. Ensure cron schedule syntax is valid: `"0 0 * * *"`
4. Check Vercel plan supports cron jobs (Hobby plan = 1 cron)

**Solution**: Redeploy or update cron schedule in `vercel.json`

### 401 Unauthorized Error

**Symptom**: Cron returns 401 status

**Checks**:
1. Verify `CRON_SECRET` is set in Vercel env vars
2. Check authorization header matches: `Bearer <secret>`
3. Ensure env var is available in Production scope

**Solution**: Update `CRON_SECRET` in Vercel dashboard

### Query Errors

**Symptom**: 500 Internal Server Error

**Checks**:
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
2. Check Supabase connection from Vercel logs
3. Verify `course_enrollments` table exists and has `total_lessons` column
4. Check RLS policies allow service role access

**Solution**: Test Supabase connection manually, verify credentials

### Notifications Not Sent

**Symptom**: Alert triggers but no notifications received

**Checks**:
1. Verify `NotificationService.create()` works
2. Check if admin users exist in `user_roles` table
3. Verify notification settings in user profiles
4. Check Supabase `notifications` table for entries

**Solution**: Test `NotificationService` separately, verify admin users

---

## Maintenance

### Monthly Review

- [ ] Check Vercel cron execution logs for failures
- [ ] Verify alert threshold is still appropriate
- [ ] Review notification delivery success rate
- [ ] Update documentation if behavior changes

### Updating Alert Logic

To modify what triggers an alert, edit `/pages/api/cron/monitor-enrollments.ts`:

```typescript
// Example: Add threshold tolerance
const hasIssue = (allTimeCount || 0) > 5 || (last24hCount || 0) > 2;
```

### Changing Schedule

Update `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/monitor-enrollments",
      "schedule": "0 */6 * * *"  // Every 6 hours
    }
  ]
}
```

**Common Cron Schedules**:
- `"0 0 * * *"` - Daily at midnight UTC
- `"0 */6 * * *"` - Every 6 hours
- `"0 0 * * 0"` - Weekly on Sunday
- `"0 0 1 * *"` - Monthly on 1st

---

## Related Documentation

- **Zero-Lesson Policy**: `docs/ZERO_LESSON_POLICY.md`
- **Migration Post-Mortem**: `docs/MIGRATION_018_POSTMORTEM.md`
- **Migration Template**: `docs/MIGRATION_TEMPLATE.md`
- **Notification Service**: `lib/notificationService.ts`

---

## Support

**Questions or Issues?**
- Contact: Technical Lead (bcurtis@nuevaeducacion.org)
- Check: Vercel dashboard → Functions → Logs
- Review: `docs/MIGRATION_018_POSTMORTEM.md` for context

---

**Last Updated**: November 20, 2025
**Next Review**: March 2026
