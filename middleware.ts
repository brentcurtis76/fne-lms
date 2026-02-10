import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  // No session → login
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const pathname = req.nextUrl.pathname;

  // --- ADMIN ROUTES ---
  if (pathname.startsWith('/admin')) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type, community_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const roles = userRoles?.map(r => r.role_type) || [];

    // Admin gets full access
    if (roles.includes('admin')) {
      return res;
    }

    // Community Manager: only news and events
    const cmRoutes = ['/admin/news', '/admin/events'];
    if (roles.includes('community_manager') && cmRoutes.some(r => pathname.startsWith(r))) {
      return res;
    }

    // Consultor: assessment builder, assignments, overview
    const consultorRoutes = ['/admin/assessment-builder', '/admin/consultant-assignments', '/admin/assignment-overview'];
    if (roles.includes('consultor') && consultorRoutes.some(r => pathname.startsWith(r))) {
      return res;
    }

    // Everyone else → redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // --- COMMUNITY WORKSPACE ROUTES ---
  if (pathname.startsWith('/community/workspace')) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type, community_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const roles = userRoles?.map(r => r.role_type) || [];
    const hasCommunity = userRoles?.some(r => r.community_id != null) || false;

    // Admin always has access
    if (roles.includes('admin')) {
      return res;
    }

    // Everyone else needs a community_id
    if (!hasCommunity) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // --- SCHOOL-SCOPED ROUTES ---
  // For /school/transversal-context with a school_id query param,
  // verify equipo_directivo can only access their own school
  if (pathname.startsWith('/school/transversal-context')) {
    const requestedSchoolId = req.nextUrl.searchParams.get('school_id');

    if (requestedSchoolId) {
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const roles = userRoles?.map(r => r.role_type) || [];

      // Admin and consultor can access any school
      if (roles.includes('admin') || roles.includes('consultor')) {
        return res;
      }

      // equipo_directivo: only their own school
      const userSchoolIds = userRoles
        ?.filter(r => r.school_id != null)
        .map(r => String(r.school_id)) || [];

      if (!userSchoolIds.includes(requestedSchoolId)) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/admin/:path*', '/community/workspace/:path*', '/school/:path*']
};
