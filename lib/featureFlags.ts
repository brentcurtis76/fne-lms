// Feature flag management system
// All flags default to false for production safety

export function isFeatureEnabled(flag: string): boolean {
  // Server-side check
  if (typeof window === 'undefined') {
    return process.env[flag] === 'true';
  }
  
  // Client-side check - Next.js requires direct property access
  // Cannot use dynamic keys with process.env in browser
  switch (flag) {
    case 'FEATURE_SUPERADMIN_RBAC':
      return process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC === 'true';
    case 'RBAC_DEV_MOCK':
      return process.env.NEXT_PUBLIC_RBAC_DEV_MOCK === 'true';
    case 'FEATURE_ZOOM_MEETINGS':
      return process.env.NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS === 'true';
    case 'FEATURE_ZOOM_EMBED':
      return process.env.NEXT_PUBLIC_FEATURE_ZOOM_EMBED === 'true';
    default:
      return false;
  }
}

// Type-safe feature flags
export const FeatureFlags = {
  SUPERADMIN_RBAC: 'FEATURE_SUPERADMIN_RBAC',
  RBAC_DEV_MOCK: 'RBAC_DEV_MOCK',
  // Zoom plan §14 master kill switch. Off ⇒ no NEW meeting provisioning; cleanup and
  // reconciliation jobs deliberately keep running.
  ZOOM_MEETINGS: 'FEATURE_ZOOM_MEETINGS',
  // Zoom plan §14. NOT a second kill switch: the embed is an upgrade WITHIN link
  // mode, so `FEATURE_ZOOM_MEETINGS` off still answers 503 on the join route no
  // matter what this one says. On, it widens the join route's success outcome from
  // a link to an SDK payload; off, every outcome is exactly what Z2 shipped.
  ZOOM_EMBED: 'FEATURE_ZOOM_EMBED'
} as const;

export type FeatureFlagKey = typeof FeatureFlags[keyof typeof FeatureFlags];