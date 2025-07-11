import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Camera, AlertCircle, Lightbulb, MessageSquare, CheckCircle } from 'lucide-react';

import { toast } from 'react-hot-toast';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FeedbackType = 'bug' | 'idea' | 'feedback';

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const supabase = useSupabaseClient();
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FeedbackType>('feedback');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no puede superar 5MB');
        return;
      }
      
      setScreenshot(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setScreenshotPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La imagen no puede superar 5MB');
        return;
      }
      
      setScreenshot(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setScreenshotPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const uploadScreenshot = async (userId: string): Promise<string | null> => {
    if (!screenshot) return null;

    const timestamp = Date.now();
    // Sanitize filename: replace spaces with underscores and remove special characters
    const sanitizedName = screenshot.name
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/[^\w.-]/g, ''); // Keep only alphanumeric, dots, hyphens, underscores
    
    const fileName = `${timestamp}_${sanitizedName}`;
    const filePath = `feedback/${userId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('feedback-screenshots')
      .upload(filePath, screenshot, {
        contentType: screenshot.type || 'image/png',
        upsert: false
      });

    if (error) {
      console.error('Error uploading screenshot:', error);
      throw new Error('Error al subir la imagen');
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('feedback-screenshots')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error('Por favor describe el problema o sugerencia');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      // Upload screenshot if present
      let screenshotUrl = null;
      if (screenshot) {
        screenshotUrl = await uploadScreenshot(user.id);
      }

      // Capture browser info
      const browserInfo = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        referrer: document.referrer
      };

      // Create feedback entry
      const { data: feedback, error } = await supabase
        .from('platform_feedback')
        .insert({
          description: description.trim(),
          type,
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          browser_info: browserInfo,
          screenshot_url: screenshotUrl,
          screenshot_filename: screenshot?.name,
          created_by: user.id
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Get user profile for notification
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', user.id)
        .single();

      // Notify admins about new feedback
      try {
        // Get all admin users from user_roles table
        const { data: adminRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role_type', 'admin');

        if (adminRoles && adminRoles.length > 0) {
          // Send notification via API route (server-side)
          const response = await fetch('/api/feedback/notify-admins', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              feedbackData: {
                feedback_id: feedback.id,
                feedback_type: type,
                user_name: profile ? `${profile.first_name} ${profile.last_name}` : user.email,
                user_email: profile?.email || user.email,
                description: description.trim().substring(0, 100) + (description.length > 100 ? '...' : ''),
                page_url: window.location.href,
                assigned_users: adminRoles.map(admin => admin.user_id)
              }
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.warn('Failed to send admin notifications:', errorData.error);
          } else {
            const result = await response.json();
            console.log('✅ Admin notifications sent:', result.notificationsCreated);
          }
        }
      } catch (notificationError) {
        console.error('Error sending notification:', notificationError);
        // Don't fail the feedback submission if notification fails
      }

      // Show success state
      setFeedbackId(feedback.id);
      setIsSuccess(true);

      // Reset form after delay
      setTimeout(() => {
        setDescription('');
        setScreenshot(null);
        setScreenshotPreview(null);
        setType('feedback');
        setIsSuccess(false);
        onClose();
      }, 3000);

    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      toast.error(error.message || 'Error al enviar el feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setDescription('');
    setScreenshot(null);
    setScreenshotPreview(null);
    setType('feedback');
    setIsSuccess(false);
    setFeedbackId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {isSuccess ? (
          // Success state
          <div className="p-6 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">¡Gracias! 🎉</h3>
            <p className="text-gray-600 mb-2">Tu reporte fue enviado.</p>
            <p className="text-sm text-gray-500">Número: #FB-{feedbackId?.slice(0, 8).toUpperCase()}</p>
            <button
              onClick={() => {
                reset();
                onClose();
              }}
              className="mt-6 px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#00243a] transition-colors"
            >
              ✓ Cerrar
            </button>
          </div>
        ) : (
          // Form state
          <>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">¿Qué sucedió? 💭</h2>
              <button
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[calc(90vh-8rem)] overflow-y-auto">
              {/* Description */}
              <div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="El botón no funciona cuando..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent resize-none"
                  rows={4}
                  autoFocus
                />
              </div>

              {/* Screenshot upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📸 Adjuntar captura (opcional)
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-[#fdb933] transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {screenshotPreview ? (
                    <div className="relative">
                      <img
                        src={screenshotPreview}
                        alt="Preview"
                        className="max-h-32 mx-auto rounded"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setScreenshot(null);
                          setScreenshotPreview(null);
                        }}
                        className="absolute top-0 right-0 -mt-2 -mr-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                      <p className="text-sm text-gray-600">
                        Arrastra una imagen o haz clic para seleccionar
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo:
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('bug')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      type === 'bug'
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>Problema</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('idea')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      type === 'idea'
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Lightbulb className="w-4 h-4" />
                    <span>Idea</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t bg-gray-50">
              <button
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !description.trim()}
                className="flex-1 px-4 py-2 bg-[#fdb933] text-[#00365b] rounded-lg hover:bg-[#fca311] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSubmitting ? 'Enviando...' : 'Enviar →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}