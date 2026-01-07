import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, EyeOffIcon } from '@heroicons/react/outline';
import TipTapEditor from '@/src/components/TipTapEditor';
import { uploadFile } from '@/utils/storage';
import { getEnhancedUserInfo } from '@/utils/authHelpers';

interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  content: any;
  content_html: string;
  featured_image?: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  display_date?: string;
  author?: {
    id: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
}

export default function NewsAdmin() {
  const router = useRouter();
  const user = useUser();
  const supabase = useSupabaseClient();
  
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [tempDate, setTempDate] = useState('');
  
  // Role detection state - FIXED: No more hardcoded isAdmin
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<any>({});
  const [featuredImage, setFeaturedImage] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [displayDate, setDisplayDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchArticles();
  }, []);

  // FIXED: Use enhanced auth detection with multiple fallback strategies
  useEffect(() => {
    console.log('🚀 [news.tsx] Enhanced auth detection triggered, user:', user?.id);
    
    const detectUserRole = async () => {
      try {
        const userInfo = await getEnhancedUserInfo(user, supabase);
        console.log('🔍 [news.tsx] Enhanced auth result:', userInfo);
        
        setUserRole(userInfo.userRole);
        setIsAdmin(userInfo.isAdmin);
        
        if (userInfo.source === 'none') {
          console.log('⚠️  [news.tsx] No auth source available - user may need to login');
        } else {
          console.log(`✅ [news.tsx] Auth detected via ${userInfo.source}: ${userInfo.userRole} (admin: ${userInfo.isAdmin})`);
        }
        
      } catch (error) {
        console.error('❌ [news.tsx] Enhanced auth detection failed:', error);
        setIsAdmin(false);
        setUserRole('');
      }
    };

    detectUserRole();
  }, [user, supabase]);

  const fetchArticles = async () => {
    try {
      const response = await fetch('/api/admin/news');
      if (!response.ok) throw new Error('Error al cargar noticias');
      
      const data = await response.json();
      setArticles(data);
    } catch (error) {
      console.error('Error fetching articles:', error);
      toast.error('Error al cargar las noticias');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExtension = file.name.split('.').pop();
      const fileName = `news-images/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
      
      const { url, error } = await uploadFile(file, fileName);
      
      if (error) throw error;
      if (url) {
        setFeaturedImage(url);
        toast.success('Imagen subida exitosamente');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Error al subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title || !content) {
      toast.error('El título y contenido son requeridos');
      return;
    }

    setSaving(true);
    try {
      const method = editingArticle ? 'PUT' : 'POST';
      const body = editingArticle 
        ? { id: editingArticle.id, title, content, featured_image: featuredImage, is_published: isPublished, display_date: displayDate || undefined }
        : { title, content, featured_image: featuredImage, is_published: isPublished, display_date: displayDate || undefined };

      const response = await fetch('/api/admin/news', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al guardar');
      }

      toast.success(editingArticle ? 'Artículo actualizado' : 'Artículo creado');
      resetForm();
      setShowModal(false);
      fetchArticles();
    } catch (error: any) {
      console.error('Error saving article:', error);
      toast.error(error.message || 'Error al guardar el artículo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este artículo?')) return;

    try {
      const response = await fetch(`/api/admin/news?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Error al eliminar');

      toast.success('Artículo eliminado');
      fetchArticles();
    } catch (error) {
      console.error('Error deleting article:', error);
      toast.error('Error al eliminar el artículo');
    }
  };

  const handleTogglePublish = async (article: NewsArticle) => {
    try {
      const response = await fetch('/api/admin/news', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: article.id,
          is_published: !article.is_published
        })
      });

      if (!response.ok) throw new Error('Error al actualizar');

      toast.success(article.is_published ? 'Artículo despublicado' : 'Artículo publicado');
      fetchArticles();
    } catch (error) {
      console.error('Error toggling publish:', error);
      toast.error('Error al cambiar el estado de publicación');
    }
  };

  const handleQuickDateEdit = (article: NewsArticle) => {
    const date = article.display_date || article.created_at;
    setTempDate(date ? new Date(date).toISOString().split('T')[0] : '');
    setEditingDateId(article.id);
  };

  const handleQuickDateSave = async (articleId: string) => {
    try {
      const response = await fetch('/api/admin/news', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: articleId,
          display_date: tempDate
        })
      });

      if (!response.ok) throw new Error('Error al actualizar fecha');

      toast.success('Fecha actualizada');
      setEditingDateId(null);
      setTempDate('');
      fetchArticles();
    } catch (error) {
      console.error('Error updating date:', error);
      toast.error('Error al actualizar la fecha');
    }
  };

  const handleQuickDateCancel = () => {
    setEditingDateId(null);
    setTempDate('');
  };

  const openEditModal = (article: NewsArticle) => {
    setEditingArticle(article);
    setTitle(article.title);
    setContent(article.content);
    setFeaturedImage(article.featured_image || '');
    setIsPublished(article.is_published);
    // Format date for input field (YYYY-MM-DD)
    const date = article.display_date || article.created_at;
    setDisplayDate(date ? new Date(date).toISOString().split('T')[0] : '');
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingArticle(null);
    setTitle('');
    setContent({});
    setFeaturedImage('');
    setIsPublished(false);
    setDisplayDate(new Date().toISOString().split('T')[0]); // Default to today
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  console.log('🔍 [news.tsx] Rendering with props:', { isAdmin, userRole });
  console.log('👤 [news.tsx] Current user state:', { 
    hasUser: !!user, 
    userId: user?.id, 
    userEmail: user?.email 
  });
  
  return (
    <MainLayout 
      user={user} 
      currentPage="news"
      pageTitle="Gestión de Noticias"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Gestión de Noticias</h1>
              <p className="mt-1 text-sm text-gray-600">
                Crea y administra las noticias del sitio
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand_primary hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_accent"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Nueva Noticia
            </button>
          </div>
        </div>

        {/* Articles Table */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand_primary"></div>
              <p className="mt-2 text-gray-600">Cargando noticias...</p>
            </div>
          ) : articles.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">No hay noticias aún</p>
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="mt-4 inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                Crear primera noticia
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Título
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Autor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {articles.map((article) => (
                    <tr key={article.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {article.featured_image && (
                            <img
                              src={article.featured_image}
                              alt=""
                              className="h-10 w-10 rounded object-cover mr-3"
                            />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {article.title}
                            </div>
                            <div className="text-sm text-gray-500">
                              /noticias/{article.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {article.author 
                            ? `${article.author.first_name || ''} ${article.author.last_name || ''}`.trim() || 'Sin autor'
                            : 'Sin autor'
                          }
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          article.is_published
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {article.is_published ? 'Publicado' : 'Borrador'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {editingDateId === article.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="date"
                              value={tempDate}
                              onChange={(e) => setTempDate(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleQuickDateSave(article.id);
                                } else if (e.key === 'Escape') {
                                  handleQuickDateCancel();
                                }
                              }}
                              className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent"
                              autoFocus
                            />
                            <button
                              onClick={() => handleQuickDateSave(article.id)}
                              className="text-brand_accent hover:text-amber-600"
                              title="Guardar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                              </svg>
                            </button>
                            <button
                              onClick={handleQuickDateCancel}
                              className="text-red-600 hover:text-red-800"
                              title="Cancelar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div 
                            className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors group flex items-center"
                            onClick={() => handleQuickDateEdit(article)}
                            title="Click para editar fecha"
                          >
                            <span>{formatDate(article.display_date || article.created_at)}</span>
                            <svg className="w-3 h-3 ml-2 text-gray-400 group-hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleTogglePublish(article)}
                            className="text-gray-600 hover:text-gray-900"
                            title={article.is_published ? 'Despublicar' : 'Publicar'}
                          >
                            {article.is_published ? (
                              <EyeOffIcon className="h-5 w-5" />
                            ) : (
                              <EyeIcon className="h-5 w-5" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(article)}
                            className="text-brand_primary hover:text-gray-700"
                            title="Editar"
                          >
                            <PencilIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(article.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Eliminar"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Editor Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
              </div>

              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="mb-4">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      {editingArticle ? 'Editar Noticia' : 'Nueva Noticia'}
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Título
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand_accent focus:border-brand_accent sm:text-sm"
                        placeholder="Título de la noticia"
                      />
                    </div>

                    {/* Featured Image */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Imagen Destacada
                      </label>
                      <div className="mt-1 flex items-center space-x-4">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploading}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand_beige file:text-brand_primary hover:file:bg-amber-100"
                        />
                        {uploading && (
                          <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-brand_primary"></div>
                        )}
                      </div>
                      {featuredImage && (
                        <div className="mt-2">
                          <img
                            src={featuredImage}
                            alt="Preview"
                            className="h-32 w-auto rounded"
                          />
                        </div>
                      )}
                    </div>

                    {/* Display Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Fecha de Publicación
                      </label>
                      <input
                        type="date"
                        value={displayDate}
                        onChange={(e) => setDisplayDate(e.target.value)}
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-brand_accent focus:border-brand_accent sm:text-sm"
                        title="Selecciona la fecha que aparecerá en el artículo"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Esta es la fecha que se mostrará en el artículo. Útil para artículos migrados o programados.
                      </p>
                    </div>

                    {/* Content Editor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contenido
                      </label>
                      <TipTapEditor
                        initialContent={content}
                        onChange={setContent}
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        💡 Tip: Puedes pegar enlaces de YouTube directamente en el contenido y se mostrarán como videos reproducibles.
                      </p>
                    </div>

                    {/* Publish Status */}
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_published"
                        checked={isPublished}
                        onChange={(e) => setIsPublished(e.target.checked)}
                        className="h-4 w-4 text-brand_primary focus:ring-brand_accent border-gray-300 rounded"
                      />
                      <label htmlFor="is_published" className="ml-2 block text-sm text-gray-900">
                        Publicar ahora
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-brand_primary text-base font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_accent sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : (editingArticle ? 'Actualizar' : 'Crear')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_accent sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}