/**
 * User Onboarding State API
 *
 * Manages tour completion state for the onboarding system.
 * Uses consistent API authentication pattern from @/lib/api-auth.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import {
  getApiUser,
  createServiceRoleClient,
  sendAuthError,
  handleMethodNotAllowed,
  logApiRequest
} from '@/lib/api-auth';
import { HttpStatus, ErrorMessages } from '@/lib/types/api-auth.types';
import { rateLimit, RATE_LIMITS } from '@/lib/rateLimit';

// Valid tour IDs for type safety
const VALID_TOUR_IDS = [
  'qa-dashboard',
  'qa-coverage',
  'qa-load-tests',
  'qa-lighthouse',
  'qa-feature-checklist'
] as const;

type ValidTourId = typeof VALID_TOUR_IDS[number];

// Tour ID validation pattern
const TOUR_ID_PATTERN = /^[a-zA-Z0-9-_]+$/;
const MAX_TOUR_ID_LENGTH = 100;

export interface OnboardingState {
  tours_completed: Record<string, string>; // tourId -> ISO timestamp
  tours_skipped: Record<string, string>;   // tourId -> ISO timestamp
}

interface ApiErrorResponse {
  error: string;
  details?: string;
}

interface ApiSuccessResponse extends OnboardingState {
  success?: boolean;
}

// Validate tourId format
function isValidTourId(tourId: unknown): tourId is string {
  if (typeof tourId !== 'string') return false;
  if (tourId.length === 0 || tourId.length > MAX_TOUR_ID_LENGTH) return false;
  return TOUR_ID_PATTERN.test(tourId);
}

// Type guard for known tour IDs
function isKnownTourId(tourId: string): tourId is ValidTourId {
  return (VALID_TOUR_IDS as readonly string[]).includes(tourId);
}

// Create rate limiter for this endpoint
const rateLimitCheck = rateLimit(RATE_LIMITS.api, 'onboarding-state');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiSuccessResponse | ApiErrorResponse>
) {
  logApiRequest(req, 'onboarding-state');

  // Apply rate limiting
  const allowed = await rateLimitCheck(req, res);
  if (!allowed) return;

  // Validate HTTP method
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return handleMethodNotAllowed(res, ['GET', 'PUT']);
  }

  // Authenticate user using consistent pattern
  const { user, error: authError } = await getApiUser(req, res);

  if (authError || !user) {
    return sendAuthError(
      res,
      ErrorMessages.UNAUTHORIZED,
      HttpStatus.UNAUTHORIZED,
      authError?.message
    );
  }

  const userId = user.id;

  // Create service role client for database operations
  const supabaseAdmin = createServiceRoleClient();

  if (req.method === 'GET') {
    try {
      // Fetch user's onboarding state
      const { data: state, error: stateError } = await supabaseAdmin
        .from('user_onboarding_state')
        .select('tours_completed, tours_skipped')
        .eq('user_id', userId)
        .single();

      if (stateError && stateError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('[Onboarding API] Error fetching state:', stateError);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Error al obtener el estado de onboarding'
        });
      }

      // Return default state without persisting (GET should be idempotent)
      if (!state) {
        return res.status(HttpStatus.OK).json({
          tours_completed: {},
          tours_skipped: {}
        });
      }

      // Return existing state
      return res.status(HttpStatus.OK).json({
        tours_completed: state.tours_completed || {},
        tours_skipped: state.tours_skipped || {}
      });

    } catch (error) {
      console.error('[Onboarding API] GET error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Error interno del servidor'
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { action, tourId } = req.body;

      // Validate tourId
      if (!isValidTourId(tourId)) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'tourId inválido. Debe ser una cadena de 1-100 caracteres alfanuméricos, guiones o guiones bajos.'
        });
      }

      // Warn if not a known tour ID (but still allow it for extensibility)
      if (!isKnownTourId(tourId)) {
        console.warn(`[Onboarding API] Unknown tour ID: ${tourId}`);
      }

      // Validate action
      if (!['complete', 'skip', 'reset'].includes(action)) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Acción inválida. Debe ser: complete, skip, o reset'
        });
      }

      // Get current state
      const { data: currentState, error: fetchError } = await supabaseAdmin
        .from('user_onboarding_state')
        .select('tours_completed, tours_skipped')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('[Onboarding API] Error fetching current state:', fetchError);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Error al obtener el estado actual'
        });
      }

      // Prepare update data
      const toursCompleted = { ...(currentState?.tours_completed || {}) };
      const toursSkipped = { ...(currentState?.tours_skipped || {}) };
      const now = new Date().toISOString();

      if (action === 'complete') {
        toursCompleted[tourId] = now;
        // Remove from skipped if it was skipped before
        delete toursSkipped[tourId];
      } else if (action === 'skip') {
        toursSkipped[tourId] = now;
      } else if (action === 'reset') {
        delete toursCompleted[tourId];
        delete toursSkipped[tourId];
      }

      // Upsert the state
      const { data: updatedState, error: updateError } = await supabaseAdmin
        .from('user_onboarding_state')
        .upsert({
          user_id: userId,
          tours_completed: toursCompleted,
          tours_skipped: toursSkipped,
          updated_at: now
        }, {
          onConflict: 'user_id'
        })
        .select('tours_completed, tours_skipped')
        .single();

      if (updateError) {
        console.error('[Onboarding API] Error updating state:', updateError);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          error: 'Error al actualizar el estado de onboarding'
        });
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        tours_completed: updatedState.tours_completed || {},
        tours_skipped: updatedState.tours_skipped || {}
      });

    } catch (error) {
      console.error('[Onboarding API] PUT error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Error interno del servidor'
      });
    }
  }
}
