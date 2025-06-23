# Admin Password Reset Feature

## Overview
Administrators can now reset any user's password to a temporary password. When the user logs in with the temporary password, they will be forced to change it immediately.

## Features

### 1. Password Reset UI
- Added password reset button (key icon) in the user management table
- Only visible for approved users
- Opens a modal with password reset options

### 2. Password Reset Modal
- Shows user information (name and email)
- Allows admin to enter a temporary password
- Includes password confirmation field
- Option to generate random secure password
- Clear warning that user must change password on next login

### 3. Security Features
- Only admins can reset passwords
- All password resets are logged in audit_logs table
- Temporary passwords must meet minimum requirements (6+ characters)
- Users are forced to change password on next login
- Password change page enforces strong password requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

### 4. User Experience
- When logging in with a reset password, users see a clear message
- Different message shown for admin-reset vs. first-time login
- After changing password, users are redirected based on profile completion

## Implementation Details

### Database Changes
```sql
-- Added to profiles table
password_change_required BOOLEAN DEFAULT FALSE

-- New audit_logs table for tracking admin actions
CREATE TABLE audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### API Endpoint
- `/api/admin/reset-password` - Admin-only endpoint
- Uses Supabase service role for password updates
- Updates both auth.users and profiles tables
- Logs action in audit_logs

### Updated Components
1. **User Management Page** (`/pages/admin/user-management.tsx`)
   - Added password reset button
   - Integrated PasswordResetModal

2. **Password Reset Modal** (`/components/PasswordResetModal.tsx`)
   - Clean UI with security warnings
   - Password generation feature
   - Form validation

3. **Login Page** (`/pages/login.tsx`)
   - Checks for password_change_required flag
   - Redirects to change-password page when needed

4. **Change Password Page** (`/pages/change-password.tsx`)
   - Handles both first-time and admin-reset scenarios
   - Shows appropriate messaging
   - Enforces strong password requirements

## Usage Instructions

### For Administrators
1. Go to User Management page
2. Find the user whose password needs to be reset
3. Click the key icon in the Actions column
4. Enter a temporary password (or generate one)
5. Click "Restablecer Contraseña"
6. Share the temporary password with the user securely

### For Users
1. Log in with the temporary password provided by admin
2. You'll be automatically redirected to change password page
3. Enter a new password that meets all requirements
4. Complete the password change
5. Continue to dashboard or profile completion

## Security Considerations
- Temporary passwords should be shared securely (not via email)
- Admins should encourage users to change passwords immediately
- All password resets are logged for audit purposes
- Consider implementing password expiration for temporary passwords (future enhancement)

## Future Enhancements
- Email notification to user when password is reset
- Temporary password expiration (e.g., valid for 24 hours)
- Password history to prevent reuse
- Two-factor authentication requirement after password reset