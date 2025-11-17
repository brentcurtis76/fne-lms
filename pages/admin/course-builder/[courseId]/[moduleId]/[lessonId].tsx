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
import { Block, TextBlockPayload, VideoBlockPayload, ImageBlockPayload, QuizBlockPayload, DownloadBlockPayload, ExternalLinksBlockPayload, GroupAssignmentBlockPayload, GroupAssignmentBlock, BibliographyBlockPayload, BibliographyBlock } from '@/types/blocks';
import { Database } from '@/types/supabase';
import { BLOCK_TYPES, getBlockConfig, getBlockSubtitle } from '@/config/blockTypes';
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

interface LessonEditorProps {
  initialLessonData: Lesson;
  courseId: string;
  moduleId: string;
  lessonIdString: string;
}

const LessonEditorPage: NextPage<LessonEditorProps> = ({ initialLessonData, courseId, moduleId, lessonIdString }) => {
  const router = useRouter();
  
  console.log(`[LessonEditor] Initializing with lesson data:`, initialLessonData);
  console.log(`[LessonEditor] Initial blocks count:`, initialLessonData.blocks?.length || 0);
  console.log(`[LessonEditor] Initial blocks:`, initialLessonData.blocks);
  
  const [lessonTitle, setLessonTitle] = useState(initialLessonData.title);
  const [blocks, setBlocks] = useState<Block[]>(initialLessonData.blocks || []);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(() => {
    if (initialLessonData.blocks && Array.isArray(initialLessonData.blocks)) {
      // Initialize collapsed state based on is_visible field from database
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
  const [moduleTitle, setModuleTitle] = useState<string>('');
  
  // Logout handler
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Fetch user authentication state and refetch blocks if needed
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        
        // Check admin status from both metadata and user_roles table
        const adminInMetadata = metadataHasRole(session.user?.user_metadata, 'admin');
        
        // Check user_roles table for admin role
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('role_type')
          .eq('user_id', session.user.id)
          .eq('is_active', true);
        
        const hasAdminRoleInDB = userRoles?.some(role => role.role_type === 'admin') || false;
        const isAdminUser = adminInMetadata || hasAdminRoleInDB;
        setIsAdmin(isAdminUser);
        
        // Fetch avatar URL
        const { data: profileData } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', session.user.id)
          .single();
          
        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
        
        // Fetch course and module titles for breadcrumbs
        const { data: courseData } = await supabase
          .from('courses')
          .select('title')
          .eq('id', courseId)
          .single();
          
        if (courseData) {
          setCourseTitle(courseData.title);
        }
        
        const { data: moduleData } = await supabase
          .from('modules')
          .select('title')
          .eq('id', moduleId)
          .single();
          
        if (moduleData) {
          setModuleTitle(moduleData.title);
        }
        
        // If no blocks were loaded initially, try to refetch them client-side
        if (!initialLessonData.blocks || initialLessonData.blocks.length === 0) {
          console.log(`[LessonEditor] No blocks found initially, refetching client-side...`);
          const { data: blocksData, error: blocksError } = await supabase
            .from('blocks')
            .select('*')
            .eq('lesson_id', lessonIdString)
            .order('position', { ascending: true });
            
          if (blocksError) {
            console.error('Error refetching blocks:', blocksError);
          } else {
            console.log(`[LessonEditor] Client-side refetch found ${blocksData?.length || 0} blocks:`, blocksData);
            if (blocksData && blocksData.length > 0) {
              const parsedBlocks = blocksData.map(block => {
                // Log group-assignment blocks to debug resource loading
                if (block.type === 'group-assignment' && block.payload) {
                  console.log('📥 Loading group-assignment block from DB:', {
                    blockId: block.id,
                    payload: block.payload,
                    resourceCount: block.payload.resources?.length || 0,
                    resources: block.payload.resources
                  });
                }
                return {
                  ...block,
                  payload: block.payload
                };
              }) as Block[];
              setBlocks(parsedBlocks);
            }
          }
        }
      }
    };
    getUser();
  }, []); // Empty dependency array to run only once

  const handleSave = useCallback(async () => {
    setIsLoading(true);
    const lessonId = lessonIdString;
    if (!lessonId) {
      toast.error('Invalid Lesson ID.');
      setIsLoading(false);
      return;
    }

    try {
      // Validate quiz blocks before saving
      for (const block of blocks) {
        if (block.type === 'quiz') {
          if (!block.payload.questions || block.payload.questions.length === 0) {
            toast.error('Los bloques de quiz deben tener al menos una pregunta');
            setIsLoading(false);
            return;
          }
          
          // Validate each question
          for (const question of block.payload.questions) {
            if (!question.question || question.question.trim() === '') {
              toast.error('Todas las preguntas del quiz deben tener texto');
              setIsLoading(false);
              return;
            }
            
            // For non-open-ended questions, ensure at least one correct answer
            if (question.type !== 'open-ended' && question.options) {
              const hasCorrectAnswer = question.options.some(opt => opt.isCorrect);
              if (!hasCorrectAnswer) {
                toast.error(`La pregunta "${question.question}" debe tener al menos una respuesta correcta`);
                setIsLoading(false);
                return;
              }
            }
          }
        }
      }

      const updatedLesson = {
        title: lessonTitle,
        module_id: initialLessonData.module_id,
      };

      const { error: lessonError } = await supabase
        .from('lessons')
        .update(updatedLesson)
        .eq('id', lessonId);

      if (lessonError) {
        toast.error(`Failed to save lesson: ${lessonError.message}`);
        setIsLoading(false);
        return;
      }

      // CRITICAL: Log the blocks array state at save time
      console.log('🎯 BLOCKS STATE AT SAVE TIME:', {
        bibliographyBlocks: blocks
          .filter(b => b.type === 'bibliography')
          .map(b => ({
            id: b.id,
            items: b.payload.items.map(item => ({
              id: item.id,
              type: item.type,
              title: item.title,
              hasUrl: !!item.url,
              hasFilename: !!item.filename,
              hasFilesize: !!item.filesize
            }))
          })),
        timestamp: new Date().toISOString()
      });
      
      const blockPromises = blocks.map(async (block, index) => {
        const cleanBlock = { ...block };
        
        // Special handling for quiz blocks to ensure proper payload structure
        let payload = block.payload;
        if (block.type === 'quiz' && 'questions' in payload) {
          const quizPayload = payload as QuizBlockPayload;
          // Ensure all questions have proper structure
          payload = {
            ...quizPayload,
            questions: quizPayload.questions.map((q: any) => ({
              ...q,
              // Ensure options is always an array (empty for open-ended questions)
              options: q.options || [],
              // Ensure required fields have defaults
              points: q.points || 1,
              type: q.type || 'multiple-choice'
            }))
          };
        }
        
        // Special handling for group-assignment blocks to ensure resources are preserved
        if (block.type === 'group-assignment' && payload) {
          const groupPayload = payload as GroupAssignmentBlockPayload;
          // Ensure resources array is properly preserved with all fields
          payload = {
            title: groupPayload.title || '',
            description: groupPayload.description || '',
            instructions: groupPayload.instructions || '',
            resources: groupPayload.resources?.map(resource => ({
              id: resource.id,
              type: resource.type,
              title: resource.title || '',
              url: resource.url || '',
              description: resource.description || ''
            })) || []
          };
          
          console.log('💾 Saving group-assignment block:', {
            blockId: block.id,
            resourceCount: groupPayload.resources?.length || 0,
            resources: groupPayload.resources?.map(r => ({ 
              id: r.id, 
              type: r.type, 
              title: r.title,
              hasUrl: !!r.url,
              urlLength: r.url?.length 
            })),
            timestamp: new Date().toISOString()
          });
        }
        
        // Log bibliography blocks specifically
        if (block.type === 'bibliography') {
          console.log('💾 Saving bibliography block:', {
            blockId: block.id,
            payload: JSON.stringify(payload, null, 2),
            timestamp: new Date().toISOString()
          });
        }
        
        const blockDataToSave = {
          ...cleanBlock,
          course_id: courseId,
          lesson_id: lessonIdString,
          position: index,
          payload: payload,
          is_visible: !collapsedBlocks.has(block.id), // Save visibility state
        };

        if (block.id.startsWith('new-')) { 
          const { id, ...insertData } = blockDataToSave;
          return supabase.from('blocks').insert(insertData).select().single();
        } else { 
          // CRITICAL LOGGING: What exactly are we sending to the database?
          if (block.type === 'bibliography' && 'items' in blockDataToSave.payload) {
            console.log('🚀 SENDING TO DATABASE:', {
              blockId: block.id,
              payloadItems: blockDataToSave.payload.items.map((item: any) => ({
                id: item.id,
                type: item.type,
                title: item.title,
                url: item.url ? 'HAS URL' : 'NO URL',
                filename: item.filename || 'NO FILENAME',
                filesize: item.filesize || 'NO FILESIZE'
              })),
              timestamp: new Date().toISOString()
            });
          }
          return supabase.from('blocks').update(blockDataToSave).eq('id', block.id).select().single();
        }
      });

      try {
        const results = await Promise.all(blockPromises);
        const newBlocks: Block[] = [];
        let saveError = false;

        results.forEach((result, idx) => {
          if (result.error) {
            const blockType = blocks[idx]?.type || 'unknown';
            console.error(`Error saving ${blockType} block:`, result.error);
            console.error('Block payload:', blocks[idx]?.payload);
            toast.error(`Failed to save ${blockType} block: ${result.error.message}`);
            saveError = true;
          }
          if (result.data) {
            const savedBlock = result.data as unknown as Block;
            newBlocks.push(savedBlock);
          }
        });

        if (!saveError) {
          // CRITICAL FIX: Preserve local state completely
          // The database response might not include all JSONB fields
          const mergedBlocks = blocks.map((localBlock, index) => {
            const savedBlock = newBlocks[index];
            
            // Log what we're dealing with
            if (localBlock.type === 'bibliography') {
              console.log('🔄 Merging bibliography block:', {
                localId: localBlock.id,
                savedId: savedBlock?.id,
                localPayload: JSON.stringify(localBlock.payload, null, 2),
                savedPayload: savedBlock ? JSON.stringify(savedBlock.payload, null, 2) : 'N/A'
              });
            }
            
            // Log group-assignment blocks to debug resource persistence
            if (localBlock.type === 'group-assignment') {
              const localPayload = localBlock.payload as GroupAssignmentBlockPayload;
              const savedPayload = savedBlock?.payload as GroupAssignmentBlockPayload | undefined;
              console.log('🔄 Merging group-assignment block:', {
                localId: localBlock.id,
                savedId: savedBlock?.id,
                localResourceCount: localPayload.resources?.length || 0,
                savedResourceCount: savedPayload?.resources?.length || 0,
                localResources: localPayload.resources?.map(r => ({ 
                  id: r.id, 
                  type: r.type, 
                  title: r.title,
                  hasUrl: !!r.url 
                })),
                savedResources: savedPayload?.resources?.map(r => ({ 
                  id: r.id, 
                  type: r.type, 
                  title: r.title,
                  hasUrl: !!r.url 
                }))
              });
            }
            
            if (savedBlock && localBlock.id.startsWith('new-')) {
              // For new blocks, use the database ID but keep our local payload
              return {
                ...localBlock,
                id: savedBlock.id,
                // Ensure we keep the local payload with all fields
                payload: localBlock.payload
              };
            }
            
            // For existing blocks, ALWAYS keep our local state
            // The database might not return all JSONB subfields
            return localBlock;
          });
          
          console.log('✅ Blocks merged after save, special blocks:', {
            bibliography: mergedBlocks
              .filter(b => b.type === 'bibliography')
              .map(b => ({
                id: b.id,
                itemsWithFiles: ('items' in b.payload) ? (b.payload.items?.filter((i: any) => i.filename).length || 0) : 0
              })),
            groupAssignment: mergedBlocks
              .filter(b => b.type === 'group-assignment')
              .map(b => {
                const payload = b.payload as GroupAssignmentBlockPayload;
                return {
                  id: b.id,
                  resourceCount: payload.resources?.length || 0,
                  documentsWithUrls: payload.resources?.filter(r => r.type === 'document' && r.url).length || 0
                };
              })
          });
          
          setBlocks(mergedBlocks);
          
          // V2 Implementation: Group assignments are now stored directly in lesson blocks
          // No need to create separate assignment templates
          // The groupAssignmentsV2Service will read assignments directly from lesson content
          
          setHasUnsavedChanges(false);
          toast.success('Lesson saved successfully!');
        }
      } catch (error) {
        console.error('Error in Promise.all for blocks:', error);
        toast.error('An unexpected error occurred while saving blocks.');
      }

    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save lesson. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [lessonIdString, lessonTitle, blocks, courseId, supabase]);

  const handleAddBlock = (type: 'text' | 'video' | 'image' | 'quiz' | 'download' | 'external-links' | 'group-assignment' | 'bibliography') => {
    let payload: any;
    switch (type) {
      case 'text':
        payload = { content: '' } as TextBlockPayload; 
        break;
      case 'video':
        payload = { url: '', caption: '' } as VideoBlockPayload;
        break;
      case 'image':
        payload = { src: '', caption: '', alt: '' } as ImageBlockPayload;
        break;
      case 'quiz':
        payload = {
          title: '',
          description: '',
          instructions: '',
          questions: [],
          totalPoints: 0,
          allowRetries: true,
          showResults: true,
          randomizeQuestions: false,
          randomizeAnswers: false,
        } as QuizBlockPayload;
        break;
      case 'download':
        payload = {
          title: '',
          description: '',
          files: [],
          allowBulkDownload: false,
          requireAuth: false,
        } as DownloadBlockPayload;
        break;
      case 'external-links':
        payload = {
          title: '',
          description: '',
          links: [],
          groupByCategory: false,
          showThumbnails: true,
          showDescriptions: true,
        } as ExternalLinksBlockPayload;
        break;
      case 'group-assignment':
        payload = {
          title: '',
          description: '',
          instructions: ''
        } as GroupAssignmentBlockPayload;
        break;
      case 'bibliography':
        payload = {
          title: 'Bibliografía & Recursos',
          description: '',
          items: [],
          showCategories: false,
          sortBy: 'manual'
        } as BibliographyBlockPayload;
        break;
    }
    const newBlockId = `new-${Date.now()}`;
    const newBlock: Block = {
      id: newBlockId,
      type,
      payload,
      course_id: courseId,
      position: blocks.length,
    };
    setBlocks(prevBlocks => [...prevBlocks, newBlock]);
    
    // Ensure new blocks start expanded (not collapsed)
    setCollapsedBlocks(prev => {
      const newSet = new Set(prev);
      newSet.delete(newBlockId);
      return newSet;
    });
    
    // Set the new block as active and scroll to it
    setActiveBlockId(newBlockId);
    setHasUnsavedChanges(true);
    
    // Scroll to the new block after a short delay to ensure it's rendered
    setTimeout(() => {
      const blockElement = document.getElementById(`block-${newBlockId}`);
      if (blockElement) {
        blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100); 
  };

  const handleDeleteBlock = async (blockId: string) => {
    const originalBlocks = [...blocks];
    const blockToDelete = originalBlocks.find(b => b.id === blockId);
    
    if (!blockToDelete) return;
    
    // Show confirmation dialog
    const confirmDelete = window.confirm('¿Estás seguro de que deseas eliminar este bloque? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;
    
    // Remove block from UI immediately
    const remainingBlocks = originalBlocks.filter(b => b.id !== blockId);
    setBlocks(remainingBlocks);

    try {
      // If it's a saved block (not a new one), delete from database
      if (!blockToDelete.id.startsWith('new-')) { 
        console.log(`[DeleteBlock] Deleting block ${blockId} from database...`);
        
        // First, verify the block exists in the database
        const { data: existingBlock, error: checkError } = await supabase
          .from('blocks')
          .select('id')
          .eq('id', blockId)
          .single();
          
        if (checkError && checkError.code !== 'PGRST116') {
          console.error('[DeleteBlock] Error checking block existence:', checkError);
          throw checkError;
        }
        
        if (!existingBlock) {
          console.log('[DeleteBlock] Block not found in database, skipping deletion');
          toast.success('Bloque eliminado exitosamente.');
          setHasUnsavedChanges(true);
          return;
        }
        
        // Delete the block
        const { error: deleteError } = await supabase
          .from('blocks')
          .delete()
          .eq('id', blockId);
          
        if (deleteError) {
          console.error('[DeleteBlock] Error deleting block:', deleteError);
          throw deleteError;
        }
        
        console.log(`[DeleteBlock] Successfully deleted block ${blockId}`);
        
        // Verify deletion
        const { data: verifyBlock, error: verifyError } = await supabase
          .from('blocks')
          .select('id')
          .eq('id', blockId)
          .single();
          
        if (verifyBlock) {
          console.error('[DeleteBlock] Block still exists after deletion!');
          throw new Error('El bloque no se eliminó correctamente de la base de datos');
        }
        
        // Update positions for remaining blocks
        const positionUpdates = remainingBlocks.map((block, index) => ({
          id: block.id,
          position: index,
          lesson_id: lessonIdString
        }));
        
        // Update positions in database for existing blocks
        for (const update of positionUpdates) {
          if (!update.id.startsWith('new-')) {
            const { error: updateError } = await supabase
              .from('blocks')
              .update({ position: update.position })
              .eq('id', update.id);
              
            if (updateError) {
              console.error(`[DeleteBlock] Error updating position for block ${update.id}:`, updateError);
            }
          }
        }
      }
      
      // Remove from collapsed blocks set if it was there
      setCollapsedBlocks(prev => {
        const newSet = new Set(prev);
        newSet.delete(blockId);
        return newSet;
      });
      
      toast.success('Bloque eliminado exitosamente.');
      setHasUnsavedChanges(true); // Mark as having changes to prompt save
      
    } catch (error: any) {
      console.error('[DeleteBlock] Error in deletion process:', error);
      toast.error(`Error al eliminar el bloque: ${error.message}`);
      // Restore original blocks on error
      setBlocks(originalBlocks);
    }
  };

  const handleBlockPayloadChange = useCallback((blockId: string, payloadChange: any) => {
    setBlocks(prevBlocks =>
      prevBlocks.map(b =>
        b.id === blockId
          ? { ...b, payload: { ...b.payload, ...payloadChange } }
          : b
      ) as Block[]
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleTitleChange = useCallback((blockId: string, newTitle: string) => {
    setBlocks(prevBlocks =>
      prevBlocks.map(b =>
        b.id === blockId
          ? { ...b, payload: { ...b.payload, title: newTitle } }
          : b
      ) as Block[]
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleContentChange = (blockId: string, newContent: any) => {
    handleBlockPayloadChange(blockId, { content: newContent });
  };

  const toggleBlockCollapse = (blockId: string) => {
    setCollapsedBlocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(blockId)) {
        newSet.delete(blockId);
      } else {
        newSet.add(blockId);
      }
      return newSet;
    });
    
    // Update the block's visibility in the blocks array
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === blockId 
          ? { ...block, is_visible: collapsedBlocks.has(blockId) }
          : block
      )
    );
    
    // Mark as having unsaved changes
    setHasUnsavedChanges(true);
  };

  const moveBlockUp = (index: number) => {
    if (index > 0) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index - 1]] = [newBlocks[index - 1], newBlocks[index]];
      setBlocks(newBlocks);
      setHasUnsavedChanges(true);
    }
  };

  const moveBlockDown = (index: number) => {
    if (index < blocks.length - 1) {
      const newBlocks = [...blocks];
      [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
      setBlocks(newBlocks);
      setHasUnsavedChanges(true);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = blocks.findIndex(block => block.id === active.id);
      const newIndex = blocks.findIndex(block => block.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        setBlocks(arrayMove(blocks, oldIndex, newIndex));
        setHasUnsavedChanges(true);
        
        toast.success('Orden de bloques actualizado');
      }
    }
  };

  // Sortable Item Component
  const SortableTimelineItem = ({ block, index }: { block: Block; index: number }) => {
  const supabase = useSupabaseClient();
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: block.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`border rounded-lg p-3 transition-all ${
          isDragging
            ? 'shadow-2xl bg-white border-[#00365b] z-50 rotate-2 scale-105'
            : activeBlockId === block.id 
              ? 'border-[#00365b] bg-blue-50 shadow-md' 
              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
        } cursor-pointer`}
        onClick={() => {
          if (!isDragging) {
            setActiveBlockId(block.id);
            const blockElement = document.getElementById(`block-${block.id}`);
            if (blockElement) {
              blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }}
      >
        <div className="flex items-center gap-3">
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none p-2 -m-2 hover:bg-gray-50 rounded-md transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-semibold text-gray-600">
                {index + 1}
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
            </div>
          </div>
          
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 truncate">
                {block.payload?.title || getBlockConfig(block.type).label}
              </span>
            </div>
            <p className="text-xs text-gray-600 truncate">
              {getBlockSubtitle(block)}
            </p>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleBlockCollapse(block.id);
            }}
            className="flex-shrink-0 p-1 hover:bg-gray-100 rounded text-xs"
          >
            {collapsedBlocks.has(block.id) ? (
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-[#00365b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  };

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
        icon={<Pencil />}
        title={`Editor de Lección: ${lessonTitle}`}
        subtitle={`${courseTitle} > ${moduleTitle}`}
        primaryAction={{
          label: hasUnsavedChanges ? 'Guardar Cambios' : 'Guardado',
          onClick: handleSave,
          icon: <Save className="w-4 h-4" />
        }}
      >
        <button
          onClick={() => router.push(`/admin/course-builder/${courseId}/${moduleId}`)}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00365b]"
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          Volver al Módulo
        </button>
        <button
          onClick={async () => {
            if (hasUnsavedChanges) {
              await handleSave();
              setTimeout(() => {
                window.open(`/student/lesson/${lessonIdString}`, '_blank');
              }, 500);
            } else {
              window.open(`/student/lesson/${lessonIdString}`, '_blank');
            }
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-[#fdb933] rounded-md hover:bg-[#e5a52e] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#fdb933]"
        >
          <Eye className="w-4 h-4 inline mr-1" />
          Vista Previa
        </button>
      </ResponsiveFunctionalPageHeader>
      
      <div className="px-4 py-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Simple Timeline Sidebar - NO DnD */}
          <div className="lg:col-span-1">
            <div className="bg-white border-2 border-gray-100 rounded-xl shadow-lg p-6 sticky top-40">
              <div className="flex flex-col items-center gap-3 mb-6">
                <div className="w-4 h-4 bg-gradient-to-r from-[#00365b] to-[#fdb933] rounded-full shadow-sm"></div>
                <h3 className="text-xl font-bold text-[#00365b] text-center">
                  Estructura de la Lección
                </h3>
                <div className="bg-gradient-to-r from-[#00365b] to-[#fdb933] text-white px-4 py-2 rounded-full text-sm font-medium shadow-md">
                  {blocks.length} bloque{blocks.length !== 1 ? 's' : ''}
                </div>
              </div>
              
              {blocks.length > 0 && (
                <div className="text-center mb-4">
                  <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                    Arrastra los bloques para reordenar
                  </p>
                </div>
              )}
              
              {blocks.length === 0 ? (
                <div className="text-center py-8">
                  <div className="bg-gray-100 rounded-2xl p-6 mb-4">
                    <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">
                    ¡Comienza a crear!
                  </h4>
                  <p className="text-xs text-gray-500">
                    Agrega bloques para estructurar tu lección
                  </p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={blocks.map(block => block.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {blocks.map((block, index) => (
                        <SortableTimelineItem
                          key={block.id}
                          block={block}
                          index={index}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              
              {/* Navigation */}
              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => router.back()}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  ← Volver al Curso
                </button>
              </div>
            </div>
          </div>
          
          {/* Main Editor */}
          <div className="lg:col-span-3">
            <div className="bg-white p-8 rounded-lg shadow-lg">
            
            {/* Header */}
            {hasUnsavedChanges && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 text-amber-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm font-medium">Hay cambios sin guardar</span>
                </div>
              </div>
            )}

            {/* Lesson Title */}
            <div className="mb-6">
              <label htmlFor="lessonTitle" className="block text-sm font-medium text-gray-700 mb-1">
                Título de la Lección
              </label>
              <input
                type="text"
                id="lessonTitle"
                value={lessonTitle}
                onChange={(e) => {
                  setLessonTitle(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                placeholder="Enter lesson title"
                className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-[#00365b] focus:border-[#00365b]"
              />
            </div>

            {/* Lesson Blocks */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 text-[#00365b]">Bloques de la Lección</h2>
              
              {blocks.length === 0 ? (
                <div className="text-center py-12 px-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-600 mb-2">No hay bloques en esta lección</h3>
                  <p className="text-sm text-gray-500">Agrega contenido usando los botones de abajo</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {blocks.map((block, index) => (
                    <div 
                      key={block.id} 
                      id={`block-${block.id}`}
                      className={`relative border rounded-lg shadow-sm transition-all ${
                        activeBlockId === block.id 
                          ? 'border-[#00365b] bg-blue-50' 
                          : 'border-gray-200 bg-white'
                      }`}
                      onClick={() => setActiveBlockId(block.id)}
                    >
                      {/* Block Controls */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBlockUp(index);
                          }}
                          disabled={index === 0}
                          className="p-1 bg-white border border-gray-200 rounded text-gray-400 hover:text-[#00365b] disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Mover arriba"
                        >
                          ↑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveBlockDown(index);
                          }}
                          disabled={index === blocks.length - 1}
                          className="p-1 bg-white border border-gray-200 rounded text-gray-400 hover:text-[#00365b] disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Mover abajo"
                        >
                          ↓
                        </button>
                      </div>

                      {/* Block Content */}
                      <div className="p-4">
                        {block.type === 'text' && (
                          <TextBlockEditor
                            block={block as any}
                            index={index}
                            isCollapsed={collapsedBlocks.has(block.id)}
                            onToggleCollapse={() => toggleBlockCollapse(block.id)}
                            onTitleChange={(newTitle) => handleTitleChange(block.id, newTitle)}
                            onContentChange={(newContent) => handleContentChange(block.id, newContent)}
                            onSave={() => handleSave()}
                            onDelete={() => handleDeleteBlock(block.id)}
                          />
                        )}
                        {block.type === 'video' && (
                          <VideoBlockEditor
                            block={block as any}
                            onUpdate={(blockId, field, value) => {
                              if (field === 'title') {
                                handleTitleChange(blockId, value);
                              } else {
                                handleBlockPayloadChange(blockId, { [field]: value });
                              }
                            }}
                            onDelete={handleDeleteBlock}
                            onSave={() => handleSave()}
                            isCollapsed={collapsedBlocks.has(block.id)}
                            onToggleCollapse={() => toggleBlockCollapse(block.id)}
                          />
                        )}
                        {block.type === 'image' && (
                          <ImageBlockEditor
                            block={block as any}
                            onSave={() => handleSave()}
                            onDelete={handleDeleteBlock}
                            onUpdate={(blockId, field, value) => {
                              handleBlockPayloadChange(blockId, { [field]: value });
                            }}
                            onUpload={(blockId, file) => {
                              console.log('File upload not implemented yet:', file);
                            }}
                            onTitleChange={(blockId, title) => handleTitleChange(blockId, title)}
                            isCollapsed={collapsedBlocks.has(block.id)}
                            toggleCollapse={() => toggleBlockCollapse(block.id)}
                          />
                        )}
                        {block.type === 'quiz' && (
                          <QuizBlockEditor
                            block={block as any}
                            onUpdate={(blockId, field, value) => {
                              handleBlockPayloadChange(blockId, { [field]: value });
                            }}
                            onTitleChange={(blockId, title) => handleTitleChange(blockId, title)}
                            onSave={() => handleSave()}
                            onDelete={handleDeleteBlock}
                            isCollapsed={collapsedBlocks.has(block.id)}
                            onToggleCollapse={() => toggleBlockCollapse(block.id)}
                          />
                        )}
                        {block.type === 'download' && (
                          <FileDownloadBlockEditor
                            block={block as any}
                            onUpdate={(blockId, field, value) => {
                              handleBlockPayloadChange(blockId, { [field]: value });
                            }}
                            onTitleChange={(blockId, title) => handleTitleChange(blockId, title)}
                            onSave={() => handleSave()}
                            onDelete={handleDeleteBlock}
                            isCollapsed={collapsedBlocks.has(block.id)}
                            onToggleCollapse={() => toggleBlockCollapse(block.id)}
                            courseId={courseId}
                          />
                        )}
                        {block.type === 'external-links' && (
                          <ExternalLinkBlockEditor
                            block={block as any}
                            onUpdate={(blockId, field, value) => {
                              handleBlockPayloadChange(blockId, { [field]: value });
                            }}
                            onTitleChange={(blockId, title) => handleTitleChange(blockId, title)}
                            onSave={() => handleSave()}
                            onDelete={handleDeleteBlock}
                            isCollapsed={collapsedBlocks.has(block.id)}
                            onToggleCollapse={() => toggleBlockCollapse(block.id)}
                          />
                        )}
                        {block.type === 'group-assignment' && (
                          <GroupAssignmentBlockEditor
                            block={block as GroupAssignmentBlock}
                            onChange={(payload) => {
                              setBlocks(blocks.map(b => 
                                b.id === block.id ? { ...b, payload } : b
                              ) as Block[]);
                              setHasUnsavedChanges(true);
                            }}
                            onDelete={() => handleDeleteBlock(block.id)}
                            mode={collapsedBlocks.has(block.id) ? 'preview' : 'edit'}
                            courseId={courseId}
                          />
                        )}
                        {block.type === 'bibliography' && (
                          <BibliographyBlockEditor
                            block={block as BibliographyBlock}
                            onChange={(payload) => {
                              console.log('📚 Bibliography onChange in parent:', {
                                blockId: block.id,
                                payloadItemsAnalysis: payload.items?.map(item => ({
                                  id: item.id,
                                  type: item.type,
                                  title: item.title,
                                  url: item.url ? `YES (${item.url.substring(0, 50)}...)` : 'NO',
                                  filename: item.filename || 'MISSING',
                                  filesize: item.filesize || 'MISSING'
                                })),
                                timestamp: new Date().toISOString()
                              });
                              
                              // Use functional setState to ensure we're working with latest state
                              setBlocks(prevBlocks => {
                                console.log('📊 setState called with prevBlocks');
                                const newBlocks = prevBlocks.map(b => 
                                  b.id === block.id ? { ...b, payload } : b
                                ) as Block[];
                                
                                // Verify the update worked
                                const updatedBlock = newBlocks.find(b => b.id === block.id);
                                if (updatedBlock?.type === 'bibliography') {
                                  console.log('✅ Block updated in state:', {
                                    blockId: updatedBlock.id,
                                    itemsWithFiles: updatedBlock.payload.items?.filter(i => i.filename).length || 0
                                  });
                                }
                                
                                return newBlocks;
                              });
                              setHasUnsavedChanges(true);
                            }}
                            onDelete={() => handleDeleteBlock(block.id)}
                            mode={collapsedBlocks.has(block.id) ? 'preview' : 'edit'}
                            courseId={courseId}
                            onSave={handleSave}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Block Buttons */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-[#00365b] mb-4">Agregar Nuevo Bloque</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.values(BLOCK_TYPES).map((blockConfig) => {
                  // Clean up the button labels
                  const cleanLabel = blockConfig.label
                    .replace('Bloque de ', '')
                    .replace('Galería de ', '')
                    .replace('Evaluación ', '')
                    .replace('Archivos para ', '');
                  
                  return (
                    <button
                      key={blockConfig.type}
                      onClick={() => handleAddBlock(blockConfig.type as any)}
                      className="group relative bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-[#00365b] hover:shadow-lg transition-all duration-200 text-left min-h-[120px] flex flex-col justify-between"
                    >
                      <div>
                        <h4 className="font-semibold text-[#00365b] group-hover:text-[#00365b] mb-2 text-lg">
                          {cleanLabel}
                        </h4>
                        <p className="text-sm text-gray-600 group-hover:text-gray-700 leading-relaxed">
                          {blockConfig.description}
                        </p>
                      </div>
                      
                      {/* Add indicator */}
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-xs font-medium text-gray-400 group-hover:text-[#00365b] uppercase tracking-wide">
                          {blockConfig.category === 'content' && 'Contenido'}
                          {blockConfig.category === 'media' && 'Multimedia'}
                          {blockConfig.category === 'interactive' && 'Interactivo'}
                          {blockConfig.category === 'resources' && 'Recursos'}
                        </span>
                        <div className="w-6 h-6 rounded-full bg-gray-100 group-hover:bg-[#00365b] flex items-center justify-center transition-colors">
                          <svg className="w-3 h-3 text-gray-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { courseId, moduleId, lessonId } = context.params as { courseId: string; moduleId: string; lessonId: string };
  
  const supabase = createPagesServerClient(context);

  const { data: lessonResponse, error: lessonError } = await supabase
    .from('lessons')
    .select('*') 
    .eq('id', lessonId)
    .single();

  if (lessonError || !lessonResponse) {
    console.error('Error fetching lesson:', lessonError?.message);
    return { notFound: true };
  }

  const { data: blocks, error: blocksError } = await supabase
    .from('blocks')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true });

  if (blocksError) {
    console.error('Error fetching blocks:', blocksError?.message);
  }
  
  console.log(`[GetServerSideProps] Fetching blocks for lesson ID: ${lessonId}`);
  console.log(`[GetServerSideProps] Blocks found:`, blocks?.length || 0);
  console.log(`[GetServerSideProps] Blocks data:`, blocks);

  const parsedBlocks = (blocks || []).map(block => {
    // Log group-assignment blocks during initial load
    if (block.type === 'group-assignment' && block.payload) {
      console.log('[GetServerSideProps] Group-assignment block:', {
        blockId: block.id,
        payload: JSON.stringify(block.payload),
        resourceCount: block.payload.resources?.length || 0
      });
    }
    return {
      ...block,
      payload: block.payload
    };
  }).sort((a, b) => (a.position || 0) - (b.position || 0)) as Block[];

  const initialLessonData: Lesson = {
    ...lessonResponse,
    blocks: parsedBlocks,
  };

  return {
    props: {
      initialLessonData,
      courseId,
      moduleId,
      lessonIdString: lessonId, 
    },
  };
}; 

export default LessonEditorPage;
