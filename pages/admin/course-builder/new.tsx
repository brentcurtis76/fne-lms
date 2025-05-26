import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../../lib/supabase';
import Header from '../../../components/layout/Header';
import { toast } from 'react-hot-toast';

export default function NewCourse() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructor, setInstructor] = useState('');
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  
  // Instructors data
  const [instructors, setInstructors] = useState<any[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);
  
  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          console.log('No session found, redirecting to login');
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Check if user has admin role in metadata
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('Error fetching user data:', userError);
          router.push('/');
          return;
        }
        
        // Check for admin role in user metadata
        const adminRole = userData?.user?.user_metadata?.role === 'admin';
        console.log('Admin from metadata:', adminRole);
        
        // Always check profiles table as well
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();
          
        console.log('Profile data:', profileData);
        const adminFromProfile = profileData?.role === 'admin';
        
        // Set avatar URL if available
        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
        
        if (!adminRole && !adminFromProfile) {
          console.log('User is not an admin, redirecting to dashboard');
          router.push('/dashboard');
          return;
        }
        
        // User is an admin, allow access to the page
        console.log('User is admin, allowing access to new course page');
        setIsAdmin(true);
        setLoading(false);
        
        // Fetch instructors
        fetchInstructors();
        
      } catch (error) {
        console.error('Error checking admin access:', error);
        router.push('/login');
      }
    };
    
    checkAdminAccess();
  }, [router]);
  
  // Function to fetch instructors from Supabase
  const fetchInstructors = async () => {
    try {
      setLoadingInstructors(true);
      const { data, error } = await supabase
        .from('instructors')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      
      if (error) {
        throw new Error(error.message);
      }
      
      setInstructors(data || []);
    } catch (err) {
      console.error('Error fetching instructors:', err);
    } finally {
      setLoadingInstructors(false);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!title || !description) {
      toast.error('Por favor completa el título y la descripción.');
      return;
    }

    try {
      // 1. First check if we're authenticated with admin role
      console.log('Step 1: Checking authentication and admin status...');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session. Please login again.');
      }
      console.log('Authenticated as:', session.user.email);
      
      // 2. Handle thumbnail upload (if provided)
      let thumbnailUrl = 'https://example.com/default-thumbnail.png';
      if (thumbnail) {
        console.log('Step 2: Uploading thumbnail...');
        try {
          const fileExt = thumbnail.name.split('.').pop();
          const fileName = `${Date.now()}.${fileExt}`;
          const filePath = `thumbnails/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('course-assets')
            .upload(filePath, thumbnail);

          if (uploadError) {
            console.error('Thumbnail upload error:', uploadError);
            toast.error(`Error al subir la imagen: ${uploadError.message}`);
            // Continue with default thumbnail
          } else {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            thumbnailUrl = `${supabaseUrl}/storage/v1/object/public/course-assets/${filePath}`;
            console.log('Thumbnail uploaded successfully:', thumbnailUrl);
          }
        } catch (uploadErr) {
          console.error('Exception during upload:', uploadErr);
          // Continue with default thumbnail
        }
      }

      // 3. Create the course in Supabase
      console.log('Step 3: Creating course in Supabase...');
      const coursePayload: any = {
        title,
        description,
        thumbnail_url: thumbnailUrl,
        created_by: session.user.id, // Add user ID who created the course
      };

      if (instructor) {
        coursePayload.instructor_id = instructor;
      }

      const { data, error } = await supabase
        .from('courses')
        .insert([coursePayload])
        .select()
        .single();

      // 5. Handle the response
      if (error) {
        console.error('Database error:', error);
        
        // Check for RLS policy violations
        if (error.message.includes('violates row-level security policy')) {
          toast.error(
            'Error de seguridad: No tienes permisos para crear cursos. ' +
            'Esto puede ser debido a políticas de Row Level Security (RLS) ' +
            'en la tabla "courses". Contacta al administrador.'
          );
        } else {
          toast.error(`Error al crear el curso: ${error.message}`);
        }
        return;
      }

      // Success! Course created
      console.log('Success! Course created:', data);
      toast.success("Curso creado exitosamente");

      setTimeout(() => {
        router.push('/admin/course-builder');
      }, 500);
    } catch (err: any) {
      console.error('Exception during course creation:', err);
      toast.error(`Error: ${err.message || 'Error desconocido al crear el curso'}`);
    }
  };
  
  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setThumbnail(e.target.files[0]);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Verificando permisos...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Crear Nuevo Curso - FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-brand_beige">
        <Header 
          user={user} 
          isAdmin={isAdmin}
          avatarUrl={avatarUrl}
        />
        
        <main className="container mx-auto pt-32 pb-10 px-4">
          <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-brand_blue font-mont">Crear Nuevo Curso</h1>
              <button
                onClick={() => router.back()}
                className="text-brand_blue hover:text-brand_yellow transition font-mont"
              >
                ← Volver
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-brand_blue mb-1">
                  Título del Curso <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-brand_blue/50 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  placeholder="Ej: Introducción a la Educación Relacional"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-brand_blue mb-1">
                  Descripción <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-2 border border-brand_blue/50 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  placeholder="Describe el contenido y objetivos del curso..."
                  required
                ></textarea>
              </div>
              
              <div>
                <label htmlFor="instructor" className="block text-sm font-medium text-brand_blue mb-1">
                  Instructor
                </label>
                <select
                  id="instructor"
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  className="w-full px-4 py-2 border border-brand_blue/50 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  disabled={loadingInstructors}
                >
                  <option value="">Selecciona un instructor</option>
                  {instructors.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.full_name}
                    </option>
                  ))}
                </select>
                {loadingInstructors && (
                  <p className="text-xs text-gray-500 mt-1">Cargando instructores...</p>
                )}
              </div>
              
              <div>
                <label htmlFor="thumbnail" className="block text-sm font-medium text-brand_blue mb-1">
                  Imagen de Portada
                </label>
                <input
                  type="file"
                  id="thumbnail"
                  onChange={handleThumbnailChange}
                  accept="image/*"
                  className="w-full px-4 py-2 border border-brand_blue/50 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Recomendado: Imagen en formato 4:3 (400x300px). Máximo 2MB.
                </p>
              </div>
              
              <div className="pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  className="w-full md:w-auto px-6 py-3 bg-brand_blue text-white font-medium rounded-md hover:bg-brand_yellow hover:text-brand_blue transition font-mont"
                >
                  Crear Curso
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </>
  );
}