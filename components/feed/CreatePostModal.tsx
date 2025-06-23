import { useState, useRef } from 'react';
import { XIcon, PhotographIcon, DocumentIcon, LinkIcon, HashtagIcon, AtSymbolIcon } from '@heroicons/react/outline';
import type { CreatePostInput, PostType } from '@/types/feed';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (post: CreatePostInput) => Promise<void>;
  authorName: string;
  authorAvatar?: string;
}

export default function CreatePostModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  authorName, 
  authorAvatar 
}: CreatePostModalProps) {
  const [postType, setPostType] = useState<PostType>('text');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [fileInputType, setFileInputType] = useState<'image' | 'document'>('image');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!content.trim() && selectedFiles.length === 0 && !linkUrl) return;

    setIsSubmitting(true);
    try {
      const postData: CreatePostInput = {
        type: postType,
        content: {
          text: content.trim(),
        },
        media: postType === 'image' ? selectedFiles : [],
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

      await onSubmit(postData);
      handleClose();
    } catch (error: any) {
      console.error('Error creating post:', error);
      
      // Extract the actual error message
      let errorMessage = 'Error al crear la publicación. Por favor, intenta de nuevo.';
      
      if (error?.message) {
        if (typeof error.message === 'string') {
          errorMessage = error.message;
        } else if (error.message.includes?.('tablas del feed')) {
          errorMessage = error.message;
        }
      }
      
      // Check if it's an RLS policy error
      if (error?.message?.includes('new row violates row-level security policy')) {
        errorMessage = 'No tienes permisos para publicar en esta comunidad. Verifica que estés asignado a la comunidad.';
      }
      
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setContent('');
    setSelectedFiles([]);
    setLinkUrl('');
    setPostType('text');
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    console.log('Selected files:', files);
    console.log('File input type:', fileInputType);
    
    setSelectedFiles(prev => [...prev, ...files]);
    
    // Set post type based on the file type selected
    if (fileInputType === 'document') {
      setPostType('document');
    } else {
      setPostType('image');
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    if (selectedFiles.length === 1) {
      setPostType('text');
    }
  };

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
                <div className="h-full w-full rounded-full bg-[#00365b] flex items-center justify-center text-white font-medium">
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
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="¿Qué quieres compartir?"
              className="w-full resize-none border-0 focus:ring-0 text-gray-900 placeholder-gray-400"
              rows={4}
              autoFocus
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
                        <DocumentIcon className="h-8 w-8 text-[#00365b] mr-3" />
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                />
              </div>
            )}
          </div>

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
                disabled={(!content.trim() && selectedFiles.length === 0 && !linkUrl) || isSubmitting}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  (!content.trim() && selectedFiles.length === 0 && !linkUrl) || isSubmitting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-[#00365b] text-white hover:bg-[#00365b]/90'
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