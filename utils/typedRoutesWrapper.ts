/**
 * Typed Routes Feature Flag Wrapper
 * Allows gradual rollout of typed route handlers
 * 
 * Usage:
 *   import { wrapTypedRoute } from '@/utils/typedRoutesWrapper';
 *   export default wrapTypedRoute(legacyHandler, typedHandler);
 */

import { NextApiHandler } from 'next';

/**
 * Environment variable to enable typed routes
 * Set ENABLE_TYPED_ROUTES=true to use typed handlers
 */
const TYPED_ROUTES_ENABLED = process.env.ENABLE_TYPED_ROUTES === 'true';

/**
 * Wraps legacy and typed route handlers with feature flag
 * @param legacyHandler - The existing handler
 * @param typedHandler - The new typed handler using database.generated.ts
 * @returns The appropriate handler based on feature flag
 */
export function wrapTypedRoute(
  legacyHandler: NextApiHandler,
  typedHandler: NextApiHandler
): NextApiHandler {
  if (TYPED_ROUTES_ENABLED) {
    console.log(`[TypedRoutes] Using typed handler for ${typedHandler.name || 'route'}`);
    return typedHandler;
  }
  return legacyHandler;
}

/**
 * Check if typed routes are enabled
 */
export function isTypedRoutesEnabled(): boolean {
  return TYPED_ROUTES_ENABLED;
}

/**
 * Log which mode is active (for debugging)
 */
export function logTypedRoutesMode(): void {
  console.log(`[TypedRoutes] Mode: ${TYPED_ROUTES_ENABLED ? 'TYPED' : 'LEGACY'}`);
}