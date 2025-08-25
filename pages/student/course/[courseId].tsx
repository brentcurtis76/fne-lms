import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../../lib/supabase';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Play, CheckCircle, Clock, BookOpen, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { GraduationCap, ChevronLeft } from 'lucide-react';
import { getUserPrimaryRole } from '../../../utils/roleUtils';

interface Course {
  id: string;
  title: string;
  description: string;
  structure_type?: 'simple' | 'structured';
}

interface Module {
  id: string;
  title: string;
  description: string;
  order_number: number;
  lessons: Lesson[];
}

interface Lesson {
  id: string;
  title: string;
  order_number: number;
  module_id?: string;
  course_id?: string;
  blocksCount?: number;
}

interface Progress {
  lessonId: string;
  completedBlocks: number;
  totalBlocks: number;
  isCompleted: boolean;
  lastAccessed?: string;
}

export default function StudentCourseViewer() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { courseId } = router.query;

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [directLessons, setDirectLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    const initializeCourseViewer = async () => {
      if (!router.isReady || !courseId) return;
      
      console.log('=== COURSE VIEWER INITIALIZATION ===');
      console.log('Router query:', router.query);
      console.log('Course ID from router:', courseId);
      console.log('Router pathname:', router.pathname);
      console.log('Router asPath:', router.asPath);

      try {
        // Get current user
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        setUser(session.user);

        // Check if user is admin and get profile data
        try {
          const adminInMetadata = session.user?.user_metadata?.role === 'admin';
          if (adminInMetadata) {
            setIsAdmin(true);
          } else {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('first_name, last_name, avatar_url')
              .eq('id', session.user.id)
              .single();
            
            if (profileData) {
              const userRole = await getUserPrimaryRole(session.user.id);
              setIsAdmin(userRole === 'admin');
              
              if (profileData.first_name && profileData.last_name) {
                setProfileName(`${profileData.first_name} ${profileData.last_name}`);
              }
              
              if (profileData.avatar_url) {
                setAvatarUrl(profileData.avatar_url);
              }
            }
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        }

        // Fetch course data
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select('*')
          .eq('id', courseId)
          .single();

        if (courseError) throw courseError;
        setCourse(courseData);

        // Determine course structure and fetch appropriate content
        if (courseData.structure_type === 'simple') {
          console.log('Course is SIMPLE structure - fetching direct lessons');
          
          // Fetch direct lessons for simple courses
          const { data: lessonsData, error: lessonsError } = await supabase
            .from('lessons')
            .select('*')
            .eq('course_id', courseId)
            .is('module_id', null)
            .order('order_number', { ascending: true });

          if (lessonsError) throw lessonsError;
          
          console.log('Raw direct lessons from DB:', lessonsData);

          // Get block count for each lesson
          const lessonsWithBlockCount: Lesson[] = [];
          for (const lesson of lessonsData || []) {
            console.log(`Getting block count for lesson: ${lesson.id} (${lesson.title})`);
            
            const { count: blockCount } = await supabase
              .from('blocks')
              .select('*', { count: 'exact', head: true })
              .eq('lesson_id', lesson.id);

            console.log(`Block count for lesson ${lesson.id}: ${blockCount}`);

            const lessonWithCount = {
              ...lesson,
              blocksCount: blockCount || 0
            };
            
            console.log('Final lesson object:', lessonWithCount);
            lessonsWithBlockCount.push(lessonWithCount);
          }

          setDirectLessons(lessonsWithBlockCount);
          setModules([]); // No modules for simple courses
          
          console.log('DEBUG: Direct lessons loaded:', lessonsWithBlockCount);
          
        } else {
          console.log('Course is STRUCTURED - fetching modules with lessons');
          
          // Fetch modules with lessons for structured courses
          const { data: modulesData, error: modulesError } = await supabase
            .from('modules')
            .select('*')
            .eq('course_id', courseId)
            .order('order_number', { ascending: true });

          if (modulesError) throw modulesError;

          // Fetch lessons for each module
          const modulesWithLessons: Module[] = [];
          for (const module of modulesData || []) {
            console.log(`=== FETCHING LESSONS FOR MODULE: ${module.id} ===`);
            
            const { data: lessonsData, error: lessonsError } = await supabase
              .from('lessons')
              .select('*')
              .eq('module_id', module.id)
              .order('order_number', { ascending: true });

            if (lessonsError) throw lessonsError;
            
            console.log('Raw lessons from DB:', lessonsData);

            // Get block count for each lesson
            const lessonsWithBlockCount: Lesson[] = [];
            for (const lesson of lessonsData || []) {
              console.log(`Getting block count for lesson: ${lesson.id} (${lesson.title})`);
              
              const { count: blockCount } = await supabase
                .from('blocks')
                .select('*', { count: 'exact', head: true })
                .eq('lesson_id', lesson.id);

              console.log(`Block count for lesson ${lesson.id}: ${blockCount}`);

              const lessonWithCount = {
                ...lesson,
                blocksCount: blockCount || 0
              };
              
              console.log('Final lesson object:', lessonWithCount);
              lessonsWithBlockCount.push(lessonWithCount);
            }

            modulesWithLessons.push({
              ...module,
              lessons: lessonsWithBlockCount
            });
          }

          setModules(modulesWithLessons);
          setDirectLessons([]); // No direct lessons for structured courses

          // DEBUG: Log the modules and lessons data
          console.log('DEBUG: Modules with lessons loaded:', modulesWithLessons);
        }

        // Fetch progress for all lessons in the course
        let allLessonIds: string[] = [];
        let allLessonsWithBlockCounts: Lesson[] = [];
        
        if (courseData.structure_type === 'simple') {
          // For simple courses, we already have the lessons in lessonsWithBlockCount
          const { data: lessonsData } = await supabase
            .from('lessons')
            .select('*')
            .eq('course_id', courseId)
            .is('module_id', null)
            .order('order_number', { ascending: true });
            
          if (lessonsData) {
            for (const lesson of lessonsData) {
              const { count: blockCount } = await supabase
                .from('blocks')
                .select('*', { count: 'exact', head: true })
                .eq('lesson_id', lesson.id);
              
              allLessonsWithBlockCounts.push({
                ...lesson,
                blocksCount: blockCount || 0
              });
            }
            allLessonIds = allLessonsWithBlockCounts.map(l => l.id);
          }
        } else {
          // For structured courses, extract from modules
          allLessonsWithBlockCounts = modules.flatMap(m => m.lessons);
          allLessonIds = allLessonsWithBlockCounts.map(l => l.id);
        }
        
        if (allLessonIds.length > 0) {
          const { data: progressData, error: progressError } = await supabase
            .from('lesson_progress')
            .select('lesson_id, block_id, completed_at, updated_at')
            .eq('user_id', session.user.id)
            .in('lesson_id', allLessonIds);

          if (progressError) throw progressError;

          // Process progress data
          const progressLookup: Record<string, Progress> = {};
          
          // Initialize progress for all lessons
          allLessonsWithBlockCounts.forEach(lesson => {
            progressLookup[lesson.id] = {
              lessonId: lesson.id,
              completedBlocks: 0,
              totalBlocks: lesson.blocksCount || 0,
              isCompleted: false
            };
          });

          // Track unique block completions to avoid counting duplicates
          const completedBlockIds = new Set<string>();

          // Update with actual progress
          progressData?.forEach(p => {
            if (!progressLookup[p.lesson_id]) {
              progressLookup[p.lesson_id] = {
                lessonId: p.lesson_id,
                completedBlocks: 0,
                totalBlocks: 0,
                isCompleted: false
              };
            }

            // Only count unique block completions (users may retake lessons)
            if (p.completed_at && p.block_id) {
              completedBlockIds.add(`${p.lesson_id}-${p.block_id}`);
            }

            if (p.updated_at && (!progressLookup[p.lesson_id].lastAccessed || 
                p.updated_at > progressLookup[p.lesson_id].lastAccessed!)) {
              progressLookup[p.lesson_id].lastAccessed = p.updated_at;
            }
          });

          // Update completed blocks count with unique blocks only
          Object.keys(progressLookup).forEach(lessonId => {
            const uniqueBlocks = Array.from(completedBlockIds)
              .filter(id => id.startsWith(`${lessonId}-`))
              .length;
            progressLookup[lessonId].completedBlocks = uniqueBlocks;
          });

          // Determine completion status
          Object.keys(progressLookup).forEach(lessonId => {
            const lessonProgress = progressLookup[lessonId];
            lessonProgress.isCompleted = lessonProgress.completedBlocks === lessonProgress.totalBlocks && lessonProgress.totalBlocks > 0;
          });

          setProgress(progressLookup);
        }

      } catch (error: any) {
        console.error('Error initializing course viewer:', error);
        toast.error('Error cargando el curso');
      } finally {
        setLoading(false);
      }
    };

    initializeCourseViewer();
  }, [router.isReady, courseId]);

  const getTotalLessons = () => {
    if (course?.structure_type === 'simple') {
      return directLessons.length;
    }
    return modules.reduce((total, module) => total + module.lessons.length, 0);
  };

  const getCompletedLessons = () => {
    return Object.values(progress).filter(p => p.isCompleted).length;
  };

  const getCourseProgressPercentage = () => {
    const total = getTotalLessons();
    const completed = getCompletedLessons();
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const getLessonProgressPercentage = (lessonId: string) => {
    const lessonProgress = progress[lessonId];
    if (!lessonProgress || lessonProgress.totalBlocks === 0) return 0;
    return Math.round((lessonProgress.completedBlocks / lessonProgress.totalBlocks) * 100);
  };

  const getNextLesson = () => {
    console.log('DEBUG: getNextLesson called');
    console.log('DEBUG: Course structure type:', course?.structure_type);
    console.log('DEBUG: progress state:', progress);
    
    if (course?.structure_type === 'simple') {
      console.log('DEBUG: Checking direct lessons:', directLessons);
      for (const lesson of directLessons) {
        const lessonProgress = progress[lesson.id];
        console.log(`DEBUG: Checking lesson ${lesson.id} (${lesson.title}), progress:`, lessonProgress);
        if (!lessonProgress?.isCompleted) {
          console.log('DEBUG: Found next lesson:', lesson);
          return { lesson, module: null };
        }
      }
    } else {
      console.log('DEBUG: Checking modules:', modules);
      for (const module of modules) {
        for (const lesson of module.lessons) {
          const lessonProgress = progress[lesson.id];
          console.log(`DEBUG: Checking lesson ${lesson.id} (${lesson.title}), progress:`, lessonProgress);
          if (!lessonProgress?.isCompleted) {
            console.log('DEBUG: Found next lesson:', { module, lesson });
            return { module, lesson };
          }
        }
      }
    }
    console.log('DEBUG: No incomplete lessons found, all completed');
    return null; // All lessons completed
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b] mx-auto mb-4"></div>
          <p className="text-[#00365b] font-medium">Cargando curso...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">No se pudo cargar el curso</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  const nextLesson = getNextLesson();
  
  // CRITICAL DEBUG: Log what nextLesson contains
  console.log('=== NEXT LESSON DEBUG ===');
  console.log('nextLesson object:', nextLesson);
  if (nextLesson) {
    console.log('nextLesson.lesson.id:', nextLesson.lesson.id);
    console.log('URL will be:', `/student/lesson/${nextLesson.lesson.id}`);
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="courses"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<GraduationCap />}
        title={course.title}
        subtitle={course.description}
      >
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]"
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          Volver
        </button>
        <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md">
          <div className="flex items-center gap-2">
            <span>📊 Progreso:</span>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-[#10B981] to-[#059669] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${getCourseProgressPercentage()}%` }}
                ></div>
              </div>
              <span className="font-bold text-[#10B981]">
                {getCourseProgressPercentage()}%
              </span>
            </div>
          </div>
        </div>
      </ResponsiveFunctionalPageHeader>
      
      <div className="min-h-screen bg-gray-100">
        {/* Course Content */}
        <div className="max-w-6xl mx-auto p-6">
          {/* Continue Learning Section */}
          {nextLesson && (
            <div className="bg-gradient-to-r from-[#00365b] to-[#004080] text-white rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold mb-2">Continuar Aprendiendo</h2>
                  {nextLesson.module && (
                    <p className="text-blue-100 mb-1">
                      Módulo {nextLesson.module.order_number}: {nextLesson.module.title}
                    </p>
                  )}
                  <p className="text-white font-medium">
                    Lección {nextLesson.lesson.order_number}: {nextLesson.lesson.title}
                  </p>
                  <div className="mt-2">
                    <div className="text-sm text-blue-100 mb-1">
                      Progreso: {getLessonProgressPercentage(nextLesson.lesson.id)}%
                    </div>
                    <div className="w-48 bg-blue-800 rounded-full h-2">
                      <div 
                        className="bg-[#fdb933] h-2 rounded-full transition-all"
                        style={{ width: `${getLessonProgressPercentage(nextLesson.lesson.id)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/student/lesson/${nextLesson.lesson.id}`}
                  className="bg-[#fdb933] text-[#00365b] px-6 py-3 rounded-lg font-medium hover:bg-yellow-400 transition flex items-center gap-2"
                  onClick={() => {
                    console.log('DEBUG: Navigating to lesson ID:', nextLesson.lesson.id);
                    console.log('DEBUG: Full lesson object:', nextLesson.lesson);
                  }}
                >
                  <Play size={20} />
                  Continuar Lección
                </Link>
              </div>
            </div>
          )}

          {/* Course Content - Simple or Structured */}
          <div className="space-y-6">
            {course?.structure_type === 'simple' ? (
              // Simple Course: Display direct lessons
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-[#00365b]">
                        Lecciones del Curso
                      </h3>
                      <p className="text-gray-600 text-sm mt-1">
                        Este curso tiene {directLessons.length} {directLessons.length === 1 ? 'lección' : 'lecciones'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">
                        {directLessons.filter(l => progress[l.id]?.isCompleted).length}/{directLessons.length} completadas
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {directLessons.map((lesson) => {
                      const lessonProgress = progress[lesson.id];
                      const progressPercentage = getLessonProgressPercentage(lesson.id);
                      const isCompleted = lessonProgress?.isCompleted || false;
                      const hasStarted = lessonProgress?.completedBlocks > 0;

                      return (
                        <Link
                          key={lesson.id}
                          href={`/student/lesson/${lesson.id}`}
                          className="block bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition border-2 border-transparent hover:border-[#00365b]"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className={`p-2 rounded-full ${
                                isCompleted ? 'bg-green-100' : hasStarted ? 'bg-blue-100' : 'bg-gray-200'
                              }`}>
                                {isCompleted ? (
                                  <CheckCircle className="text-green-600" size={16} />
                                ) : (
                                  <BookOpen className={`${hasStarted ? 'text-blue-600' : 'text-gray-400'}`} size={16} />
                                )}
                              </div>
                              <span className="text-sm font-medium text-gray-600">
                                Lección {lesson.order_number}
                              </span>
                            </div>
                            
                            {lessonProgress?.lastAccessed && (
                              <div className="text-xs text-gray-400">
                                <Clock size={12} className="inline mr-1" />
                                Reciente
                              </div>
                            )}
                          </div>

                          <h4 className="font-medium text-gray-900 mb-2 line-clamp-2">
                            {lesson.title}
                          </h4>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>{lessonProgress?.totalBlocks || 0} bloques</span>
                              <span>{progressPercentage}% completado</span>
                            </div>
                            
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div 
                                className={`h-1.5 rounded-full transition-all ${
                                  isCompleted ? 'bg-green-500' : hasStarted ? 'bg-blue-500' : 'bg-gray-300'
                                }`}
                                style={{ width: `${progressPercentage}%` }}
                              ></div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              // Structured Course: Display modules with lessons
              modules.map((module) => (
                <div key={module.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className="bg-gray-50 px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-[#00365b]">
                          Módulo {module.order_number}: {module.title}
                        </h3>
                        {module.description && (
                          <p className="text-gray-600 text-sm mt-1">{module.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600">
                          {module.lessons.filter(l => progress[l.id]?.isCompleted).length}/{module.lessons.length} lecciones
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {module.lessons.map((lesson) => {
                        const lessonProgress = progress[lesson.id];
                        const progressPercentage = getLessonProgressPercentage(lesson.id);
                        const isCompleted = lessonProgress?.isCompleted || false;
                        const hasStarted = lessonProgress?.completedBlocks > 0;

                        return (
                          <Link
                            key={lesson.id}
                            href={`/student/lesson/${lesson.id}`}
                            className="block bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition border-2 border-transparent hover:border-[#00365b]"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className={`p-2 rounded-full ${
                                  isCompleted ? 'bg-green-100' : hasStarted ? 'bg-blue-100' : 'bg-gray-200'
                                }`}>
                                  {isCompleted ? (
                                    <CheckCircle className="text-green-600" size={16} />
                                  ) : (
                                    <BookOpen className={`${hasStarted ? 'text-blue-600' : 'text-gray-400'}`} size={16} />
                                  )}
                                </div>
                                <span className="text-sm font-medium text-gray-600">
                                  Lección {lesson.order_number}
                                </span>
                              </div>
                              
                              {lessonProgress?.lastAccessed && (
                                <div className="text-xs text-gray-400">
                                  <Clock size={12} className="inline mr-1" />
                                  Reciente
                                </div>
                              )}
                            </div>

                            <h4 className="font-medium text-gray-900 mb-2 line-clamp-2">
                              {lesson.title}
                            </h4>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{lessonProgress?.totalBlocks || 0} bloques</span>
                                <span>{progressPercentage}% completado</span>
                              </div>
                              
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div 
                                  className={`h-1.5 rounded-full transition-all ${
                                    isCompleted ? 'bg-green-500' : hasStarted ? 'bg-blue-500' : 'bg-gray-300'
                                  }`}
                                  style={{ width: `${progressPercentage}%` }}
                                ></div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Course Completion */}
          {getCourseProgressPercentage() === 100 && (
            <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
              <h3 className="text-xl font-bold text-green-800 mb-2">
                ¡Curso Completado!
              </h3>
              <p className="text-green-600">
                Has completado todas las lecciones de este curso. ¡Felicitaciones!
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}