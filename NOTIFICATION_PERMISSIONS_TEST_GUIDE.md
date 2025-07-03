# Notification Permissions Testing Guide

## Overview
This guide helps verify that the notification system properly handles permissions and prevents users from being redirected to pages they cannot access.

## What Was Fixed

### 1. **NotificationDropdown Permission Checks**
- Before clicking a notification URL, the system now checks if the user has permission to access it
- If no permission, shows an error toast instead of redirecting
- Attempts to find alternative URLs when possible

### 2. **Role-Based URL Generation**
- When creating notifications, the system now checks recipient roles
- Admin-only URLs (like `/admin/feedback`) are set to `null` for non-admin users
- Prevents creating notifications with inaccessible URLs

### 3. **Permission Utilities**
- Created `/utils/notificationPermissions.ts` with comprehensive permission checking
- Handles role-based access control for all platform routes
- Provides alternative URL suggestions

## Test Scenarios

### Scenario 1: Non-Admin User Submits Feedback
1. **Login as**: Any non-admin user (docente, consultor, etc.)
2. **Action**: Submit feedback through the feedback button
3. **Expected Result**:
   - User receives notification about feedback submission
   - Notification has NO clickable URL (since `/admin/feedback` is admin-only)
   - User stays on current page when clicking notification

### Scenario 2: Admin User Receives Feedback Notification
1. **Login as**: Admin user
2. **Action**: Have someone submit feedback
3. **Expected Result**:
   - Admin receives notification with clickable URL
   - Clicking takes admin to `/admin/feedback?id=XXX`
   - No permission errors

### Scenario 3: Docente Tries to Access Report Notification
1. **Login as**: Docente (teacher role)
2. **Action**: Click a notification that links to `/reportes`
3. **Expected Result**:
   - Error toast: "No tienes permisos para acceder a esta página"
   - User stays on current page
   - No redirect to login or dashboard

### Scenario 4: Consultant Assignment Notification
1. **Login as**: Consultor
2. **Action**: Click notification for `/consultorias`
3. **Expected Result**:
   - Successfully navigates to consultancy page
   - No permission errors

### Scenario 5: Invalid/Deleted Content
1. **Login as**: Any user
2. **Action**: Click notification for deleted content
3. **Expected Result**:
   - Graceful error handling
   - No app crashes

## Test Users by Role

- **Admin**: Full access to all URLs
- **Consultor**: Access to courses, assignments, consultancies, reports
- **Equipo Directivo**: Access to courses, assignments, reports, collaborative space
- **Líder Generación**: Access to courses, assignments, reports, collaborative space
- **Líder Comunidad**: Access to courses, assignments, reports, collaborative space
- **Docente**: Access to courses, assignments, collaborative space (NO reports)

## How to Test

1. **Check Existing Notifications**:
   ```bash
   # Run this to see notification URLs in database
   node scripts/check-notification-urls.js
   ```

2. **Create Test Notifications**:
   - Submit feedback as different user roles
   - Create assignments
   - Send messages with @mentions

3. **Verify Behavior**:
   - Click each notification
   - Confirm appropriate access or error message
   - Check browser console for permission check logs

## Verification Checklist

- [ ] Non-admin users cannot access `/admin/*` URLs
- [ ] Docentes cannot access `/reportes`
- [ ] All users can access `/dashboard`
- [ ] Consultors can access `/consultorias`
- [ ] Error toasts appear instead of redirects
- [ ] No infinite redirect loops
- [ ] "Ver todas las notificaciones" works for all users

## Future Enhancements

1. **Read-Only Feedback View**: Create `/feedback/view/[id]` for users to see their submitted feedback
2. **Full Notifications Page**: Replace placeholder with functional notification management
3. **Role-Based Templates**: Different notification content based on recipient role
4. **Notification Preferences**: Let users control which notifications they receive

## Troubleshooting

If users still experience redirect issues:

1. Check browser console for permission errors
2. Verify user role in database
3. Check notification `related_url` field
4. Run `fix-notification-urls.js` script again
5. Clear browser cache and try again