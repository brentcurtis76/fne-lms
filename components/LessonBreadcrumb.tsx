import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, Home, BookOpen, FileText, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

interface LessonBreadcrumbProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
  lessonTitle: string;
  isLoading?: boolean;
  hasUnsavedChanges?: boolean;
  onSave?: () => void;
}

interface BreadcrumbData {
  courseName: string;
  moduleName: string;
  moduleOrder: number;
  lessonOrder: number;
}

const LessonBreadcrumb: React.FC<LessonBreadcrumbProps> = ({
  courseId,
  moduleId,
  lessonId,
  lessonTitle,
  isLoading = false,
  hasUnsavedChanges = false,
  onSave
}) => {
  const supabase = useSupabaseClient();
  const [breadcrumbData, setBreadcrumbData] = useState<BreadcrumbData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBreadcrumbData = async () => {
      
      try {
        // Fetch course data
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('title')
          .eq('id', courseId)
          .single();

        if (courseError) {
          console.error('Error fetching course:', courseError);
          return;
        }

        // Fetch module data with order
        const { data: module, error: moduleError } = await supabase
          .from('modules')
          .select('title, order_number')
          .eq('id', moduleId)
          .single();

        if (moduleError) {
          console.error('Error fetching module:', moduleError);
          return;
        }

        // Fetch lesson order within the module
        const { data: lesson, error: lessonError } = await supabase
          .from('lessons')
          .select('order_number')
          .eq('id', lessonId)
          .single();

        if (lessonError) {
          console.error('Error fetching lesson:', lessonError);
          return;
        }

        const data: BreadcrumbData = {
          courseName: course.title || 'Curso sin título',
          moduleName: module.title || 'Módulo sin título',
          moduleOrder: module.order_number || 0,
          lessonOrder: lesson.order_number || 0
        };

        setBreadcrumbData(data);
      } catch (error) {
        console.error('Error fetching breadcrumb data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBreadcrumbData();
  }, [courseId, moduleId, lessonId]);

  if (loading || !breadcrumbData) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="animate-pulse flex items-center space-x-2">
          <div className="h-4 bg-gray-300 rounded w-20"></div>
          <div className="h-4 bg-gray-300 rounded w-4"></div>
          <div className="h-4 bg-gray-300 rounded w-32"></div>
          <div className="h-4 bg-gray-300 rounded w-4"></div>
          <div className="h-4 bg-gray-300 rounded w-24"></div>
        </div>
      </div>
    );
  }

  const breadcrumbItems = [
    {
      label: 'Inicio',
      href: '/dashboard',
      icon: <Home size={16} />
    },
    {
      label: breadcrumbData.courseName,
      href: `/admin/course-builder/${courseId}`,
      icon: <BookOpen size={16} />
    },
    {
      label: `Módulo ${breadcrumbData.moduleOrder}: ${breadcrumbData.moduleName}`,
      href: `/admin/course-builder/${courseId}/${moduleId}`,
      icon: <FileText size={16} />
    },
    {
      label: `Lección ${breadcrumbData.lessonOrder}: ${lessonTitle}`,
      href: null, // Current page
      icon: <FileText size={16} />,
      current: true
    }
  ];

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6 py-4">
        <div className="space-y-4">
          {/* Breadcrumb Navigation - Vertical */}
          <nav className="space-y-2 text-sm">
            {breadcrumbItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <div className="w-4 h-4 flex items-center justify-center">
                    <ChevronRight size={14} className="text-gray-400 rotate-90" />
                  </div>
                )}
                
                {item.href ? (
                  <Link 
                    href={item.href}
                    className="flex items-center gap-2 text-gray-600 hover:text-[#00365b] transition-colors py-1"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 text-[#00365b] font-medium py-1">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Save Status */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {hasUnsavedChanges ? (
                <div className="flex items-center gap-1 text-orange-600">
                  <AlertCircle size={16} />
                  <span className="text-sm">Cambios sin guardar</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Guardado</span>
                </div>
              )}
            </div>

            {/* Save Button */}
            {onSave && (
              <Button
                onClick={onSave}
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  hasUnsavedChanges
                    ? 'bg-[#00365b] text-white hover:bg-[#fdb933] hover:text-[#00365b]'
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Guardar Lección
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Progress Section */}
          <div className="space-y-3 pt-2 border-t border-gray-200">
            <div className="text-center">
              <div className="text-lg font-semibold text-[#00365b] mb-2">35%</div>
              <div className="mx-auto w-3 h-24 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="w-full bg-gradient-to-t from-[#00365b] to-[#fdb933] transition-all duration-300 rounded-full"
                  style={{ height: '35%', marginTop: 'auto' }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-2">Progreso del curso</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2 pt-2 border-t border-gray-200">
            <Link
              href={`/admin/course-builder/${courseId}/${moduleId}`}
              className="block text-sm text-gray-600 hover:text-[#00365b] transition-colors text-center py-2"
            >
              ← Volver al Módulo
            </Link>
            
            <div className="text-xs text-gray-500 text-center">
              <div>Última modificación:</div>
              <div className="text-gray-700">Hace 2 minutos</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LessonBreadcrumb;