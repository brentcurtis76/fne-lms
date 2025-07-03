import { supabase } from '../lib/supabase';

/**
 * Check if a URL requires admin access
 */
export const isAdminOnlyRoute = (url: string): boolean => {
  if (!url) return false;
  
  // List of admin-only route patterns
  const adminRoutes = [
    '/admin/',
    '/configuracion',
    '/usuarios',
    '/gestion'
  ];
  
  return adminRoutes.some(route => url.toLowerCase().startsWith(route));
};

/**
 * Check if a URL requires specific role access
 */
export const getRequiredRole = (url: string): string | null => {
  if (!url) return null;
  
  // Map URLs to required roles
  const roleRoutes: Record<string, string[]> = {
    '/admin/': ['admin'],
    '/configuracion': ['admin'],
    '/usuarios': ['admin'],
    '/consultorias': ['admin', 'consultor'],
    '/gestion': ['admin'],
    '/reportes': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'],
    '/cursos/': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'],
    '/tareas': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'],
    '/espacio-colaborativo': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente']
  };
  
  // Find the first matching route
  for (const [route, roles] of Object.entries(roleRoutes)) {
    if (url.toLowerCase().startsWith(route)) {
      return roles[0]; // Return the minimum required role
    }
  }
  
  return null; // No specific role required
};

/**
 * Check if user has access to a specific URL
 */
export const checkUserAccess = async (url: string, userId: string): Promise<boolean> => {
  try {
    if (!url || !userId) return false;
    
    // Get user's role
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    
    if (error || !profile) {
      console.error('Error fetching user profile:', error);
      return false;
    }
    
    const userRole = profile.role;
    
    // Admin has access to everything
    if (userRole === 'admin') return true;
    
    // Check if URL requires admin access
    if (isAdminOnlyRoute(url)) return false;
    
    // Check specific role requirements
    const roleRoutes: Record<string, string[]> = {
      '/reportes': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'],
      '/cursos/': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'],
      '/tareas': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'],
      '/espacio-colaborativo': ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'],
      '/consultorias': ['admin', 'consultor']
    };
    
    // Check if user's role is allowed for this route
    for (const [route, allowedRoles] of Object.entries(roleRoutes)) {
      if (url.toLowerCase().startsWith(route)) {
        return allowedRoles.includes(userRole);
      }
    }
    
    // Default: allow access to non-restricted routes
    return true;
    
  } catch (error) {
    console.error('Error checking user access:', error);
    return false;
  }
};

/**
 * Get an accessible URL for a user based on their role
 * Returns null if user shouldn't access the resource
 */
export const getAccessibleUrl = (
  urlTemplate: string, 
  userRole: string, 
  eventData?: Record<string, any>
): string | null => {
  if (!urlTemplate) return null;
  
  // Substitute template variables
  let url = urlTemplate;
  if (eventData) {
    Object.entries(eventData).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, value?.toString() || '');
    });
  }
  
  // Special handling for feedback URLs
  if (url.startsWith('/admin/feedback')) {
    if (userRole !== 'admin') {
      // For non-admin users, return a read-only view URL or null
      const feedbackId = eventData?.feedback_id || url.split('id=')[1];
      if (feedbackId) {
        // TODO: Once we create the read-only feedback page, return that URL
        // return `/feedback/view/${feedbackId}`;
        return null; // For now, non-admins can't access feedback
      }
      return null;
    }
  }
  
  // Check if user has access to the URL
  if (isAdminOnlyRoute(url) && userRole !== 'admin') {
    return null;
  }
  
  // Check specific role restrictions
  const roleRestrictions: Record<string, string[]> = {
    '/reportes': ['docente'], // Docentes can't access reports
    '/consultorias': ['equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente']
  };
  
  for (const [route, restrictedRoles] of Object.entries(roleRestrictions)) {
    if (url.startsWith(route) && restrictedRoles.includes(userRole)) {
      return null;
    }
  }
  
  return url;
};

/**
 * Get alternative URL for restricted resources
 */
export const getAlternativeUrl = (
  originalUrl: string,
  userRole: string,
  eventType?: string
): string | null => {
  // Map restricted URLs to alternatives based on event type and role
  const alternatives: Record<string, Record<string, string>> = {
    '/admin/feedback': {
      'default': '/dashboard', // Redirect to dashboard by default
      'feedback_submitter': '/mis-reportes' // Future: user's own feedback page
    },
    '/admin/': {
      'default': '/dashboard'
    },
    '/reportes': {
      'docente': '/dashboard'
    }
  };
  
  // Find matching alternative
  for (const [route, roleAlternatives] of Object.entries(alternatives)) {
    if (originalUrl.startsWith(route)) {
      return roleAlternatives[userRole] || roleAlternatives['default'] || null;
    }
  }
  
  return null;
};