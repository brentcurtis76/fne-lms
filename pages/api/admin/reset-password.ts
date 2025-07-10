import { NextApiRequest, NextApiResponse } from 'next';
import { 
  checkIsAdmin, 
  createServiceRoleClient, 
  sendAuthError, 
  sendApiResponse,
  validateRequestBody,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<ApiSuccess<any> | ApiError>
) {
  // Log the request
  logApiRequest(req, 'reset-password');

  if (req.method !== 'POST') {
    return sendAuthError(res, 'Method not allowed', 405);
  }

  try {
    // Verify admin access using the centralized auth utility
    const { isAdmin, user, error } = await checkIsAdmin(req, res);
    
    console.log('[Reset Password API] Auth check result:', {
      isAdmin,
      userId: user?.id,
      error: error?.message
    });
    
    if (error || !user) {
      console.error('[Reset Password API] Authentication failed:', error);
      return sendAuthError(res, 'Authentication required', 401);
    }
    
    if (!isAdmin) {
      console.error('[Reset Password API] User is not admin:', user.id);
      return sendAuthError(res, 'Only admins can reset passwords', 403);
    }

    // Create service role client for admin operations
    const supabaseAdmin = createServiceRoleClient();

    const { userId, temporaryPassword } = req.body;

    // Validate required fields
    const validation = validateRequestBody<{ userId: string; temporaryPassword: string }>(
      req.body,
      ['userId', 'temporaryPassword']
    );

    if (!validation.valid) {
      return sendAuthError(
        res, 
        `Missing required fields: ${validation.missing.join(', ')}`,
        400
      );
    }

    // Log the userId we're trying to update
    console.log('[Reset Password API] Attempting to reset password for userId:', userId);
    
    // Update the user's password
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { 
        password: temporaryPassword,
        user_metadata: { 
          password_change_required: true,
          password_reset_by_admin: true,
          password_reset_at: new Date().toISOString()
        }
      }
    );

    if (updateError) {
      console.error('Error updating password:', updateError);
      return sendAuthError(res, 'Failed to reset password', 500, updateError.message);
    }

    // Update the profile to indicate password change is required
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        password_change_required: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (profileUpdateError) {
      console.error('Error updating profile:', profileUpdateError);
      // Continue anyway as the password was already reset
    }

    // Log the password reset action
    const { error: logError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: user.id,  // Use the authenticated user from checkIsAdmin
        action: 'password_reset',
        details: {
          target_user_id: userId,
          reset_by: 'admin',
          timestamp: new Date().toISOString()
        }
      });

    if (logError) {
      console.error('Error logging password reset:', logError);
      // Continue anyway as this is not critical
    }

    // Return success response using standardized format
    return sendApiResponse(res, {
      success: true,
      message: 'Password reset successfully',
      user: updateData.user
    });

  } catch (error: any) {
    console.error('[Reset Password API] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error
    });
    return sendAuthError(
      res, 
      'Internal server error', 
      500, 
      error.message || 'An unexpected error occurred'
    );
  }
}