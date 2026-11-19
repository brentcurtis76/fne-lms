import { useState, useRef, useCallback, useEffect } from 'react';
import { XIcon, PhotographIcon, DocumentIcon, LinkIcon, HashtagIcon, AtSymbolIcon } from '@heroicons/react/outline';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import type { CreatePostInput, PostType } from '@/types/feed';
import MentionList from './MentionList';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * EC-V7: `postId` is this composition's own id, kept across retries until the
   * post is published or the window is closed, so a retry publishes it once.
   */
  onSubmit: (post: CreatePostInput, postId: string) => Promise<void>;
  authorName: string;
  authorAvatar?: string;
  /** F12e N97: the workspace the post is written in; the @mention search is scoped to it. */
  workspaceId: string;
}

export default function CreatePostModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  authorName, 
  authorAvatar,
  workspaceId
}: CreatePostModalProps) {
  const [postType, setPostType] = useState<PostType>('text');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [fileInputType, setFileInputType] = useState<'image' | 'document'>('image');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // EC-V7: one id per composition; cleared on success and on close. The id
  // stands for one exact selection of files: any change to the selection
  // (add, remove, replace, reorder) clears it, so the next «Publicar» makes a
  // new one and never reuses a file an earlier try left in the store under the
  // old id (send-back 1). A change of the text or the mentions keeps it.
  const pendingPostIdRef = useRef<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  // The editor (and its mention search) is built once; the ref keeps the
  // search on the workspace currently shown.
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: async ({ query }) => {
            // Fetch users from API
            try {
              const response = await fetch(`/api/community/search-users?q=${encodeURIComponent(query)}&workspace_id=${encodeURIComponent(workspaceIdRef.current)}`, {
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                },
              });
              if (!response.ok) throw new Error('Failed to fetch users');
              return await response.json();
            } catch (error) {
              console.error('Error fetching users:', error);
              return [];
            }
          },
          render: () => {
            let component: any;
            let popup: any;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },

              onUpdate(props: any) {
                component.updateProps(props);

                if (!props.clientRect) {
                  return;
                }

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect,
                });
              },

              onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }

                return component.ref?.onKeyDown(props);
              },

              onExit() {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[100px]',
      },
    },
  });

  const handleSubmit = async () => {
    if (!editor) return;
    
    const json = editor.getJSON();
    const text = editor.getText();
    
    if (!text.trim() && selectedFiles.length === 0 && !linkUrl) return;

    // Extract mentions from the editor content
    const mentions: string[] = [];
    const extractMentions = (node: any) => {
      if (node.type === 'mention') {
        mentions.push(node.attrs.id);
      }
      if (node.content) {
        node.content.forEach(extractMentions);
      }
    };
    if (json.content) {
      json.content.forEach(extractMentions);
    }

    if (!pendingPostIdRef.current) pendingPostIdRef.current = crypto.randomUUID();
    const postId = pendingPostIdRef.current;

    setPublishError(null);
    setIsSubmitting(true);
    try {
      const postData: CreatePostInput = {
        type: postType,
        content: {
          text: text.trim(),
          // Store the full JSON for rich text rendering later
          richText: json,
        },
        media: postType === 'image' ? selectedFiles : [],
        mentions: mentions.length > 0 ? mentions : undefined,
      };

      if (postType === 'link' && linkUrl) {
        postData.content.link = {
          url: linkUrl,
          title: 'Cargando...', // Will be fetched server-side
          domain: new URL(linkUrl).hostname,
        };
      }
      
      // Handle documents differently - they go in content.document
      if (postType === 'document' && selectedFiles.length > 0) {
        // For now, we'll store documents in the media array
        // but the backend will need to be updated to handle this properly
        postData.media = selectedFiles;
      }

      await onSubmit(postData, postId);
      pendingPostIdRef.current = null;
      handleClose();
    } catch (error: unknown) {
      console.error('Error creating post:', error);
      // The text and the files stay; the person reads a Spanish sentence, never
      // the store's or the database's raw text. The next «Publicar» keeps the id.
      const isPublishError = error instanceof Error && error.name === 'FeedPublishError';
      setPublishError(isPublishError ? error.message : 'No se pudo publicar. Inténtalo de nuevo.');
      // A post was left saved under this id (send-back 2): the composition is
      // finished, so a further «Publicar» is a new post and cannot collide with it.
      if (isPublishError && (error as Error & { compositionFinished?: boolean }).compositionFinished) {
        pendingPostIdRef.current = null;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    pendingPostIdRef.current = null;
    setPublishError(null);
    editor?.commands.clearContent();
    setSelectedFiles([]);
    setLinkUrl('');
    setPostType('text');
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    console.log('Selected files:', files);
    console.log('File input type:', fileInputType);
    
    if (files.length > 0) pendingPostIdRef.current = null;
    setSelectedFiles(prev => [...prev, ...files]);
    
    // Set post type based on the file type selected
    if (fileInputType === 'document') {
      setPostType('document');
    } else {
      setPostType('image');
    }
  };

  const removeFile = (index: number) => {
    pendingPostIdRef.current = null;
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    if (selectedFiles.length === 1) {
      setPostType('text');
    }
  };

  // A window closed from outside starts the next composition with a new id.
  useEffect(() => {
    if (!isOpen) {
      pendingPostIdRef.current = null;
      setPublishError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={handleClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* Header */}
          <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Crear publicación</h3>
            <button
              onClick={handleClose}
              className="rounded-full p-1 hover:bg-gray-100 transition-colors"
            >
              <XIcon className="h-6 w-6 text-gray-400" />
            </button>
          </div>

          {/* Author info */}
          <div className="px-4 py-3 flex items-center space-x-3">
            <div className="relative h-10 w-10">
              {authorAvatar && authorAvatar.startsWith('http') ? (
                <img
                  src={authorAvatar}
                  alt={authorName}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="h-full w-full rounded-full bg-[#0a0a0a] flex items-center justify-center text-white font-medium">
                  {authorName.split(' ').map(n => n[0]).join('')}
                </div>
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900">{authorName}</p>
              <p className="text-xs text-gray-500">Publicando en tu comunidad</p>
            </div>
          </div>

          {/* Content area */}
          <div className="px-4 pb-4">
            <EditorContent 
              editor={editor}
              className="w-full min-h-[100px] max-h-[300px] overflow-y-auto"
            />

            {/* Image preview */}
            {selectedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="relative">
                    {file.type.startsWith('image/') ? (
                      <div className="relative h-48 bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute top-2 right-2 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                        >
                          <XIcon className="h-4 w-4 text-white" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                        <DocumentIcon className="h-8 w-8 text-[#0a0a0a] mr-3" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                        >
                          <XIcon className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Link input */}
            {postType === 'link' && (
              <div className="mt-3">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="Pega el enlace aquí"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0a0a0a] focus:border-transparent"
                />
              </div>
            )}
          </div>

          {publishError && (
            <p role="alert" data-testid="create-post-error" className="mx-4 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {publishError}
            </p>
          )}

          {/* Actions bar */}
          <div className="border-t border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setFileInputType('image');
                    setPostType('image');
                    setTimeout(() => fileInputRef.current?.click(), 100);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Agregar imagen"
                >
                  <PhotographIcon className="h-5 w-5 text-gray-600" />
                </button>
                <button
                  onClick={() => {
                    setFileInputType('document');
                    setPostType('document');
                    setTimeout(() => fileInputRef.current?.click(), 100);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Agregar documento"
                >
                  <DocumentIcon className="h-5 w-5 text-gray-600" />
                </button>
                <button
                  onClick={() => setPostType('link')}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Agregar enlace"
                >
                  <LinkIcon className="h-5 w-5 text-gray-600" />
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Agregar hashtag"
                >
                  <HashtagIcon className="h-5 w-5 text-gray-600" />
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Mencionar a alguien"
                >
                  <AtSymbolIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <button
                onClick={handleSubmit}
                disabled={(!editor?.getText().trim() && selectedFiles.length === 0 && !linkUrl) || isSubmitting}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  (!editor?.getText().trim() && selectedFiles.length === 0 && !linkUrl) || isSubmitting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-[#0a0a0a] text-white hover:bg-[#0a0a0a]/90'
                }`}
              >
                {isSubmitting ? 'Publicando...' : 'Publicar'}
              </button>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={fileInputType === 'document' ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf' : 'image/*,video/*'}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}