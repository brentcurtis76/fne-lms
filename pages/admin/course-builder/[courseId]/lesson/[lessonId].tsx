import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../../../../lib/supabase';
import { GetServerSideProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Block, BlockType, GroupAssignmentBlock, BibliographyBlock } from '@/types/blocks';
import { Database } from '@/types/supabase';
import { BLOCK_TYPES } from '@/config/blockTypes';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { Pencil, Save, Eye, ChevronLeft } from 'lucide-react';
import TextBlockEditor from '@/components/blocks/TextBlockEditor';
import VideoBlockEditor from '@/components/blocks/VideoBlockEditor';
import ImageBlockEditor from '@/components/blocks/ImageBlockEditor';
import QuizBlockEditor from '@/components/blocks/QuizBlockEditor';
import FileDownloadBlockEditor from '@/components/blocks/FileDownloadBlockEditor';
import ExternalLinkBlockEditor from '@/components/blocks/ExternalLinkBlockEditor';
import GroupAssignmentBlockEditor from '@/components/blocks/GroupAssignmentBlockEditor';
import BibliographyBlockEditor from '@/components/blocks/BibliographyBlockEditor';
import { metadataHasRole } from '@/utils/roleUtils';

type Lesson = Database['public']['Tables']['lessons']['Row'] & {
  blocks?: Block[];
};

interface SimpleLessonEditorProps {
  initialLessonData: Lesson;
  courseId: string;
  lessonIdString: string;
}

const SimpleLessonEditorPage: NextPage<SimpleLessonEditorProps> = ({ initialLessonData, courseId, lessonIdString }) => {
  const router = useRouter();
  
  console.log(`[SimpleLessonEditor] Initializing with lesson data:`, initialLessonData);
  console.log(`[SimpleLessonEditor] Initial blocks count:`, initialLessonData.blocks?.length || 0);
  
  const [lessonTitle, setLessonTitle] = useState(initialLessonData.title);
  const [blocks, setBlocks] = useState<Block[]>(initialLessonData.blocks || []);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(() => {
    if (initialLessonData.blocks && Array.isArray(initialLessonData.blocks)) {
      return new Set(initialLessonData.blocks
        .filter(block => block.id && block.is_visible === false)
        .map(block => block.id));
    }
    return new Set();
  });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  
  // For breadcrumbs
  const [courseTitle, setCourseTitle] = useState<string>('');
  
  // Logout handler
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Fetch user authentication state
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        
        // Check admin status
        const adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin');
        
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role_type')
          .eq('user_id', session.user.id)
          .eq('is_active', true);
        
        const adminFromDB = userRoles?.some(role => role.role_type === 'admin');
        setIsAdmin(adminInMetadata || adminFromDB || false);
        
        // Get avatar URL
        const { data: profileData } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', session.user.id)
          .single();
          
        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
      }
    };
    
    getUser();
  }, []);

  // Fetch course title for breadcrumbs
  useEffect(() => {
    const fetchCourseTitle = async () => {
      if (courseId) {
        const { data: courseData } = await supabase
          .from('courses')
          .select('title')
          .eq('id', courseId)
          .single();
        
        if (courseData) {
          setCourseTitle(courseData.title);
        }
      }
    };
    
    fetchCourseTitle();
  }, [courseId]);

  // Save handler
  const handleSave = async () => {
    setIsLoading(true);
    
    try {
      // Update lesson title
      const { error: titleError } = await supabase
        .from('lessons')
        .update({ title: lessonTitle })
        .eq('id', lessonIdString);
      
      if (titleError) throw titleError;
      
      // Delete existing blocks
      const { error: deleteError } = await supabase
        .from('blocks')
        .delete()
        .eq('lesson_id', lessonIdString);
      
      if (deleteError) throw deleteError;
      
      // Insert new blocks
      if (blocks.length > 0) {
        const blocksToInsert = blocks.map((block, index) => ({
          lesson_id: lessonIdString,
          type: block.type,
          payload: block.payload,
          position: index,
          is_visible: !collapsedBlocks.has(block.id)
        }));
        
        const { error: insertError } = await supabase
          .from('blocks')
          .insert(blocksToInsert);
        
        if (insertError) throw insertError;
      }
      
      toast.success('Lección guardada exitosamente');
      setHasUnsavedChanges(false);
    } catch (error: any) {
      console.error('Error saving lesson:', error);
      toast.error('Error al guardar la lección');
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate to preview
  const handlePreview = () => {
    router.push(`/student/lesson/${lessonIdString}`);
  };

  // Navigate back
  const handleBack = () => {
    if (hasUnsavedChanges) {
      if (confirm('Tienes cambios sin guardar. ¿Deseas salir de todos modos?')) {
        router.push(`/admin/course-builder/${courseId}`);
      }
    } else {
      router.push(`/admin/course-builder/${courseId}`);
    }
  };

  // Block management functions
  const addBlock = (type: BlockType) => {
    const newBlock: Block = {
      id: `block-${Date.now()}`,
      type,
      payload: getDefaultPayload(type),
      position: blocks.length
    } as Block;
    setBlocks([...blocks, newBlock]);
    setHasUnsavedChanges(true);
  };

  const getDefaultPayload = (type: BlockType): any => {
    switch (type) {
      case 'text':
        return { content: '' };
      case 'video':
        return { url: '', title: '' };
      case 'image':
        return { images: [] };
      case 'quiz':
        return {
          title: '',
          description: '',
          instructions: '',
          questions: [],
          totalPoints: 0,
          allowRetries: true,
          showResults: true,
          randomizeQuestions: false,
          randomizeAnswers: false,
        };
      case 'download':
        return { files: [], title: '', allowBulkDownload: false, requireAuth: false };
      case 'external-links':
        return {
          title: '',
          description: '',
          links: [],
          groupByCategory: false,
          showThumbnails: true,
          showDescriptions: true,
        };
      case 'group-assignment':
        return { title: '', description: '' };
      case 'bibliography':
        return { title: '', items: [], showCategories: false, sortBy: 'manual' as const };
      default:
        return {};
    }
  };

  const updateBlock = (id: string, payload: any) => {
    setBlocks(prev => prev.map(block =>
      block.id === id ? { ...block, payload } : block
    ));
    setHasUnsavedChanges(true);
  };

  // Merge a single field into a block's payload. Uses functional setState so
  // rapid successive field updates don't clobber each other.
  const updateBlockField = (id: string, field: string, value: any) => {
    setBlocks(prev => prev.map(block =>
      block.id === id
        ? { ...block, payload: { ...(block.payload as any), [field]: value } }
        : block
    ));
    setHasUnsavedChanges(true);
  };

  const deleteBlock = (id: string) => {
    setBlocks(blocks.filter(block => block.id !== id));
    setHasUnsavedChanges(true);
  };

  const toggleBlockCollapse = (id: string) => {
    const newCollapsed = new Set(collapsedBlocks);
    if (newCollapsed.has(id)) {
      newCollapsed.delete(id);
    } else {
      newCollapsed.add(id);
    }
    setCollapsedBlocks(newCollapsed);
    setHasUnsavedChanges(true);
  };

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      
      setBlocks(arrayMove(blocks, oldIndex, newIndex));
      setHasUnsavedChanges(true);
    }
  };

  // Block renderer component. Each block editor owns its own header/collapse/
  // delete/save chrome via BlockEditorWrapper, so SortableBlock only provides
  // the drag handle for reordering.
  const SortableBlock = ({ block, index }: { block: Block; index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({ id: block.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const isCollapsed = collapsedBlocks.has(block.id);

    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        className={`mb-2 ${activeBlockId === block.id ? 'ring-2 ring-brand_accent rounded-lg' : ''}`}
      >
        {/* Drag handle (reorder) */}
        <div
          {...listeners}
          className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
          title="Arrastrar para reordenar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>

        {block.type === 'text' && (
          <TextBlockEditor
            block={block as any}
            index={index}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleBlockCollapse(block.id)}
            onTitleChange={(newTitle) => updateBlockField(block.id, 'title', newTitle)}
            onContentChange={(newContent) => updateBlockField(block.id, 'content', newContent)}
            onSave={() => handleSave()}
            onDelete={() => deleteBlock(block.id)}
          />
        )}
        {block.type === 'video' && (
          <VideoBlockEditor
            block={block as any}
            onUpdate={(blockId, field, value) => updateBlockField(block.id, field, value)}
            onDelete={() => deleteBlock(block.id)}
            onSave={() => handleSave()}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleBlockCollapse(block.id)}
          />
        )}
        {block.type === 'image' && (
          <ImageBlockEditor
            block={block as any}
            onSave={() => handleSave()}
            onDelete={() => deleteBlock(block.id)}
            onUpdate={(blockId, field, value) => updateBlockField(block.id, field as string, value)}
            onUpload={(blockId, file) => { console.log('File upload not implemented yet:', file); }}
            onTitleChange={(blockId, title) => updateBlockField(block.id, 'title', title)}
            isCollapsed={isCollapsed}
            toggleCollapse={() => toggleBlockCollapse(block.id)}
          />
        )}
        {block.type === 'quiz' && (
          <QuizBlockEditor
            block={block as any}
            onUpdate={(blockId, field, value) => updateBlockField(block.id, field as string, value)}
            onTitleChange={(blockId, title) => updateBlockField(block.id, 'title', title)}
            onSave={() => handleSave()}
            onDelete={() => deleteBlock(block.id)}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleBlockCollapse(block.id)}
          />
        )}
        {block.type === 'download' && (
          <FileDownloadBlockEditor
            block={block as any}
            onUpdate={(blockId, field, value) => updateBlockField(block.id, field as string, value)}
            onTitleChange={(blockId, title) => updateBlockField(block.id, 'title', title)}
            onSave={() => handleSave()}
            onDelete={() => deleteBlock(block.id)}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleBlockCollapse(block.id)}
            courseId={courseId}
          />
        )}
        {block.type === 'external-links' && (
          <ExternalLinkBlockEditor
            block={block as any}
            onUpdate={(blockId, field, value) => updateBlockField(block.id, field as string, value)}
            onTitleChange={(blockId, title) => updateBlockField(block.id, 'title', title)}
            onSave={() => handleSave()}
            onDelete={() => deleteBlock(block.id)}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleBlockCollapse(block.id)}
          />
        )}
        {block.type === 'group-assignment' && (
          <GroupAssignmentBlockEditor
            block={block as GroupAssignmentBlock}
            onChange={(payload) => updateBlock(block.id, payload)}
            onDelete={() => deleteBlock(block.id)}
            mode="edit"
            courseId={courseId}
          />
        )}
        {block.type === 'bibliography' && (
          <BibliographyBlockEditor
            block={block as BibliographyBlock}
            onChange={(payload) => updateBlock(block.id, payload)}
            onDelete={() => deleteBlock(block.id)}
            mode="edit"
            courseId={courseId}
            onSave={() => handleSave()}
          />
        )}
      </div>
    );
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a] mx-auto mb-4"></div>
          <p className="text-[#0a0a0a] font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="courses"
      pageTitle={lessonTitle}
      breadcrumbs={[
        { label: 'Cursos', href: '/admin/course-builder' },
        { label: courseTitle, href: `/admin/course-builder/${courseId}` },
        { label: lessonTitle }
      ]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Pencil />}
        title={lessonTitle}
        subtitle="Editor de lección para curso simple"
        primaryAction={{
          label: 'Guardar',
          onClick: handleSave,
          icon: <Save className="w-4 h-4" />
        }}
        secondaryAction={{
          label: 'Vista Previa',
          onClick: handlePreview,
          icon: <Eye className="w-4 h-4" />
        }}
      >
        <button
          onClick={handleBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          Volver al Curso
        </button>
      </ResponsiveFunctionalPageHeader>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Lesson Title */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Título de la Lección
          </label>
          <input
            type="text"
            value={lessonTitle}
            onChange={(e) => {
              setLessonTitle(e.target.value);
              setHasUnsavedChanges(true);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-brand_accent focus:border-brand_accent"
          />
        </div>

        {/* Add Block Buttons */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Agregar Bloque</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(BLOCK_TYPES).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <button
                  key={key}
                  onClick={() => addBlock(key as BlockType)}
                  className="px-3 py-2 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  <Icon className="w-4 h-4 inline mr-1" /> {config.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Blocks List */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.length > 0 ? (
              blocks.map((block, index) => (
                <SortableBlock key={block.id} block={block} index={index} />
              ))
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <p className="text-gray-500">No hay bloques aún. Agrega bloques usando los botones de arriba.</p>
              </div>
            )}
          </SortableContext>
        </DndContext>

        {/* Save Indicator */}
        {hasUnsavedChanges && (
          <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded-md shadow-lg">
            Tienes cambios sin guardar
          </div>
        )}
      </div>
    </MainLayout>
  );
};

// Server-side props
export const getServerSideProps: GetServerSideProps = async (context) => {
  const { courseId, lessonId } = context.params!;
  
  const supabase = createPagesServerClient(context);
  
  // Fetch lesson data
  const { data: lessonData, error: lessonError } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId as string)
    .single();
  
  if (lessonError || !lessonData) {
    return {
      notFound: true,
    };
  }
  
  // Fetch blocks
  const { data: blocksData } = await supabase
    .from('blocks')
    .select('*')
    .eq('lesson_id', lessonId as string)
    .order('position');
  
  // Transform blocks data
  const blocks = blocksData?.map(block => ({
    id: block.id,
    type: block.type,
    payload: block.payload,
    position: block.position,
    is_visible: block.is_visible
  })) || [];
  
  return {
    props: {
      initialLessonData: {
        ...lessonData,
        blocks
      },
      courseId: courseId as string,
      lessonIdString: lessonId as string
    },
  };
};

export default SimpleLessonEditorPage;
