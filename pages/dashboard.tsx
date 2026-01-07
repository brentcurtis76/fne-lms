import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import MainLayout from '../components/layout/MainLayout';
import { toastSuccess } from '../utils/toastUtils';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import Avatar from '../components/common/Avatar';
import { getUserRoles, getCommunityMembers, getEffectiveRoleAndStatus, metadataHasRole } from '../utils/roleUtils';
import { UserRole, UserProfile } from '../types/roles';
import { updateAvatarCache } from '../hooks/useAvatar';
import {
  Settings, Users, ChevronDown, ChevronUp, Newspaper, Play,
  BookOpen, TrendingUp, ArrowRight, Clock,
  GraduationCap, ExternalLink, MapPin
} from 'lucide-react';
import { LearningPathCard } from '../components/learning-paths';
import { NetflixCourseRow } from '../components/courses';
import WorkspaceSettingsModal from '../components/community/WorkspaceSettingsModal';
import { getOrCreateWorkspace } from '../utils/workspaceUtils';
import { CourseWithEnrollment } from '../types/courses';

// Types
interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  content_html: string;
  featured_image?: string;
  display_date?: string;
  created_at: string;
}

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
}

interface DashboardStats {
  totalUsers: number;
  mostCompletedCourse: {
    id: string;
    title: string;
    completionCount: number;
    thumbnail_url?: string;
    instructor_name?: string;
    description?: string;
  } | null;
  topLearner: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    completedCourses: number;
    school_name?: string;
    role?: string;
  } | null;
}

// Helper functions
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const getExcerpt = (html: string, length = 100) => {
  let text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text.length > length ? text.substring(0, length) + '...' : text;
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
  return formatDate(dateString);
};

export default function Dashboard() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const session = useSession();

  // Core state
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profileName, setProfileName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  // Course state
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [learningPaths, setLearningPaths] = useState<any[]>([]);

  // Community state
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [communityMembers, setCommunityMembers] = useState<Record<string, UserProfile[]>>({});
  const [communityWorkspaces, setCommunityWorkspaces] = useState<Record<string, any>>({});
  const [communityExpanded, setCommunityExpanded] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);

  // New dashboard sections state
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loadingNews, setLoadingNews] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');

  // Transform courses to Netflix format
  const transformToNetflixFormat = (courses: any[]): CourseWithEnrollment[] => {
    return courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description || null,
      thumbnail_url: course.thumbnail_url || null,
      estimated_duration_hours: course.estimated_duration_hours || null,
      difficulty_level: course.difficulty_level || null,
      learning_objectives: course.learning_objectives || null,
      instructor: course.instructor_name ? {
        id: course.instructor_id || '',
        full_name: course.instructor_name,
        photo_url: course.instructors?.photo_url || null,
      } : undefined,
      enrollment: {
        progress_percentage: course.progress_percentage || 0,
        lessons_completed: course.lessons_completed || 0,
        total_lessons: course.total_lessons || 0,
        is_completed: course.is_completed || false,
        last_activity: course.last_activity || null,
      },
    }));
  };

  // Computed values - courses in progress
  const inProgressCourses = useMemo(() => {
    const filtered = allCourses.filter(
      course => !course.is_completed && (course.enrolled_at || course.progress_percentage > 0)
    ).sort((a, b) => {
      const aProgress = a.progress_percentage || 0;
      const bProgress = b.progress_percentage || 0;
      return bProgress - aProgress;
    });
    return transformToNetflixFormat(filtered);
  }, [allCourses]);

  // Open courses (assigned but not started yet)
  const openCourses = useMemo(() => {
    const filtered = allCourses.filter(
      course => !course.is_completed && !course.enrolled_at && (course.progress_percentage === 0 || !course.progress_percentage)
    );
    return transformToNetflixFormat(filtered);
  }, [allCourses]);

  // Password change notification
  useEffect(() => {
    try {
      const passwordChangeSuccess = sessionStorage.getItem('fne-password-change-success');
      if (passwordChangeSuccess === 'true') {
        sessionStorage.removeItem('fne-password-change-success');
        setTimeout(() => toastSuccess('Contraseña actualizada exitosamente'), 100);
      }
    } catch (e) {
      console.error('[Dashboard] Error checking password change:', e);
    }
  }, []);

  // Fetch news articles
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/news?limit=3');
        if (response.ok) {
          const data = await response.json();
          setNewsArticles(data.articles || []);
        }
      } catch (error) {
        console.error('Error fetching news:', error);
      } finally {
        setLoadingNews(false);
      }
    };
    fetchNews();
  }, []);

  // Fetch YouTube videos
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const response = await fetch('/api/youtube/latest?limit=2');
        if (response.ok) {
          const data = await response.json();
          setYoutubeVideos(data.videos || []);
        }
      } catch (error) {
        console.error('Error fetching videos:', error);
      } finally {
        setLoadingVideos(false);
      }
    };
    fetchVideos();
  }, []);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard/stats');
        if (response.ok) {
          const data = await response.json();
          setDashboardStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, []);

  // Main session and data loading
  useEffect(() => {
    const checkSession = async () => {
      try {
        if (!session?.user) {
          router.push('/login');
          return;
        }

        setUser(session.user);

        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (!userError && userData?.user) {
          const adminRole = metadataHasRole(userData.user.user_metadata, 'admin');
          setIsAdmin(adminRole);

          // Load cached avatar
          try {
            const cachedData = sessionStorage.getItem('fne-avatar-cache');
            if (cachedData) {
              const cache = JSON.parse(cachedData);
              const userCache = cache[userData.user.id];
              if (userCache?.url && Date.now() - userCache.timestamp < 1000 * 60 * 30) {
                setAvatarUrl(userCache.url);
              }
            }
          } catch (e) {}

          // Fetch profile
          let { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('first_name, last_name, avatar_url, school, description, must_change_password')
            .eq('id', userData.user.id)
            .single();

          if (profileError?.message?.includes('Auth session missing')) {
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshData?.session) {
              const { data: retryData } = await supabase
                .from('profiles')
                .select('first_name, last_name, avatar_url, school, description, must_change_password')
                .eq('id', userData.user.id)
                .single();
              profileData = retryData;
            }
          }

          if (!profileData) {
            router.push('/profile?from=dashboard&error=profile-fetch-failed');
            return;
          }

          if (profileData.must_change_password === true) {
            router.push('/change-password');
            return;
          }

          setProfileData(profileData);

          const { effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(supabase, userData.user.id);
          setUserRole(effectiveRole);
          setIsAdmin(isAdminUser);

          if (profileData.first_name && profileData.last_name) {
            setProfileName(`${profileData.first_name} ${profileData.last_name}`);
          }

          if (profileData.avatar_url) {
            setAvatarUrl(profileData.avatar_url);
            updateAvatarCache(userData.user.id, profileData.avatar_url);
          }

          // Fetch user roles and community data
          const roles = await getUserRoles(supabase, userData.user.id);
          setUserRoles(roles);

          const communityMembersData: Record<string, UserProfile[]> = {};
          const communityWorkspacesData: Record<string, any> = {};

          for (const role of roles) {
            if (role.community_id) {
              try {
                const members = await getCommunityMembers(supabase, role.community_id);
                communityMembersData[role.community_id] = members;
                const workspace = await getOrCreateWorkspace(role.community_id);
                if (workspace) {
                  communityWorkspacesData[role.community_id] = workspace;
                }
              } catch (error) {
                console.error('Error fetching community data:', error);
              }
            }
          }
          setCommunityMembers(communityMembersData);
          setCommunityWorkspaces(communityWorkspacesData);

          // Fetch courses
          if (isAdminUser) {
            const { data: allCoursesData } = await supabase
              .from('courses')
              .select('*, instructors(full_name, photo_url)')
              .order('created_at', { ascending: false });

            if (allCoursesData) {
              setAllCourses(allCoursesData.map(course => ({
                ...course,
                instructor_name: course.instructors?.full_name || 'Sin instructor',
                thumbnail_url: course.thumbnail_url !== 'default-thumbnail.png' ? course.thumbnail_url : null
              })));
            }
          } else {
            const { data: assignedCoursesData } = await supabase
              .from('course_assignments')
              .select(`
                course_id,
                courses (
                  id, title, description, thumbnail_url, structure_type,
                  instructor_id, created_at, instructors(full_name)
                )
              `)
              .eq('teacher_id', userData.user.id);

            if (assignedCoursesData) {
              const baseCourses = assignedCoursesData
                .map(a => a.courses)
                .filter((c): c is NonNullable<typeof c> => c !== null)
                .map((course: any) => ({
                  ...course,
                  instructor_name: course.instructors?.full_name || 'Sin instructor',
                  thumbnail_url: course.thumbnail_url !== 'default-thumbnail.png' ? course.thumbnail_url : null
                }));

              const courseIds = baseCourses.map((c: any) => c.id);

              if (courseIds.length > 0) {
                const { data: enrollments } = await supabase
                  .from('course_enrollments')
                  .select('course_id, progress_percentage, is_completed, enrolled_at')
                  .eq('user_id', userData.user.id)
                  .in('course_id', courseIds);

                const enrollmentMap = new Map(enrollments?.map(e => [e.course_id, e]) || []);

                setAllCourses(baseCourses.map((course: any) => {
                  const enrollment = enrollmentMap.get(course.id);
                  return {
                    ...course,
                    progress_percentage: enrollment?.progress_percentage || 0,
                    is_completed: enrollment?.is_completed || false,
                    enrolled_at: enrollment?.enrolled_at || null
                  };
                }));
              } else {
                setAllCourses(baseCourses);
              }
            }
          }

          // Fetch learning paths
          try {
            const response = await fetch('/api/learning-paths/my-paths');
            if (response.ok) {
              const pathsData = await response.json();
              setLearningPaths(Array.isArray(pathsData) ? pathsData : []);
            }
          } catch (error) {
            console.error('Error fetching learning paths:', error);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Error in checkSession:', error);
        setLoading(false);
        router.push('/login');
      }
    };

    checkSession();
  }, [router, session, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  if (loading) {
    return (
      <MainLayout
        user={user}
        currentPage="dashboard"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        userRole={userRole}
        onLogout={handleLogout}
        avatarUrl={avatarUrl || undefined}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_primary mx-auto"></div>
            <p className="mt-4 text-brand_primary font-medium">Cargando...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="dashboard"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      userRole={userRole}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      {/* Welcome Header */}
      <div className="bg-brand_beige border-b border-brand_accent/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                user={user}
                avatarUrl={avatarUrl}
                size="lg"
                className="ring-4 ring-brand_accent shadow-lg"
              />
              <div>
                <h1 className="text-2xl font-bold text-brand_primary">
                  ¡Hola, {profileName?.split(' ')[0] || 'Usuario'}!
                </h1>
                <p className="text-gray-600 mt-1">
                  Bienvenido de vuelta a tu espacio de aprendizaje
                </p>
              </div>
            </div>
            <Link
              href="/profile"
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand_primary text-white hover:bg-brand_primary/90 rounded-lg transition-colors shadow-sm"
            >
              <Settings className="h-4 w-4" />
              <span>Mi Perfil</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Growth Community Section - Collapsible */}
        {userRoles.some(role => role.community_id) && (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {userRoles.map(role => {
              if (!role.community_id || !role.community) return null;

              const members = communityMembers[role.community_id] || [];
              const workspace = communityWorkspaces[role.community_id];

              return (
                <div key={role.id}>
                  {/* Header - Always Visible */}
                  <button
                    onClick={() => setCommunityExpanded(!communityExpanded)}
                    className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {workspace?.image_url ? (
                        <img
                          src={workspace.image_url}
                          alt={workspace.custom_name || role.community.name}
                          className="w-14 h-14 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gradient-to-br from-brand_accent/20 to-brand_accent/10 rounded-xl flex items-center justify-center">
                          <Users className="w-7 h-7 text-brand_accent" />
                        </div>
                      )}
                      <div className="text-left">
                        <h2 className="text-lg font-semibold text-brand_primary">
                          {workspace?.custom_name || role.community.name}
                        </h2>
                        <p className="text-sm text-gray-500">
                          {role.school?.name} • {members.length} miembros
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {members.slice(0, 4).map((member, idx) => (
                          <div key={member.id} className="relative" style={{ zIndex: 4 - idx }}>
                            {member.avatar_url ? (
                              <img
                                src={member.avatar_url}
                                alt=""
                                className="w-8 h-8 rounded-full border-2 border-white object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full border-2 border-white bg-brand_accent flex items-center justify-center">
                                <span className="text-xs font-bold text-brand_primary">
                                  {member.first_name?.charAt(0) || 'U'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                        {members.length > 4 && (
                          <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-600">+{members.length - 4}</span>
                          </div>
                        )}
                      </div>
                      {communityExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {communityExpanded && (
                    <div className="px-6 pb-6 border-t border-gray-100">
                      <div className="pt-4 flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                          Miembros de la Comunidad
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedWorkspace(workspace);
                              setShowWorkspaceSettings(true);
                            }}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Configuración"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <Link
                            href="/community/workspace"
                            className="px-3 py-1.5 text-sm font-medium text-brand_primary hover:bg-brand_accent/10 rounded-lg transition-colors"
                          >
                            Ver Espacio Completo →
                          </Link>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {members.map(member => (
                          <Link
                            key={member.id}
                            href={`/user/${member.id}`}
                            className="flex flex-col items-center p-3 bg-gray-50 rounded-xl hover:bg-brand_accent/10 hover:shadow-sm transition-all group"
                          >
                            {member.avatar_url ? (
                              <img
                                src={member.avatar_url}
                                alt=""
                                className="w-12 h-12 rounded-full object-cover mb-2 group-hover:ring-2 ring-brand_accent transition-all"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-brand_accent flex items-center justify-center mb-2 group-hover:ring-2 ring-brand_accent/50 transition-all">
                                <span className="text-lg font-bold text-brand_primary">
                                  {member.first_name?.charAt(0) || 'U'}
                                </span>
                              </div>
                            )}
                            <p className="text-sm font-medium text-gray-900 text-center truncate w-full">
                              {member.first_name || 'Usuario'}
                            </p>
                            {member.id === user?.id && (
                              <span className="text-xs text-brand_accent font-medium">Tú</span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Latest News Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand_accent/10 rounded-lg">
                <Newspaper className="w-5 h-5 text-brand_accent" />
              </div>
              <h2 className="text-xl font-bold text-brand_primary">Últimas Noticias</h2>
            </div>
            <Link
              href="/noticias"
              className="text-sm font-medium text-brand_primary hover:text-brand_accent transition-colors flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loadingNews ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="h-32 bg-gray-200 rounded-lg mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : newsArticles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {newsArticles.map((article, index) => (
                <Link
                  key={article.id}
                  href={`/noticias/${article.slug}`}
                  className={`group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all ${
                    index === 0 ? 'md:col-span-1' : ''
                  }`}
                >
                  {article.featured_image && (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={article.featured_image}
                        alt={article.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-xs text-gray-500 mb-2">
                      {formatTimeAgo(article.display_date || article.created_at)}
                    </p>
                    <h3 className="font-semibold text-brand_primary group-hover:text-brand_accent transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {getExcerpt(article.content_html)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-gray-500">
              No hay noticias disponibles
            </div>
          )}
        </section>

        {/* YouTube Videos Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Play className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-brand_primary">Videos Recientes</h2>
            </div>
            <a
              href="https://www.youtube.com/@NuevaEducacionFundacion"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand_primary hover:text-brand_accent transition-colors flex items-center gap-1"
            >
              Ver canal <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {loadingVideos ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="aspect-video bg-gray-200 rounded-lg mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          ) : youtubeVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {youtubeVideos.map(video => (
                <a
                  key={video.id}
                  href={`https://www.youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all"
                >
                  <div className="aspect-video relative overflow-hidden bg-gray-900">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                      <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="w-8 h-8 text-white fill-white ml-1" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-brand_primary group-hover:text-brand_accent transition-colors line-clamp-2">
                      {video.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatTimeAgo(video.publishedAt)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-gray-500">
              No hay videos disponibles
            </div>
          )}
        </section>

        {/* Statistics Section - Netflix-inspired minimal design */}
        <section>
          <h2 className="text-xl font-bold text-brand_primary mb-6">Estadísticas de la Plataforma</h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Total Users - Large emphasis card */}
            <div className="bg-brand_primary rounded-xl p-6">
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">Educadores Activos</p>
              <p className="text-5xl font-bold text-white mt-2">
                {loadingStats ? (
                  <span className="inline-block w-24 h-12 bg-gray-700 rounded animate-pulse"></span>
                ) : (
                  (dashboardStats?.totalUsers || 0).toLocaleString()
                )}
              </p>
              <p className="text-gray-500 text-sm mt-3">en toda la plataforma</p>
            </div>

            {/* Most Completed Course */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Curso Más Completado</p>
              {loadingStats ? (
                <div className="mt-4 space-y-3">
                  <div className="h-5 bg-gray-100 rounded w-full animate-pulse"></div>
                  <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse"></div>
                </div>
              ) : dashboardStats?.mostCompletedCourse ? (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-brand_primary leading-tight">
                    {dashboardStats.mostCompletedCourse.title}
                  </h3>
                  {dashboardStats.mostCompletedCourse.instructor_name && (
                    <p className="text-sm text-gray-600 mt-1">
                      Relator: {dashboardStats.mostCompletedCourse.instructor_name}
                    </p>
                  )}
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-3xl font-bold text-brand_accent">
                      {dashboardStats.mostCompletedCourse.completionCount}
                    </span>
                    <span className="text-gray-500 text-sm">completaciones</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 mt-4">Sin datos disponibles</p>
              )}
            </div>

            {/* Top Learner - Enhanced with more details */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Usuario Destacado</p>
              {loadingStats ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-full animate-pulse"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                      <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ) : dashboardStats?.topLearner ? (
                <div className="mt-4">
                  <div className="flex items-start gap-4">
                    {dashboardStats.topLearner.avatar_url ? (
                      <img
                        src={dashboardStats.topLearner.avatar_url}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-brand_accent flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-brand_primary">
                          {dashboardStats.topLearner.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-brand_primary text-lg leading-tight truncate">
                        {dashboardStats.topLearner.name}
                      </h3>
                      {dashboardStats.topLearner.role && (
                        <p className="text-sm text-gray-600 mt-0.5">
                          {dashboardStats.topLearner.role}
                        </p>
                      )}
                      {dashboardStats.topLearner.school_name && (
                        <p className="text-sm text-gray-500 truncate mt-0.5">
                          {dashboardStats.topLearner.school_name}
                        </p>
                      )}
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-2xl font-bold text-brand_accent">
                          {dashboardStats.topLearner.completedCourses}
                        </span>
                        <span className="text-gray-500 text-sm">cursos completados</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 mt-4">Sin datos disponibles</p>
              )}
            </div>
          </div>
        </section>

        {/* Continue Learning Section - Netflix Style */}
        {inProgressCourses.length > 0 && (
          <NetflixCourseRow
            title="Continuar Aprendiendo"
            courses={inProgressCourses}
            emptyMessage="No tienes cursos en progreso"
            onCourseSelect={(courseId) => router.push(`/student/course/${courseId}`)}
          />
        )}

        {/* Learning Paths Section */}
        {learningPaths.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-brand_primary">Mis Rutas de Aprendizaje</h2>
              <Link
                href="/mi-aprendizaje"
                className="text-sm font-medium text-brand_primary hover:text-brand_accent transition-colors flex items-center gap-1"
              >
                Ver todas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {learningPaths.slice(0, 3).map(path => (
                <LearningPathCard
                  key={path.id}
                  id={path.id}
                  name={path.name}
                  description={path.description}
                  assigned_at={path.assigned_at || new Date().toISOString()}
                  progress={path.progress ? {
                    path_id: path.id,
                    total_courses: path.progress.total_courses || 0,
                    completed_courses: path.progress.completed_courses || 0,
                    progress_percentage: path.progress.progress_percentage || 0,
                    last_accessed: path.progress.last_accessed || new Date().toISOString()
                  } : undefined}
                  onClick={() => router.push(`/mi-aprendizaje/ruta/${path.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Open Courses Section - Netflix Style */}
        {openCourses.length > 0 && (
          <NetflixCourseRow
            title="Mis Cursos Abiertos"
            courses={openCourses}
            emptyMessage="No tienes cursos asignados"
            onCourseSelect={(courseId) => router.push(`/student/course/${courseId}`)}
          />
        )}

      </div>

      {/* Workspace Settings Modal */}
      {selectedWorkspace && (
        <WorkspaceSettingsModal
          isOpen={showWorkspaceSettings}
          onClose={() => {
            setShowWorkspaceSettings(false);
            setSelectedWorkspace(null);
          }}
          workspaceId={selectedWorkspace.id}
          currentName={selectedWorkspace.custom_name || selectedWorkspace.name}
          currentImageUrl={selectedWorkspace.image_url}
          onUpdate={async (updates) => {
            const updatedWorkspaces = { ...communityWorkspaces };
            updatedWorkspaces[selectedWorkspace.community_id] = {
              ...selectedWorkspace,
              custom_name: updates.customName,
              image_url: updates.imageUrl
            };
            setCommunityWorkspaces(updatedWorkspaces);
          }}
        />
      )}
    </MainLayout>
  );
}
