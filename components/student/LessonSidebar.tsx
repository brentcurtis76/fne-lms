import { CheckCircle, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface Lesson {
  id: string;
  title: string;
  order_number: number;
  module_id?: string;
}

interface Module {
  id: string;
  title: string;
  order_number: number;
  lessons: Lesson[];
}

interface LessonProgress {
  lessonId: string;
  completedBlocks: number;
  totalBlocks: number;
  isCompleted: boolean;
}

interface LessonSidebarProps {
  courseId: string;
  courseTitle: string;
  structureType: 'simple' | 'structured';
  modules?: Module[];
  directLessons?: Lesson[];
  currentLessonId: string;
  progress: Record<string, LessonProgress>;
  onClose?: () => void;
}

export default function LessonSidebar({
  courseId,
  courseTitle,
  structureType,
  modules = [],
  directLessons = [],
  currentLessonId,
  progress,
  onClose
}: LessonSidebarProps) {
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
    // Initially expand the module containing the current lesson
    if (structureType === 'structured') {
      const initialExpanded: Record<string, boolean> = {};
      modules.forEach(module => {
        if (module.lessons.some(l => l.id === currentLessonId)) {
          initialExpanded[module.id] = true;
        }
      });
      return initialExpanded;
    }
    return {};
  });

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  const getLessonStatus = (lessonId: string) => {
    const lessonProgress = progress[lessonId];
    if (!lessonProgress) return 'not-started';
    if (lessonProgress.isCompleted) return 'completed';
    if (lessonProgress.completedBlocks > 0) return 'in-progress';
    return 'not-started';
  };

  const getLessonProgressPercent = (lessonId: string) => {
    const lessonProgress = progress[lessonId];
    if (!lessonProgress || lessonProgress.totalBlocks === 0) return 0;
    return Math.round((lessonProgress.completedBlocks / lessonProgress.totalBlocks) * 100);
  };

  const renderLessonItem = (lesson: Lesson) => {
    const status = getLessonStatus(lesson.id);
    const isActive = lesson.id === currentLessonId;
    const progressPercent = getLessonProgressPercent(lesson.id);

    return (
      <Link
        key={lesson.id}
        href={`/student/lesson/${lesson.id}`}
        onClick={onClose}
        className={`block px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-[#0a0a0a] text-white'
            : 'hover:bg-gray-100 text-gray-700'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
            status === 'completed'
              ? 'bg-green-100'
              : status === 'in-progress'
                ? 'bg-blue-100'
                : isActive ? 'bg-white/20' : 'bg-gray-100'
          }`}>
            {status === 'completed' ? (
              <CheckCircle className={`w-3 h-3 ${isActive ? 'text-green-300' : 'text-green-600'}`} />
            ) : (
              <BookOpen className={`w-3 h-3 ${
                isActive ? 'text-white/80' : status === 'in-progress' ? 'text-blue-600' : 'text-gray-400'
              }`} />
            )}
          </div>
          <span className="flex-1 truncate">
            {lesson.order_number}. {lesson.title}
          </span>
        </div>

        {/* Progress bar for in-progress lessons */}
        {status === 'in-progress' && !isActive && (
          <div className="mt-1 ml-7">
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-blue-500 h-1 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </Link>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <Link
          href={`/student/course/${courseId}`}
          className="text-sm text-gray-500 hover:text-[#0a0a0a] flex items-center gap-1 mb-2"
        >
          ← Volver al curso
        </Link>
        <h2 className="font-semibold text-[#0a0a0a] truncate" title={courseTitle}>
          {courseTitle}
        </h2>
      </div>

      {/* Lessons List */}
      <div className="flex-1 overflow-y-auto p-2">
        {structureType === 'simple' ? (
          // Simple course: direct list of lessons
          <div className="space-y-1">
            {directLessons.map(lesson => renderLessonItem(lesson))}
          </div>
        ) : (
          // Structured course: modules with lessons
          <div className="space-y-2">
            {modules.map(module => (
              <div key={module.id}>
                {/* Module header */}
                <button
                  onClick={() => toggleModule(module.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 rounded-md"
                >
                  {expandedModules[module.id] ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="truncate">
                    M{module.order_number}: {module.title}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {module.lessons.filter(l => getLessonStatus(l.id) === 'completed').length}/{module.lessons.length}
                  </span>
                </button>

                {/* Module lessons */}
                {expandedModules[module.id] && (
                  <div className="ml-4 space-y-1 mt-1">
                    {module.lessons.map(lesson => renderLessonItem(lesson))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with progress */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 mb-1">Progreso del curso</div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
            style={{
              width: `${(() => {
                const allLessons = structureType === 'simple'
                  ? directLessons
                  : modules.flatMap(m => m.lessons);
                const completed = allLessons.filter(l => getLessonStatus(l.id) === 'completed').length;
                return allLessons.length > 0 ? Math.round((completed / allLessons.length) * 100) : 0;
              })()}%`
            }}
          />
        </div>
        <div className="text-xs text-gray-500 mt-1 text-right">
          {(() => {
            const allLessons = structureType === 'simple'
              ? directLessons
              : modules.flatMap(m => m.lessons);
            const completed = allLessons.filter(l => getLessonStatus(l.id) === 'completed').length;
            return `${completed}/${allLessons.length} lecciones`;
          })()}
        </div>
      </div>
    </div>
  );
}
