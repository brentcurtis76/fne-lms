import { useEffect, useState, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient, useSession } from '@supabase/auth-helpers-react';
import { toastSuccess } from '../utils/toastUtils';
import { getUserRoles, getCommunityMembers, getEffectiveRoleAndStatus, metadataHasRole } from '../utils/roleUtils';
import { UserRole, UserProfile } from '../types/roles';
import { updateAvatarCache } from './useAvatar';
import { getOrCreateWorkspace } from '../utils/workspaceUtils';
import { canEditWorkspaceWithRoles } from '../lib/services/communityWorkspace';
import { getExternalSchoolLabel } from '../constants/externalSchools';
import { CourseWithEnrollment } from '../types/courses';
import type { UpcomingCourse } from '../components/courses/UpcomingCourseCard';
import type { NewsArticle, YouTubeVideo, DashboardStats } from '../components/panel/types';

/**
 * Everything «Mi Panel» knows and decides: its state, its data calls, its redirects, the arrival
 * toast, the two course lists, sign-out, and one named copy of each decision its markup makes
 * (worked out by `decide()`, only when the panel's body is drawn).
 * Moved out of `pages/dashboard.tsx` unchanged (redesign 6A): the same hooks in the same order, the
 * same effects with the same dependency lists, each condition the same expression as before.
 */
export function usePanel() {
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
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);
  const [showMemberProfile, setShowMemberProfile] = useState(false);

  // New dashboard sections state
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loadingNews, setLoadingNews] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [upcomingCourses, setUpcomingCourses] = useState<UpcomingCourse[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);

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

  // Fetch dashboard stats (with auth for role-scoped data)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: { session: statsSession } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (statsSession?.access_token) {
          headers['Authorization'] = `Bearer ${statsSession.access_token}`;
        }
        const response = await fetch('/api/dashboard/stats', { headers });
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
  }, [supabase]);

  // Fetch upcoming courses
  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        const response = await fetch('/api/upcoming-courses');
        if (response.ok) {
          const data = await response.json();
          setUpcomingCourses(data || []);
        }
      } catch (error) {
        console.error('Error fetching upcoming courses:', error);
      } finally {
        setLoadingUpcoming(false);
      }
    };
    fetchUpcoming();
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
            .select('first_name, last_name, avatar_url, school, description, must_change_password, external_school_affiliation')
            .eq('id', userData.user.id)
            .single();

          if (profileError?.message?.includes('Auth session missing')) {
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshData?.session) {
              const { data: retryData } = await supabase
                .from('profiles')
                .select('first_name, last_name, avatar_url, school, description, must_change_password, external_school_affiliation')
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

  // Handlers the markup wrote inline
  const toggleCommunity = () => setCommunityExpanded(!communityExpanded);
  const chooseCommunity = (e: MouseEvent, communityId: string) => {
    e.stopPropagation();
    setSelectedCommunityId(communityId);
  };
  const openWorkspaceSettings = (e: MouseEvent, workspace: any) => {
    e.stopPropagation();
    setSelectedWorkspace(workspace);
    setShowWorkspaceSettings(true);
  };
  const closeWorkspaceSettings = () => {
    setShowWorkspaceSettings(false);
    setSelectedWorkspace(null);
  };
  const updateWorkspace = async (updates: { customName?: string; imageUrl?: string }) => {
    const updatedWorkspaces = { ...communityWorkspaces };
    updatedWorkspaces[selectedWorkspace.community_id] = {
      ...selectedWorkspace,
      custom_name: updates.customName,
      image_url: updates.imageUrl
    };
    setCommunityWorkspaces(updatedWorkspaces);
  };
  const openMember = (member: UserProfile) => {
    setSelectedMember(member);
    setShowMemberProfile(true);
  };
  const closeMemberProfile = () => {
    setShowMemberProfile(false);
    setSelectedMember(null);
  };
  const openCourse = (courseId: string) => router.push(`/student/course/${courseId}`);
  const openLearningPath = (pathId: string) => router.push(`/mi-aprendizaje/ruta/${pathId}`);

  /**
   * The decisions the markup makes, one copy each, from today's expressions as they were. Worked
   * out only when the panel's body is about to be drawn: the page calls this AFTER its loading
   * return, where the body began before 6A, so nothing of it runs while the loading mark shows.
   * Inside, today's order: the greeting, the consultor's line, the community block, the sections.
   * Two decisions keep the guard they had in the markup and are functions the view calls at that
   * place: the gear (only inside the opened community block) and the route cards (only inside
   * «Mis Rutas de Aprendizaje»); whether the member pop-up shows the viewer is asked where the
   * pop-up's props are built.
   */
  const decide = () => {
    // Welcome band
    const greetingName = profileName?.split(' ')[0] || 'Usuario';
    const showConsultorAffiliation = userRole === 'consultor' && profileData?.external_school_affiliation;
    const consultorAffiliationLabel = showConsultorAffiliation
      ? getExternalSchoolLabel(profileData.external_school_affiliation)
      : null;

    // Growth community block: null when it is not drawn
    const community = userRoles.some(role => role.community_id) ? (() => {
      // Get all communities user belongs to
      const userCommunities = userRoles.filter(role => role.community_id && role.community);

      // Initialize selectedCommunityId if not set
      const effectiveCommunityId = selectedCommunityId || userCommunities[0]?.community_id;

      // Find the selected community role
      const selectedRole = userCommunities.find(r => r.community_id === effectiveCommunityId) || userCommunities[0];

      if (!selectedRole || !selectedRole.community) return null;

      const members = communityMembers[selectedRole.community_id!] || [];
      const workspace = communityWorkspaces[selectedRole.community_id!];

      return {
        userCommunities,
        effectiveCommunityId,
        selectedRole,
        members,
        workspace,
        // Community Selector - Only show if user has multiple communities
        showCommunityPicker: userCommunities.length > 1,
        // Only for those who can save the settings: admin or this community's manager (N87).
        // Asked by the view inside the opened block only, where the markup asked it.
        canEditWorkspace: () => canEditWorkspaceWithRoles(userRoles, selectedRole.community_id),
      };
    })() : null;

    // Sections
    const showUpcomingCourses = !loadingUpcoming && upcomingCourses.length > 0;
    // Course Proposals Section - Admin/Consultor only
    const showCourseProposals = (metadataHasRole(session?.user?.user_metadata, 'admin') ||
      metadataHasRole(session?.user?.user_metadata, 'consultor') ||
      userRoles.some(r => r.role_type === 'admin' || r.role_type === 'consultor'));
    const showBadges = user?.id;
    const showInProgressCourses = inProgressCourses.length > 0;
    const showLearningPaths = learningPaths.length > 0;
    // The route cards drawn (at most three), with the props each receives. Called by the view
    // inside the routes block, on every render of it, as the markup did: `new Date()` stands in
    // for a missing date at that moment.
    const learningPathCards = () => learningPaths.slice(0, 3).map(path => ({
      id: path.id,
      name: path.name,
      description: path.description,
      assigned_at: path.assigned_at || new Date().toISOString(),
      progress: path.progress ? {
        path_id: path.id,
        total_courses: path.progress.total_courses || 0,
        completed_courses: path.progress.completed_courses || 0,
        progress_percentage: path.progress.progress_percentage || 0,
        last_accessed: path.progress.last_accessed || new Date().toISOString()
      } : undefined,
      onClick: () => openLearningPath(path.id),
    }));
    const showOpenCourses = openCourses.length > 0;

    // Member pop-up: asked where its props are built
    const isSelectedMemberCurrentUser = () => selectedMember?.id === user?.id;

    return {
      greetingName,
      showConsultorAffiliation,
      consultorAffiliationLabel,
      community,
      showUpcomingCourses,
      showCourseProposals,
      showBadges,
      showInProgressCourses,
      showLearningPaths,
      learningPathCards,
      showOpenCourses,
      isSelectedMemberCurrentUser,
    };
  };

  return {
    // State the views read
    loading,
    user,
    profileName,
    avatarUrl,
    profileData,
    isAdmin,
    userRole,
    learningPaths,
    userRoles,
    communityMembers,
    communityWorkspaces,
    communityExpanded,
    showWorkspaceSettings,
    selectedWorkspace,
    selectedCommunityId,
    selectedMember,
    showMemberProfile,
    newsArticles,
    youtubeVideos,
    dashboardStats,
    loadingNews,
    loadingVideos,
    loadingStats,
    upcomingCourses,
    loadingUpcoming,
    inProgressCourses,
    openCourses,
    // The decisions, worked out only when called (after the loading return)
    decide,
    // Actions
    handleLogout,
    toggleCommunity,
    chooseCommunity,
    openWorkspaceSettings,
    closeWorkspaceSettings,
    updateWorkspace,
    openMember,
    closeMemberProfile,
    openCourse,
    openLearningPath,
  };
}

export type Panel = ReturnType<typeof usePanel>;
export type PanelDecisions = ReturnType<Panel['decide']>;
