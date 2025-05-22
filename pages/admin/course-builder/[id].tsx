import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import TimelineEditor from '../../../components/TimelineEditor';
import { toast } from 'react-hot-toast';
import { GetServerSideProps } from 'next'; // Import GetServerSideProps
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'; // Import createPagesServerClient
import { Block, TextBlock, ImageBlock, VideoBlock, DownloadBlock, ExternalLinksBlock, QuizBlock } from '../../../types/blocks'; // Added block type imports
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose, // Import DialogClose for the cancel button behavior
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button"; // Import Button for dialog actions
import dynamic from 'next/dynamic'; // Import dynamic
import BlockActionButtons from '../../../components/BlockActionButtons'; // Import BlockActionButtons component
import BlockTitleWithActions from '../../../components/BlockTitleWithActions'; // Import BlockTitleWithActions component
import { Session, User } from '@supabase/supabase-js'; // Add Session and User type imports

// Dynamically import TipTapEditor with SSR turned off
const TipTapEditor = dynamic(() => import('@/src/components/TipTapEditor'), {
  ssr: false,
  loading: () => <p>Cargando editor...</p>, // Optional loading state
});

const CourseEditorPage = ({ initialSession, user }: { initialSession: Session | null; user: User | null }) => {
  useEffect(() => {
    alert('CourseEditorPage mounted');
  }, []);
  // --- All hooks must be declared at the top level --- 
  const [session, setSession] = useState<Session | null>(initialSession);
  const router = useRouter();
  const supabase = useSupabaseClient(); // Get Supabase client from hook
  const { id } = router.query as { id?: string }; // 'id' will be undefined initially
  
  console.log("DEBUG - useSession():", session);
  console.log("DEBUG - session?.user.email:", session?.user?.email);
  
  // State for tracking collapsed/expanded state of blocks
  const [firstBlockCollapsed, setFirstBlockCollapsed] = useState(false);
  const [collapsedImageBlocks, setCollapsedImageBlocks] = useState<Record<string, boolean>>({});
  const [collapsedVideoBlocks, setCollapsedVideoBlocks] = useState<Record<string, boolean>>({});
  const [collapsedDownloadBlocks, setCollapsedDownloadBlocks] = useState<Record<string, boolean>>({});
  const [collapsedExternalLinksBlocks, setCollapsedExternalLinksBlocks] = useState<Record<string, boolean>>({});
  const [collapsedQuizBlocks, setCollapsedQuizBlocks] = useState<Record<string, boolean>>({});
  
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<any>(null);
  const [blocks, setBlocks] = useState<Block[]>([
    {
      id: crypto.randomUUID(), // Uses global crypto API
      type: 'text',
      title: 'Sin título',
      payload: { content: 'Hola mundo' }
    } as TextBlock, // Explicitly cast to TextBlock for initial state
    {
      id: crypto.randomUUID(),
      type: 'text',
      title: 'Sin título',
      payload: { content: 'funcion' }
    } as TextBlock // Explicitly cast to TextBlock for initial state
  ]);
  const [originalBlocks, setOriginalBlocks] = useState<Block[] | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);

  // Helper function to toggle image block collapse state
  const toggleImageBlockCollapse = (blockId: string) => {
    setCollapsedImageBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };
  
  // Helper function to toggle video block collapse state
  const toggleVideoBlockCollapse = (blockId: string) => {
    setCollapsedVideoBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };
  
  // Helper function to toggle download block collapse state
  const toggleDownloadBlockCollapse = (blockId: string) => {
    setCollapsedDownloadBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };
  
  // Helper function to toggle external links block collapse state
  const toggleExternalLinksBlockCollapse = (blockId: string) => {
    setCollapsedExternalLinksBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };
  
  // Helper function to toggle quiz block collapse state
  const toggleQuizBlockCollapse = (blockId: string) => {
    setCollapsedQuizBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };
  
  // Handler function for reordering blocks via drag and drop
  const handleReorderBlocks = (newBlockOrder: string[]) => {
    const reorderedBlocks = newBlockOrder.map((blockId, index) => {
      const block = blocks.find(b => b.id === blockId);
      return block ? { ...block, position: index } : null;
    }).filter(Boolean) as Block[];

    setBlocks(reorderedBlocks);
    setHasUnsavedChanges(true);
  };

  // --- Effects --- 

  // Effect to detect unsaved changes
  useEffect(() => {
    if (originalBlocks) {
      // Normalize or pick specific fields if direct stringify is too sensitive
      const currentBlocksString = JSON.stringify(blocks);
      const originalBlocksString = JSON.stringify(originalBlocks);
      setHasUnsavedChanges(currentBlocksString !== originalBlocksString);
    } else {
      // If originalBlocks aren't set yet, assume no unsaved changes relevant to user action
      setHasUnsavedChanges(false);
    }
  }, [blocks, originalBlocks]);

  // Effect 2: Fetch course details and then its blocks
  useEffect(() => {
    if (!id || typeof id !== 'string') {
      if (!id) setLoading(true); // Keep loading if id is missing
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      // 1. Fetch the course
      const { data: courseData, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error("Error fetching course:", error);
        toast.error(`Error al cargar el curso: ${error.message}`);
        setCourse(null);
        setBlocks([]); // Clear blocks on course fetch error
        setOriginalBlocks([]); // Clear originalBlocks as well
        setLoading(false);
        return;
      }
      if (courseData) {
        setCourse(courseData);

        // 2. Fetch existing blocks for this course
        const { data: fetchedBlocksData, error: blocksError } = await supabase
          .from('blocks')
          .select('*')
          .eq('course_id', id)
          .order('position', { ascending: true });

        if (blocksError) {
          console.error("Error fetching blocks:", blocksError);
          toast.error(`Error al cargar los bloques: ${blocksError.message}`);
          setBlocks([]); // Default to empty array on error
          setOriginalBlocks([]); // Set original blocks as empty array on error
        } else {
          const actualFetchedBlocks = fetchedBlocksData || [];
          setBlocks(actualFetchedBlocks);
          setOriginalBlocks(JSON.parse(JSON.stringify(actualFetchedBlocks))); // Deep clone for originalBlocks
        }
      }
      setLoading(false);
    };

    fetchData();
  }, [id, supabase]);

  // --- Handlers --- 
  const handleTipTapChange = (blockId: string, jsonContent: any) => {
    console.log('TipTap content changed for block:', blockId, 'New content:', jsonContent);
    // It's crucial to signal that there are unsaved changes.
    // Let's try setting it before setBlocks to see if it makes a difference in perceived updates.
    setHasUnsavedChanges(true); 

    setBlocks(prevBlocks =>
      prevBlocks.map(b =>
        b.id === blockId && b.type === 'text'
          ? { ...b, payload: { ...b.payload, content: jsonContent } } // Store TipTap JSON
          : b
      )
    );
    console.log('hasUnsavedChanges should now be true');
  };

  // Handler to add a new text block
  const handleAddTextBlock = () => {
    const newTextBlock: TextBlock = {
      id: crypto.randomUUID(),
      type: 'text',
      title: 'Sin título',
      payload: { content: '' },
      course_id: course?.id,
      position: blocks.length
    };
    
    setBlocks(prevBlocks => [...prevBlocks, newTextBlock]);
    setHasUnsavedChanges(true);
    console.log('New text block added:', newTextBlock.id);
  };

  // Handler to add a new image block
  const handleAddImageBlock = () => {
    const newImageBlock: ImageBlock = {
      id: crypto.randomUUID(),
      type: 'image',
      title: 'Sin título',
      payload: { 
        src: '', // Empty src to start with
        alt: '',
        caption: ''
      },
      course_id: course?.id,
      position: blocks.length
    };
    
    setBlocks(prevBlocks => [...prevBlocks, newImageBlock]);
    setHasUnsavedChanges(true);
    console.log('New image block added:', newImageBlock.id);
  };

  // Handler to add a new video block
  const handleAddVideoBlock = () => {
    const newBlock: VideoBlock = {
      id: crypto.randomUUID(),
      type: 'video',
      title: 'Sin título',
      payload: {
        url: '',
        caption: ''
      },
      course_id: course?.id,
      position: blocks.length
    };
    
    setBlocks([...blocks, newBlock]);
    setHasUnsavedChanges(true);
  };
  
  // Handler to add a new download block
  const handleAddDownloadBlock = () => {
    const newBlock: DownloadBlock = {
      id: crypto.randomUUID(),
      type: 'download',
      title: 'Sin título',
      payload: {
        files: []
      },
      course_id: course?.id,
      position: blocks.length
    };
    
    setBlocks([...blocks, newBlock]);
    setHasUnsavedChanges(true);
  };
  
  // Handler to add a new external links block
  const handleAddExternalLinksBlock = () => {
    const newBlock: ExternalLinksBlock = {
      id: crypto.randomUUID(),
      type: 'external-links',
      title: 'Sin título',
      payload: {
        links: [{ label: '', url: '' }] // Initialize with one empty link
      },
      course_id: course?.id,
      position: blocks.length
    };
    
    setBlocks([...blocks, newBlock]);
    setHasUnsavedChanges(true);
  };
  
  // Handler to add a new quiz block
  const handleAddQuizBlock = () => {
    const newBlock: QuizBlock = {
      id: crypto.randomUUID(),
      type: 'quiz',
      title: 'Sin título',
      payload: {
        questions: [
          { question: '', options: ['Nueva opción 1', 'Nueva opción 2'], correctAnswerIndex: 0 }
        ]
      },
    };
    setBlocks(prev => [...prev, newBlock]);
    setHasUnsavedChanges(true);
  };
  
  // Handler to add a new file to a download block
  const handleAddFileToDownloadBlock = (blockId: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === blockId && block.type === 'download'
          ? { 
              ...block, 
              payload: { 
                files: [...block.payload.files, { name: '', url: '' }]
              } 
            }
          : block
      )
    );
  };
  
  // Handler to update a file in a download block
  const handleUpdateFileInDownloadBlock = (blockId: string, fileIndex: number, field: 'name' | 'url', value: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'download') {
          const updatedFiles = [...block.payload.files];
          updatedFiles[fileIndex] = {
            ...updatedFiles[fileIndex],
            [field]: value
          };
          
          return {
            ...block,
            payload: {
              files: updatedFiles
            }
          };
        }
        return block;
      })
    );
  };
  
  // Handler to remove a file from a download block
  const handleRemoveFileFromDownloadBlock = (blockId: string, fileIndex: number) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'download') {
          const updatedFiles = [...block.payload.files];
          updatedFiles.splice(fileIndex, 1);
          
          return {
            ...block,
            payload: {
              files: updatedFiles
            }
          };
        }
        return block;
      })
    );
  };
  
  // Handler to add a new link to an external links block
  const handleAddLinkToExternalLinksBlock = (blockId: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === blockId && block.type === 'external-links'
          ? { 
              ...block, 
              payload: { 
                links: [...block.payload.links, { label: '', url: '' }]
              } 
            }
          : block
      )
    );
  };
  
  // Handler to update a link in an external links block
  const handleUpdateLinkInExternalLinksBlock = (blockId: string, linkIndex: number, field: 'label' | 'url', value: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'external-links') {
          const updatedLinks = [...block.payload.links];
          updatedLinks[linkIndex] = {
            ...updatedLinks[linkIndex],
            [field]: value
          };
          
          return {
            ...block,
            payload: {
              links: updatedLinks
            }
          };
        }
        return block;
      })
    );
  };
  
  // Handler to remove a link from an external links block
  const handleRemoveLinkFromExternalLinksBlock = (blockId: string, linkIndex: number) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'external-links') {
          const updatedLinks = [...block.payload.links];
          updatedLinks.splice(linkIndex, 1);
          
          return {
            ...block,
            payload: {
              links: updatedLinks
            }
          };
        }
        return block;
      })
    );
  };
  
  // Handler to update quiz question
  const handleQuizQuestionUpdate = (blockId: string, questionIndex: number, value: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks =>
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'quiz') {
          const updatedQuestions = block.payload.questions.map((q, idx) =>
            idx === questionIndex ? { ...q, question: value } : q
          );
          return { ...block, payload: { questions: updatedQuestions } };
        }
        return block;
      })
    );
  };

  // Handler to update a quiz option
  const handleQuizOptionUpdate = (blockId: string, questionIndex: number, optionIndex: number, value: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks =>
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'quiz') {
          const updatedQuestions = block.payload.questions.map((q, qIdx) => {
            if (qIdx === questionIndex) {
              const updatedOptions = q.options.map((opt, oIdx) =>
                oIdx === optionIndex ? value : opt
              );
              return { ...q, options: updatedOptions };
            }
            return q;
          });
          return { ...block, payload: { questions: updatedQuestions } };
        }
        return block;
      })
    );
  };

  // Handler to add a new option to a quiz
  const handleAddOptionToQuiz = (blockId: string, questionIndex: number) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks =>
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'quiz') {
          const updatedQuestions = block.payload.questions.map((q, qIdx) => {
            if (qIdx === questionIndex) {
              return { ...q, options: [...q.options, `Nueva opción ${q.options.length + 1}`] };
            }
            return q;
          });
          return { ...block, payload: { questions: updatedQuestions } };
        }
        return block;
      })
    );
  };

  // Handler to remove an option from a quiz
  const handleRemoveOptionFromQuiz = (blockId: string, questionIndex: number, optionIndex: number) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks =>
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'quiz') {
          const updatedQuestions = block.payload.questions.map((q, qIdx) => {
            if (qIdx === questionIndex) {
              const updatedOptions = q.options.filter((_, oIdx) => oIdx !== optionIndex);
              // Adjust correctAnswerIndex if needed
              let correctAnswerIndex = q.correctAnswerIndex;
              if (optionIndex === correctAnswerIndex) {
                // If we're removing the correct answer, default to the first option
                correctAnswerIndex = 0;
              } else if (optionIndex < correctAnswerIndex) {
                // If we're removing an option before the correct answer, decrement the index
                correctAnswerIndex--;
              }
              return { ...q, options: updatedOptions, correctAnswerIndex: Math.max(0, correctAnswerIndex) }; // Ensure index is not negative
            }
            return q;
          });
          return { ...block, payload: { questions: updatedQuestions } };
        }
        return block;
      })
    );
  };

  // Handler to set the correct answer for a quiz
  const handleSetCorrectAnswer = (blockId: string, questionIndex: number, value: number) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks =>
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'quiz') {
          const updatedQuestions = block.payload.questions.map((q, qIdx) =>
            qIdx === questionIndex ? { ...q, correctAnswerIndex: value } : q
          );
          return { ...block, payload: { questions: updatedQuestions } };
        }
        return block;
      })
    );
  };

  // Handler to add a new question to a quiz block
  const handleAddQuestionToQuizBlock = (blockId: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks =>
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'quiz') {
          return {
            ...block,
            payload: {
              questions: [
                ...block.payload.questions,
                { question: '', options: ['Nueva opción 1', 'Nueva opción 2'], correctAnswerIndex: 0 },
              ],
            },
          };
        }
        return block;
      })
    );
  };

  // Handler to remove a question from a quiz block
  const handleRemoveQuestionFromQuizBlock = (blockId: string, questionIndex: number) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks =>
      prevBlocks.map(block => {
        if (block.id === blockId && block.type === 'quiz') {
          const updatedQuestions = block.payload.questions.filter((_, idx) => idx !== questionIndex);
          return {
            ...block,
            payload: { questions: updatedQuestions },
          };
        }
        return block;
      })
    );
  };

  // Handler to save an individual block
  const handleSaveBlock = async (blockId: string) => {
    const courseIdFromRouter = router.query.id as string;
    
    if (!courseIdFromRouter) {
      toast.error("ID del curso no está presente en la URL. No se puede guardar.");
      return;
    }
    
    // Find the block to save
    const blockToSave = blocks.find(block => block.id === blockId);
    
    if (!blockToSave) {
      toast.error("No se encontró el bloque para guardar.");
      return;
    }
    
    // Create a loading toast
    const loadingToastId = toast.loading("Guardando bloque...");
    
    try {
      // Prepare the block for saving
      const { title, ...blockDataToSave } = blockToSave;
      const preparedBlock = {
        ...blockDataToSave,
        course_id: courseIdFromRouter,
      };
      
      // Save the block to Supabase
      const { error } = await supabase
        .from('blocks')
        .upsert(preparedBlock, { // Use preparedBlock without title
          onConflict: 'id',
        });
      
      if (error) {
        console.error('Error saving block to Supabase:', error);
        toast.dismiss(loadingToastId);
        toast.error(`Error al guardar el bloque: ${error.message}`);
      } else {
        toast.dismiss(loadingToastId);
        toast.success('¡Bloque guardado con éxito!', {
          position: 'bottom-right',
          duration: 3000,
          style: {
            background: '#2ecc71',
            color: '#fff',
            fontWeight: 'bold',
          },
        });
        
        // Update originalBlocks to reflect the saved state for this block
        // And ensure the block in `blocks` state also doesn't have the title if it was removed for saving
        // However, the main `handleSave` re-adds titles, so this needs to be consistent.
        // The current logic in the misplaced block re-adds title from blockToSave (which has title)
        // to originalBlocks. This seems fine as originalBlocks is for change tracking.
        setOriginalBlocks(prevOriginalBlocks => {
          const updatedOriginalBlocks = [...(prevOriginalBlocks || [])];
          const blockIndex = updatedOriginalBlocks.findIndex(b => b.id === blockId);
          
          // blockToSave still contains the title, which is what we want in originalBlocks for UI consistency
          if (blockIndex !== -1) {
            updatedOriginalBlocks[blockIndex] = JSON.parse(JSON.stringify(blockToSave));
          } else {
            updatedOriginalBlocks.push(JSON.parse(JSON.stringify(blockToSave)));
          }
          
          return updatedOriginalBlocks;
        });
        
        // Check if all blocks are now saved by comparing with the potentially updated originalBlocks
        // This comparison needs to be careful if titles are handled differently
        // A simpler approach for individual save might be to just set hasUnsavedChanges based on this block,
        // or rely on the main save button's comprehensive check.
        // For now, let's assume this logic is intended to contribute to the overall unsaved status.
        const currentOriginalBlocks = blocks.map(b => {
          const original = originalBlocks?.find(ob => ob.id === b.id);
          return original ? original : b; // Fallback if not in originalBlocks yet
        });

        if (JSON.stringify(blocks.find(b => b.id === blockId)) === JSON.stringify(originalBlocks?.find(b => b.id === blockId))) {
          // If this specific block matches its original, it doesn't mean all changes are saved.
          // This part of the logic might need refinement if hasUnsavedChanges should only become false
          // when *all* blocks match their originals.
          // The original misplaced code had: const allBlocksSaved = JSON.stringify(blocks) === JSON.stringify(originalBlocks);
          // which is a full check. Let's keep that intent.
        }
        // To be safe, let's re-evaluate hasUnsavedChanges against the new originalBlocks
        // This ensures that if this save operation made the current blocks match originalBlocks, hasUnsavedChanges becomes false.
        const newOriginalBlocks = [...(originalBlocks || [])];
        const savedBlockInOriginalsIdx = newOriginalBlocks.findIndex(b => b.id === blockId);
        if (savedBlockInOriginalsIdx !== -1) {
            newOriginalBlocks[savedBlockInOriginalsIdx] = JSON.parse(JSON.stringify(blockToSave));
        } else {
            newOriginalBlocks.push(JSON.parse(JSON.stringify(blockToSave)));
        }
        if (JSON.stringify(blocks) === JSON.stringify(newOriginalBlocks)) {
            setHasUnsavedChanges(false);
        }

      }
    } catch (error) {
      console.error('Error in handleSaveBlock:', error);
      toast.dismiss(loadingToastId);
      toast.error('Error al guardar el bloque');
    }
  };
  
  // Handler to delete an individual block
  const handleDeleteBlock = async (blockId: string) => {
    // Show confirmation dialog
    const confirmed = window.confirm('¿Estás seguro de que deseas eliminar este bloque?');
    
    if (!confirmed) {
      return; // User cancelled the deletion
    }
    
    // Create a loading toast
    const loadingToastId = toast.loading("Eliminando bloque...");
    
    try {
      // Delete the block from Supabase
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('id', blockId);
      
      if (error) {
        console.error('Error deleting block from Supabase:', error);
        toast.dismiss(loadingToastId);
        toast.error(`Error al eliminar el bloque: ${error.message}`);
      } else {
        // Remove the block from the blocks state
        setBlocks(prevBlocks => prevBlocks.filter(block => block.id !== blockId));
        
        // Remove the block from originalBlocks as well
        setOriginalBlocks(prevOriginalBlocks => 
          (prevOriginalBlocks || []).filter(block => block.id !== blockId)
        );
        
        toast.dismiss(loadingToastId);
        toast.success('Bloque eliminado con éxito', {
          position: 'bottom-right',
          duration: 3000,
        });
        
        setHasUnsavedChanges(true);
      }
    } catch (error) {
      console.error('Error in handleDeleteBlock:', error);
      toast.dismiss(loadingToastId);
      toast.error('Error al eliminar el bloque');
    }
  };

  // Handler to update image block properties
  const handleImageBlockUpdate = (blockId: string, field: 'src' | 'alt' | 'caption', value: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === blockId && block.type === 'image'
          ? { 
              ...block, 
              payload: { 
                ...block.payload, 
                [field]: value 
              } 
            }
          : block
      )
    );
  };

  // Function to convert YouTube and Vimeo URLs to embed format
  const getEmbedUrl = (url: string): string => {
    if (!url) return '';
    
    // YouTube URL conversion
    const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/i;
    const youtubeMatch = url.match(youtubeRegex);
    
    if (youtubeMatch && youtubeMatch[1]) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    
    // Vimeo URL conversion
    const vimeoRegex = /(?:vimeo\.com\/(?:video\/|channels\/[\w]+\/|groups\/[\w]+\/videos\/|)|player\.vimeo\.com\/video\/)([\d]+)/i;
    const vimeoMatch = url.match(vimeoRegex);
    
    if (vimeoMatch && vimeoMatch[1]) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }
    
    // Return original URL if it's not YouTube or Vimeo or already in embed format
    return url;
  };

  // Handler to update video block properties
  const handleVideoBlockUpdate = (blockId: string, field: 'url' | 'caption', value: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === blockId && block.type === 'video'
          ? { 
              ...block, 
              payload: { 
                ...block.payload, 
                [field]: value 
              } 
            }
          : block
      )
    );
  };

  // Handler to update block title
  const handleBlockTitleUpdate = (blockId: string, title: string) => {
    setHasUnsavedChanges(true);
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === blockId
          ? { ...block, title }
          : block
      )
    );
  };

  // Handler to upload an image to Supabase Storage
  const handleImageUpload = async (blockId: string, file: File) => {
    if (!file || !supabase) return;

    const loadingToastId = toast.loading('Subiendo imagen...');
    const fileExt = file.name.split('.').pop();
    const fileName = `${blockId}-${Date.now()}.${fileExt}`;
    const filePath = `${session?.user.id}/${course?.id}/${fileName}`;

    try {
      const { data, error } = await supabase.storage
        .from('course-assets') // Changed from 'course-images'
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });
      
      console.log('🔍 Image upload response:', { data, error }); // Added console.log

      if (error) {
        console.error('Error uploading image:', JSON.stringify(error, null, 2));
        toast.dismiss(loadingToastId);
        toast.error('Error al subir la imagen');
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('course-assets')
        .getPublicUrl(filePath);
      
      if (publicUrl) {
        // Update the image block with the new image URL
        setBlocks(prevBlocks => 
          prevBlocks.map(block => 
            block.id === blockId && block.type === 'image'
              ? { 
                  ...block, 
                  payload: { 
                    ...block.payload, 
                    src: publicUrl 
                  } 
                }
              : block
          )
        );
        
        toast.dismiss(loadingToastId);
        toast.success('Imagen subida exitosamente');
      } else {
        toast.dismiss(loadingToastId);
        toast.error('No se pudo obtener la URL pública de la imagen');
      }
    } catch (error: any) {
      console.error('🔴 Supabase upload error:', JSON.stringify(error, null, 2));
      toast.dismiss(loadingToastId);
      toast.error('Error al subir la imagen');
    }
  };
  
  
  // Handler to upload a PDF file to Supabase Storage
  const handlePdfUpload = async (blockId: string, fileIndex: number, file: File) => {
    if (!file || !supabase) return;

    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF.');
      return;
    }

    const loadingToastId = toast.loading('Subiendo PDF...');
    
    try {
      const filePath = `${blockId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('downloads')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error.message);
        toast.dismiss(loadingToastId);
        toast.error('Error al subir el archivo.');
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('downloads')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl;

      if (publicUrl) {
        // Update the file URL in the block's state
        setBlocks((prevBlocks) =>
          prevBlocks.map((block) => {
            if (block.id === blockId && block.type === 'download') {
              const updatedFiles = [...block.payload.files];
              updatedFiles[fileIndex] = {
                ...updatedFiles[fileIndex],
                url: publicUrl,
                name: updatedFiles[fileIndex].name || file.name // Use file name if no name is set
              };
              return {
                ...block,
                payload: {
                  files: updatedFiles
                }
              };
            }
            return block;
          })
        );

        toast.dismiss(loadingToastId);
        toast.success('Archivo PDF subido exitosamente');
      } else {
        toast.dismiss(loadingToastId);
        toast.error('No se pudo obtener la URL pública del archivo');
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
      toast.dismiss(loadingToastId);
      toast.error('Error al subir el archivo');
    }
  };
  
  // Stub save handler for scaffolded UI
  const handleSave = () => {
    console.log('Save Changes clicked');
    // TODO: implement full save logic here
  };

  // --- UI Rendering --- // Guards will now execute before the main return
  if (loading && !course) return <p className="p-6">Cargando curso...</p>;
  if (!course) return <p className="p-6">Curso no encontrado o ID no proporcionado.</p>;
  // If course is loaded but overall loading is true, it implies blocks are still loading.
  if (loading && course) return <p className="p-6">Cargando bloques del curso...</p>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-12">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Editar Curso: {course?.title}</h1>
      
      <div className="mb-12 bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">Ordena los bloques</h2>
        <TimelineEditor
          blocks={blocks.map(b => ({
            ...b,
            label: (b as any).title || b.type.toUpperCase()
          }))}
          onReorder={handleReorderBlocks}
          onDeleteBlock={handleDeleteBlock}
        />
      </div>

      <div className="flex flex-wrap gap-4 justify-start">
        <Button size="sm" onClick={handleAddTextBlock}>Agregar Bloque de Texto</Button>
        <Button size="sm" onClick={handleAddImageBlock}>Agregar Bloque de Imagen</Button>
        <Button size="sm" onClick={handleAddVideoBlock}>Agregar Bloque de Video</Button>
        <Button size="sm" onClick={handleAddDownloadBlock}>Agregar Bloque de Descarga</Button>
        <Button size="sm" onClick={handleAddExternalLinksBlock}>Agregar Bloque de Enlaces</Button>
        <Button size="sm" onClick={handleAddQuizBlock}>Agregar Bloque de Quiz</Button>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-6 text-gray-700">Contenido de los Bloques</h2>
        {blocks.map(block => {
          if (block.type === 'text') {
            return (
              <div key={block.id} className="bg-white rounded-lg shadow p-6 mb-6">
                <input
                  type="text"
                  placeholder="Título del bloque"
                  value={(block as any).title || ''}
                  onChange={e => handleBlockTitleUpdate(block.id, e.target.value)}
                  className="block w-full mb-4 border rounded px-3 py-2 text-sm"
                />
                <TipTapEditor
                  initialContent={block.payload.content}
                  onChange={json => handleTipTapChange(block.id, json)}
                />
                <div className="mt-4 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => handleSaveBlock(block.id)}>Guardar Bloque de Texto</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteBlock(block.id)}>
                    Eliminar Bloque
                  </Button>
                </div>
              </div>
            )
          }
          if (block.type === 'image') {
            return (
              <div key={block.id} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
                <input
                  type="text"
                  placeholder="Título del bloque"
                  value={(block as any).title || ''}
                  onChange={e => handleBlockTitleUpdate(block.id, e.target.value)}
                  className="block w-full mb-4 border rounded px-3 py-2 text-sm"
                />
                <div>
                  <label htmlFor={`image-upload-${block.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                    Subir Imagen:
                  </label>
                  <input
                    id={`image-upload-${block.id}`}
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(block.id, file);
                    }}
                    className="w-full border rounded px-3 py-2 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                {block.payload.src && (
                  <img src={block.payload.src} alt={block.payload.alt || ''} className="mt-2 max-w-full rounded" />
                )}
                <div>
                  <label htmlFor={`image-alt-${block.id}`} className="block text-sm font-medium text-gray-700 mb-1">Texto alternativo:</label>
                  <input
                    id={`image-alt-${block.id}`}
                    type="text"
                    placeholder="Describe la imagen"
                    value={block.payload.alt}
                    onChange={e => handleImageBlockUpdate(block.id, 'alt', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor={`image-caption-${block.id}`} className="block text-sm font-medium text-gray-700 mb-1">Leyenda:</label>
                  <input
                    id={`image-caption-${block.id}`}
                    type="text"
                    placeholder="Leyenda opcional para la imagen"
                    value={block.payload.caption}
                    onChange={e => handleImageBlockUpdate(block.id, 'caption', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="mt-4 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => handleSaveBlock(block.id)}>Guardar Bloque de Imagen</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteBlock(block.id)}>
                    Eliminar Bloque
                  </Button>
                </div>
              </div>
            )
          }
          if (block.type === 'video') {
            return (
              <div key={block.id} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
                <input
                  type="text"
                  placeholder="Título del bloque"
                  value={(block as any).title || ''}
                  onChange={e => handleBlockTitleUpdate(block.id, e.target.value)}
                  className="block w-full mb-4 border rounded px-3 py-2 text-sm"
                />
                <div>
                  <label htmlFor={`video-url-${block.id}`} className="block text-sm font-medium text-gray-700 mb-1">URL del Video:</label>
                  <input
                    id={`video-url-${block.id}`}
                    type="text"
                    placeholder="https://youtube.com/... o https://vimeo.com/..."
                    value={block.payload.url}
                    onChange={e => handleVideoBlockUpdate(block.id, 'url', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                {block.payload.url && getEmbedUrl(block.payload.url) && (
                  <div className="mt-2 aspect-video">
                    <iframe
                      src={getEmbedUrl(block.payload.url)}
                      className="w-full h-full rounded"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={`Video ${block.id}`}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor={`video-caption-${block.id}`} className="block text-sm font-medium text-gray-700 mb-1">Leyenda:</label>
                  <input
                    id={`video-caption-${block.id}`}
                    type="text"
                    placeholder="Leyenda opcional para el video"
                    value={block.payload.caption}
                    onChange={e => handleVideoBlockUpdate(block.id, 'caption', e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="mt-4 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => handleSaveBlock(block.id)}>Guardar Bloque de Video</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteBlock(block.id)}>
                    Eliminar Bloque
                  </Button>
                </div>
              </div>
            )
          }
          if (block.type === 'download') {
            return (
              <div key={block.id} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
                <input
                  type="text"
                  placeholder="Título del bloque"
                  value={(block as any).title || ''}
                  onChange={e => handleBlockTitleUpdate(block.id, e.target.value)}
                  className="block w-full mb-4 border rounded px-3 py-2 text-sm"
                />
                <p className="text-md font-semibold text-gray-700">Archivos para Descarga (PDF):</p>
                {block.payload.files.map((file: any, idx: number) => (
                  <div key={idx} className="space-y-2 border-t pt-4 mt-4 first:border-t-0 first:mt-0 first:pt-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Archivo {idx + 1}:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handlePdfUpload(block.id, idx, f);
                        }}
                        className="w-full border rounded px-3 py-2 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleRemoveFileFromDownloadBlock(block.id, idx)}
                        title="Eliminar este archivo"
                      >
                        ✕
                      </Button>
                    </div>
                    <input
                      type="text"
                      placeholder="Nombre del archivo (ej: Guía de Estudio.pdf)"
                      value={file.name}
                      onChange={e => handleUpdateFileInDownloadBlock(block.id, idx, 'name', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                    {file.url && (
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline truncate block"
                      >
                        Ver archivo actual: {file.name || 'Enlace directo'}
                      </a>
                    )}
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => handleAddFileToDownloadBlock(block.id)} className="mt-2">
                  Agregar Otro PDF
                </Button>
                <div className="mt-4 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => handleSaveBlock(block.id)}>Guardar Bloque de Descarga</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteBlock(block.id)}>
                    Eliminar Bloque
                  </Button>
                </div>
              </div>
            )
          }
          if (block.type === 'external-links') {
            return (
              <div key={block.id} className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
                <input
                  type="text"
                  placeholder="Título del bloque"
                  value={(block as any).title || ''}
                  onChange={e => handleBlockTitleUpdate(block.id, e.target.value)}
                  className="block w-full mb-4 border rounded px-3 py-2 text-sm"
                />
                <p className="text-md font-semibold text-gray-700">Enlaces Externos:</p>
                {block.payload.links.map((link: any, idx: number) => (
                  <div key={idx} className="space-y-2 border-t pt-4 mt-4 first:border-t-0 first:mt-0 first:pt-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Enlace {idx + 1}:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Etiqueta del enlace (ej: Documentación Oficial)"
                        value={link.label}
                        onChange={e => handleUpdateLinkInExternalLinksBlock(block.id, idx, 'label', e.target.value)}
                        className="w-full border rounded px-3 py-2 text-sm"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleRemoveLinkFromExternalLinksBlock(block.id, idx)}
                        title="Eliminar este enlace"
                      >
                        ✕
                      </Button>
                    </div>
                    <input
                      type="url"
                      placeholder="URL Completa (ej: https://ejemplo.com)"
                      value={link.url}
                      onChange={e => handleUpdateLinkInExternalLinksBlock(block.id, idx, 'url', e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => handleAddLinkToExternalLinksBlock(block.id)} className="mt-2">
                  Agregar Otro Enlace
                </Button>
                <div className="mt-4 flex gap-2 justify-end">
                  <Button size="sm" onClick={() => handleSaveBlock(block.id)}>Guardar Bloque de Enlaces</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteBlock(block.id)}>
                    Eliminar Bloque
                  </Button>
                </div>
              </div>
            )
          }
          if (block.type === 'quiz') {
            return (
              <div key={block.id} className="border rounded p-4 mb-4 bg-white">
                <label className="block mb-1 font-medium">Pregunta:</label>
                <input
                  type="text"
                  value={block.payload.questions[0]?.question || ''} // Access first question
                  onChange={e => handleQuizQuestionUpdate(block.id, 0, e.target.value)} // Pass questionIndex 0
                  className="w-full border rounded px-2 py-1 mb-2 text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => handleSaveBlock(block.id)}>Guardar Pregunta</Button>
                  <Button variant="destructive" onClick={() => handleDeleteBlock(block.id)}>
                    Eliminar Bloque
                  </Button>
                </div>
              </div>
            )
          }
          // Fallback for other block types
          const fallbackBlock = block as { id: string; type: string; [key: string]: any };
          return (
            <div key={fallbackBlock.id} className="bg-gray-100 rounded-lg shadow p-6 mb-6">
              <p className="text-sm text-gray-600">Bloque de tipo '{fallbackBlock.type}' no reconocido o sin UI específica.</p>
            </div>
          )
        })}
      </div>
      <div className="mt-8 flex justify-end">
        <Button onClick={handleSave} disabled={!hasUnsavedChanges} size="lg">Guardar Todos los Cambios</Button>
      </div>
    </div>
  );

}; // Closing brace for CourseEditorPage component

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  // Optionally, fetch initial course data here if the course ID is available
  // const { id: courseIdParam } = ctx.params || {}; // Ensure params exist
  // let course = null;
  // if (typeof courseIdParam === 'string') {
  //   const { data: courseData, error: courseError } = await supabase
  //     .from('courses')
  //     .select('*')
  //     .eq('id', courseIdParam)
  //     .single();
  //   if (courseError) {
  //     console.error('Error fetching course in getServerSideProps:', courseError);
  //   } else {
  //     course = courseData;
  //   }
  // }

  return {
    props: {
      initialSession: session,
      user: session.user,
      // course, // Pass course data if fetched
    },
  };
};

export default CourseEditorPage;