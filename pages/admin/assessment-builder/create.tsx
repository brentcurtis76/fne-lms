import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { ClipboardList, ArrowLeft, Save } from 'lucide-react';
import type { TransformationArea, CreateTemplateRequest } from '@/types/assessment-builder';
import { AREA_LABELS, AREA_STATUS } from '@/types/assessment-builder';

const CreateTemplate: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateTemplateRequest>({
    area: 'personalizacion',
    name: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      // Get avatar
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Check permissions (admin or consultor)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const hasAdminAccess = roles?.some(r => ['admin', 'consultor'].includes(r.role_type)) || false;
      setHasPermission(hasAdminAccess);
    };

    checkAuth();
  }, [supabase, router]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres';
    }

    if (!formData.area) {
      newErrors.area = 'El área de transformación es requerida';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/assessment-builder/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: formData.area,
          name: formData.name.trim(),
          description: formData.description?.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al crear el template');
      }

      toast.success('Template creado exitosamente');
      router.push(`/admin/assessment-builder/${data.template.id}`);
    } catch (error: any) {
      console.error('Error creating template:', error);
      toast.error(error.message || 'Error al crear el template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Loading state
  if (hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="assessment-builder"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Acceso Denegado</h1>
            <p className="text-gray-700 mb-6">No tienes permiso para crear templates de evaluación.</p>
            <Link href="/dashboard" legacyBehavior>
              <a className="px-6 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
                Ir al Panel
              </a>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="assessment-builder"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardList />}
        title="Constructor de Evaluaciones"
        subtitle="Crear nuevo template"
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link href="/admin/assessment-builder" legacyBehavior>
          <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a la lista
          </a>
        </Link>

        {/* Form Card */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-brand_blue">Nuevo Template de Evaluación</h2>
            <p className="mt-1 text-sm text-gray-500">
              Crea un nuevo template de evaluación para una vía de transformación
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Área de Transformación */}
            <div>
              <label htmlFor="area" className="block text-sm font-medium text-gray-700 mb-1">
                Área de Transformación <span className="text-red-500">*</span>
              </label>
              <select
                id="area"
                value={formData.area}
                onChange={(e) => setFormData({ ...formData, area: e.target.value as TransformationArea })}
                className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.area ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                {Object.entries(AREA_LABELS).map(([value, label]) => {
                  const status = AREA_STATUS[value as TransformationArea];
                  return (
                    <option key={value} value={value}>
                      {label} {status === 'coming_soon' ? '(Próximamente)' : ''}
                    </option>
                  );
                })}
              </select>
              {errors.area && <p className="mt-1 text-sm text-red-500">{errors.area}</p>}
              <p className="mt-1 text-xs text-gray-500">
                Selecciona la vía de transformación para este template
              </p>
            </div>

            {/* Nombre */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Template <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Evaluación de Personalización 2026"
                className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
            </div>

            {/* Descripción */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Descripción opcional del template..."
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue"
              />
              <p className="mt-1 text-xs text-gray-500">
                Una breve descripción del propósito de este template
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <Link href="/admin/assessment-builder" legacyBehavior>
                <a className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                  Cancelar
                </a>
              </Link>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-brand_blue/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <span className="animate-spin mr-2">&#9696;</span>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Crear Template
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default CreateTemplate;
