import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import Header from '../components/layout/Header';

type School = {
  id: number;
  name: string;
  location?: string;
  type?: string;
  level?: string;
  code?: string;
  active?: boolean;
};

type Profile = {
  id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  description: string;
  school: string;
  avatar_url: string;
  growth_community: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [description, setDescription] = useState('');
  const [school, setSchool] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const getSessionAndProfile = async () => {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      // Get user metadata and check for admin role
      const { data: userData, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Error fetching user data:', userError);
      } else {
        // Check if user has admin role in metadata
        const adminRole = userData?.user?.user_metadata?.role === 'admin';
        console.log('Is admin from metadata:', adminRole);
        setIsAdmin(adminRole);
      }

      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setFirstName(profileData.first_name || '');
        setMiddleName(profileData.middle_name || '');
        setLastName(profileData.last_name || '');
        setDescription(profileData.description || '');
        setSchool(profileData.school || '');
        setAvatarUrl(profileData.avatar_url || '');
        
        // If we still don't have admin status, check profile role as fallback
        if (!isAdmin && profileData.role === 'admin') {
          console.log('Is admin from profile data:', true);
          setIsAdmin(true);
        }
      }

      // Fetch schools for dropdown
      try {
        console.log('Fetching schools from Supabase...');
        const { data: schoolsData, error: schoolsError } = await supabase
          .from('schools')
          .select('*');
        
        console.log('Schools query result:', { data: schoolsData, error: schoolsError });
        
        if (schoolsError) {
          console.error('Error fetching schools:', schoolsError);
        }
        
        if (schoolsData && schoolsData.length > 0) {
          console.log(`Found ${schoolsData.length} schools in the database`);
          setSchools(schoolsData);
        } else {
          console.warn('No schools found in the database');
          // Create some sample schools for testing if none exist
          const sampleSchools = [
            { id: -1, name: 'Escuela de Prueba 1' },
            { id: -2, name: 'Escuela de Prueba 2' },
          ];
          setSchools(sampleSchools);
        }
      } catch (error) {
        console.error('Exception when fetching schools:', error);
      }

      setLoading(false);
      setDataLoaded(true);
    };

    getSessionAndProfile();
  }, [router]);

  // Handle file selection for avatar preview
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setAvatarFile(file);
    
    // Create a preview URL for the selected image
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setPreviewUrl(result);
      setShowAvatarModal(true);
    };
    reader.readAsDataURL(file);
  };
  
  // Close the avatar preview modal
  const closeAvatarModal = () => {
    setShowAvatarModal(false);
  };
  
  // Confirm the avatar selection
  const confirmAvatar = () => {
    setShowAvatarModal(false);
    // The preview is kept and will be uploaded when the user saves the profile
  };
  
  const handleSave = async () => {
    if (!user) return;

    // Handle avatar upload if a new file was selected
    let avatar_url = avatarUrl;
    let avatarUploadFailed = false;
    let avatarErrorMessage = '';
    
    if (avatarFile) {
      try {
        // Store the preview URL in case upload fails
        const tempPreviewUrl = previewUrl;
        
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        
        // Try to upload the avatar
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('avatars')
          .upload(`${user.id}/${fileName}`, avatarFile, {
            upsert: true
          });

        if (uploadError) {
          console.error('Avatar upload error:', uploadError);
          avatarUploadFailed = true;
          avatarErrorMessage = uploadError.message;
          
          // If bucket doesn't exist, we'll still save the profile without the avatar
          if (uploadError.message.includes('bucket') || uploadError.message.includes('Bucket')) {
            avatarErrorMessage = 'El almacenamiento para avatares no está configurado. Tu perfil se guardará sin la imagen.';
          }
        } else if (uploadData) {
          // Get the public URL for the uploaded avatar
          const { data: publicUrlData } = supabase
            .storage
            .from('avatars')
            .getPublicUrl(`${user.id}/${fileName}`);

          avatar_url = publicUrlData.publicUrl;
          setAvatarUrl(avatar_url);
          setPreviewUrl(''); // Clear the preview after successful upload
        }
      } catch (error) {
        console.error('Unexpected error during avatar upload:', error);
        avatarUploadFailed = true;
        avatarErrorMessage = 'Error inesperado al subir la imagen. Tu perfil se guardará sin la imagen.';
      }
    }

    try {
      // Check if a profile already exists for this user
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      let updateMethod;
      let updateData;
      
      // If the profile exists, use update instead of upsert to avoid RLS issues
      if (existingProfile) {
        console.log('Existing profile found, using update method');
        updateMethod = supabase
          .from('profiles')
          .update({
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            description,
            school,
            avatar_url,
            growth_community: profile?.growth_community || null,
            // Assign docente role if no role is currently set
            role: existingProfile.role || 'docente'
          })
          .eq('id', user.id);
      } else {
        // If no profile exists, use insert
        console.log('No existing profile, using insert method');
        updateMethod = supabase
          .from('profiles')
          .insert({
            id: user.id,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            description,
            school,
            avatar_url,
            growth_community: profile?.growth_community || null,
            role: 'docente',
            approval_status: 'pending'
          });
      }
      
      // Also update user metadata with role if not already set
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user && !userData.user.user_metadata?.role) {
        console.log('Setting user metadata role to docente');
        await supabase.auth.updateUser({
          data: { role: 'docente' }
        });
      }
      
      // Execute the update or insert
      const { error: updateError } = await updateMethod;
      
      // Check for errors
      if (updateError) {
        console.error('Profile update failed:', updateError);
        toast.error(`Error actualizando perfil: ${updateError.message}`);
      } else {
        // Success message
        if (avatarUploadFailed) {
          toast.success('Perfil actualizado correctamente');
          toast.error(`Problema con la imagen: ${avatarErrorMessage}`);
        } else {
          toast.success('Perfil actualizado correctamente');
        }
      }
    } catch (error) {
      console.error('Unexpected error saving profile:', error);
      toast.error('Error inesperado al guardar el perfil. Por favor, intenta de nuevo.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-brand_beige">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Perfil de Usuario | FNE LMS</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </Head>

      <Header user={user} isAdmin={isAdmin} onLogout={handleLogout} />

      <div id="profile-page" className="min-h-[800px] bg-[#e8e5e2] pt-32 pb-20 relative overflow-hidden">
        {/* Success Alert */}
        {dataLoaded && (
          <div id="success-alert" className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-white shadow-lg border-l-4 border-[#00365b] text-[#00365b] px-6 py-3 rounded-lg flex items-center z-50 animate-fadeIn">
            <i className="fa-solid fa-circle-check text-[#00365b] mr-3 text-xl"></i>
            <span className="font-medium">Perfil cargado exitosamente</span>
            <style jsx>{`
              @keyframes fadeIn {
                0% { opacity: 0; transform: translate(-50%, -20px); }
                100% { opacity: 1; transform: translate(-50%, 0); }
              }
              @keyframes fadeOut {
                0% { opacity: 1; transform: translate(-50%, 0); }
                100% { opacity: 0; transform: translate(-50%, -20px); }
              }
              .animate-fadeIn {
                animation: fadeIn 0.5s ease-out forwards, fadeOut 0.5s ease-in forwards 3s;
              }
            `}</style>
          </div>
        )}

        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            <div id="profile-form" className="bg-white rounded-2xl shadow-xl p-8 md:p-10">
              <h1 className="text-[#00365b] text-2xl md:text-3xl font-bold mb-8">Tu perfil</h1>

              {/* Avatar Section */}
              <div className="mb-8 flex flex-col items-center">
                <div className="relative w-32 h-32 mb-4">
                  {previewUrl ? (
                    <img
                      id="avatar-preview"
                      src={previewUrl}
                      className="w-full h-full rounded-full object-cover border-4 border-[#e8e5e2]"
                      alt="Profile avatar"
                    />
                  ) : avatarUrl ? (
                    <img
                      id="avatar-preview"
                      src={avatarUrl}
                      className="w-full h-full rounded-full object-cover border-4 border-[#e8e5e2]"
                      alt="Profile avatar"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center border-4 border-[#e8e5e2]">
                      <i className="fa-solid fa-user text-gray-400 text-4xl"></i>
                    </div>
                  )}
                  <div 
                    className="absolute bottom-0 right-0 bg-[#00365b] rounded-full p-2 cursor-pointer"
                    onClick={() => document.getElementById('avatar-input')?.click()}
                  >
                    <i className="fa-solid fa-camera text-white"></i>
                  </div>
                </div>
                <input 
                  type="file" 
                  id="avatar-input" 
                  className="hidden" 
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleAvatarChange}
                />
                <p className="text-sm text-gray-500">PNG, JPG, GIF o WEBP (max. 10MB)</p>
              </div>
          
              <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* First Name */}
                  <div>
                    <label htmlFor="firstName" className="block text-[#00365b] font-medium mb-2">Nombre</label>
                    <input
                      id="firstName"
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#00365b]"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>

                  {/* Middle Name */}
                  <div>
                    <label htmlFor="middleName" className="block text-[#00365b] font-medium mb-2">Segundo nombre (opcional)</label>
                    <input
                      id="middleName"
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#00365b]"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                    />
                  </div>

                  {/* Last Name */}
                  <div>
                    <label htmlFor="lastName" className="block text-[#00365b] font-medium mb-2">Apellidos</label>
                    <input
                      id="lastName"
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#00365b]"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[#00365b] font-medium mb-2">Correo electrónico</label>
                    <input
                      type="email"
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200"
                      value={user?.email || ''}
                      readOnly
                    />
                  </div>

                  {/* School */}
                  <div className="md:col-span-2">
                    <label htmlFor="school" className="block text-[#00365b] font-medium mb-2">Escuela</label>
                    <select
                      id="school"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#00365b]"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                    >
                      <option value="">Selecciona una escuela</option>
                      {schools.map((schoolItem) => (
                        <option key={schoolItem.id} value={schoolItem.name}>
                          {schoolItem.name}
                          {schoolItem.location && ` - ${schoolItem.location}`}
                          {schoolItem.type && ` (${schoolItem.type})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Growth Community */}
                  <div className="md:col-span-2">
                    <label className="block text-[#00365b] font-medium mb-2">Comunidad de crecimiento</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200"
                      value={profile?.growth_community || 'No asignada'}
                      readOnly
                    />
                  </div>

                  {/* Description */}
                  <div className="md:col-span-2">
                    <label htmlFor="description" className="block text-[#00365b] font-medium mb-2">Descripción</label>
                    <textarea
                      id="description"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#00365b] h-32"
                      placeholder="Cuéntanos sobre ti..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    ></textarea>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex flex-col md:flex-row justify-end space-y-4 md:space-y-0 md:space-x-4 pt-6">
                  <button 
                    type="button" 
                    className="px-6 py-3 rounded-xl border-2 border-[#00365b] text-[#00365b] hover:bg-[#00365b] hover:text-white transition duration-300"
                    onClick={handleLogout}
                  >
                    Cerrar sesión
                  </button>
                  <button 
                    type="submit" 
                    className="px-6 py-3 rounded-xl bg-[#00365b] text-white hover:bg-[#fdb933] hover:text-[#00365b] transition duration-300"
                  >
                    Guardar perfil
                  </button>
                </div>
              </form>
            </div>
            
            {/* Avatar Preview Modal */}
            {showAvatarModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full">
                  <h3 className="text-xl font-bold mb-4 text-[#00365b]">Vista previa del avatar</h3>
                  
                  <div className="flex flex-col items-center mb-6">
                    <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-[#00365b] mb-4">
                      <img 
                        src={previewUrl} 
                        alt="Avatar Preview" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <p className="text-sm text-gray-600">Esta es la apariencia que tendrá tu avatar</p>
                  </div>
                  
                  <div className="flex justify-end space-x-3">
                    <button 
                      onClick={closeAvatarModal}
                      className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={confirmAvatar}
                      className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b]"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
