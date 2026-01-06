import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { ClipboardList, Plus, Edit2, Trash2, Eye, Archive, RotateCcw, Copy } from 'lucide-react';
import type { AssessmentTemplate, TransformationArea, Grade } from '@/types/assessment-builder';
import { AREA_LABELS } from '@/types/assessment-builder';

const STATUS_LABELS: Record<string, { label: string; bgColor: string; textColor: string }> = {
  draft: { label: 'Borrador', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
  published: { label: 'Publicado', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  archived: { label: 'Archivado', bgColor: 'bg-gray-100', textColor: 'text-gray-800' },
};

// Delete confirmation modal types
interface DeleteConfirmation {
  template: AssessmentTemplate;
  counts?: {
    instances: number;
    responses: number;
    snapshots: number;
    modules: number;
  };
}

const AssessmentBuilderIndex: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [templates, setTemplates] = useState<AssessmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);

  // Duplicate modal state
  const [duplicateModal, setDuplicateModal] = useState<{ template: AssessmentTemplate } | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateGradeId, setDuplicateGradeId] = useState<number | ''>('');
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);

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

  // Fetch grades for duplicate modal
  useEffect(() => {
    const fetchGrades = async () => {
      try {
        const response = await fetch('/api/admin/assessment-builder/grades');
        if (response.ok) {
          const data = await response.json();
          setGrades(data.grades || []);
        }
      } catch (error) {
        console.error('Error fetching grades:', error);
      }
    };

    fetchGrades();
  }, []);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    if (!user || hasPermission === false) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (areaFilter) params.append('area', areaFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      // Pass archived filter based on active tab
      params.append('archived', activeTab === 'archived' ? 'true' : 'false');

      const response = await fetch(`/api/admin/assessment-builder/templates?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      toast.error(error.message || 'Error al cargar templates');
    } finally {
      setLoading(false);
    }
  }, [user, hasPermission, statusFilter, areaFilter, searchQuery, activeTab]);

  useEffect(() => {
    if (user && hasPermission === true) {
      fetchTemplates();
    }
  }, [user, hasPermission, fetchTemplates]);

  // Delete template - first checks if confirmation is needed
  const handleDelete = async (template: AssessmentTemplate) => {
    // Draft templates - simple confirmation
    if (template.status === 'draft') {
      if (!confirm(`¿Estás seguro de eliminar el template "${template.name}"? Esta acción no se puede deshacer.`)) {
        return;
      }
      await executeDelete(template.id);
      return;
    }

    // Archived templates - check for related data first
    if (!template.is_archived) {
      toast.error('Los templates publicados deben ser archivados antes de eliminarse');
      return;
    }

    // Check if there's related data
    setIsDeleting(template.id);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.requiresConfirmation) {
        // Show confirmation modal
        setDeleteConfirmation({
          template,
          counts: data.counts,
        });
        setIsDeleting(null);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Error al eliminar template');
      }

      toast.success('Template eliminado correctamente');
      setTemplates(prev => prev.filter(t => t.id !== template.id));
    } catch (error: any) {
      console.error('Error deleting template:', error);
      toast.error(error.message || 'Error al eliminar template');
    } finally {
      setIsDeleting(null);
    }
  };

  // Execute delete with confirmation
  const executeDelete = async (templateId: string, confirm = false) => {
    setIsDeleting(templateId);
    try {
      const url = confirm
        ? `/api/admin/assessment-builder/templates/${templateId}?confirm=true`
        : `/api/admin/assessment-builder/templates/${templateId}`;

      const response = await fetch(url, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al eliminar template');
      }

      toast.success('Template eliminado correctamente');
      setTemplates(prev => prev.filter(t => t.id !== templateId));
      setDeleteConfirmation(null);
    } catch (error: any) {
      console.error('Error deleting template:', error);
      toast.error(error.message || 'Error al eliminar template');
    } finally {
      setIsDeleting(null);
    }
  };

  // Archive a published template
  const handleArchive = async (template: AssessmentTemplate) => {
    if (template.status !== 'published' || template.is_archived) {
      return;
    }

    if (!confirm(`¿Estás seguro de archivar el template "${template.name}"? No podrá ser usado para nuevas evaluaciones.`)) {
      return;
    }

    setIsArchiving(template.id);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/archive`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al archivar template');
      }

      toast.success('Template archivado correctamente');
      // Remove from active list (will appear in archived tab)
      setTemplates(prev => prev.filter(t => t.id !== template.id));
    } catch (error: any) {
      console.error('Error archiving template:', error);
      toast.error(error.message || 'Error al archivar template');
    } finally {
      setIsArchiving(null);
    }
  };

  // Restore an archived template
  const handleRestore = async (template: AssessmentTemplate) => {
    if (!template.is_archived) {
      return;
    }

    setIsArchiving(template.id);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/archive?action=restore`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al restaurar template');
      }

      toast.success('Template restaurado correctamente');
      // Remove from archived list (will appear in active tab)
      setTemplates(prev => prev.filter(t => t.id !== template.id));
    } catch (error: any) {
      console.error('Error restoring template:', error);
      toast.error(error.message || 'Error al restaurar template');
    } finally {
      setIsArchiving(null);
    }
  };

  // Open duplicate modal
  const openDuplicateModal = (template: AssessmentTemplate) => {
    setDuplicateModal({ template });
    setDuplicateName(`${template.name} (copia)`);
    setDuplicateGradeId(template.grade_id || '');
  };

  // Close duplicate modal
  const closeDuplicateModal = () => {
    setDuplicateModal(null);
    setDuplicateName('');
    setDuplicateGradeId('');
  };

  // Handle duplicate submission
  const handleDuplicate = async () => {
    if (!duplicateModal || !duplicateName.trim() || !duplicateGradeId) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${duplicateModal.template.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: duplicateName.trim(),
          grade_id: duplicateGradeId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al duplicar template');
      }

      toast.success(`Template duplicado exitosamente: ${data.stats.modules} módulos, ${data.stats.indicators} indicadores, ${data.stats.expectations} expectativas copiadas`);
      closeDuplicateModal();

      // Redirect to new template
      router.push(`/admin/assessment-builder/${data.template.id}`);
    } catch (error: any) {
      console.error('Error duplicating template:', error);
      toast.error(error.message || 'Error al duplicar template');
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Loading state
  if (loading && hasPermission === null) {
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
            <p className="text-gray-700 mb-6">No tienes permiso para acceder al Constructor de Evaluaciones.</p>
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

  // Filter templates by search
  const filteredTemplates = templates.filter(t => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(query) ||
      (t.description?.toLowerCase().includes(query)) ||
      AREA_LABELS[t.area].toLowerCase().includes(query)
    );
  });

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
        subtitle={`${templates.length} template${templates.length !== 1 ? 's' : ''}`}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar templates..."
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('active')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'active'
                  ? 'border-brand_blue text-brand_blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Activos
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'archived'
                  ? 'border-brand_blue text-brand_blue'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Archive className="w-4 h-4 inline mr-1" />
              Archivados
            </button>
          </nav>
        </div>

        {/* Filters and Create Button */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_blue"
            >
              <option value="">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
            </select>

            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_blue"
            >
              <option value="">Todas las áreas</option>
              {Object.entries(AREA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {activeTab === 'active' && (
            <Link href="/admin/assessment-builder/create" legacyBehavior>
              <a className="inline-flex items-center justify-center px-4 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-brand_blue/90 transition-colors text-sm font-medium">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Template
              </a>
            </Link>
          )}
        </div>

        {/* Templates List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Cargando templates...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            {activeTab === 'archived' ? (
              <>
                <Archive className="mx-auto h-16 w-16 text-gray-300" />
                <h3 className="mt-4 text-xl font-semibold text-gray-600">
                  No hay templates archivados
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Los templates archivados aparecerán aquí
                </p>
              </>
            ) : (
              <>
                <ClipboardList className="mx-auto h-16 w-16 text-brand_blue/30" />
                <h3 className="mt-4 text-xl font-semibold text-brand_blue">
                  {templates.length === 0 ? 'No hay templates todavía' : 'No se encontraron templates'}
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  {templates.length === 0
                    ? '¡Comienza creando tu primer template de evaluación!'
                    : 'Intenta con otros términos de búsqueda o filtros'}
                </p>
                {templates.length === 0 && (
                  <div className="mt-8">
                    <Link href="/admin/assessment-builder/create" legacyBehavior>
                      <a className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md shadow-sm text-white bg-brand_blue hover:bg-brand_blue/90 transition-colors">
                        <Plus className="w-4 h-4 mr-2" />
                        Crear Template
                      </a>
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Área
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Versión
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actualizado
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTemplates.map((template) => {
                  const statusStyle = STATUS_LABELS[template.status] || STATUS_LABELS.draft;
                  return (
                    <tr key={template.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900">{template.name}</div>
                          {template.grade && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              template.grade.is_always_gt
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {template.grade.name}
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">{template.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{AREA_LABELS[template.area]}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500">{template.version}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyle.bgColor} ${statusStyle.textColor}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(template.updated_at).toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {/* View/Edit button - Eye for archived, Pencil for draft/published */}
                          <Link href={`/admin/assessment-builder/${template.id}`} legacyBehavior>
                            <a
                              className="p-2 text-brand_blue hover:bg-brand_blue/10 rounded-lg transition-colors"
                              title={template.is_archived ? 'Ver' : 'Editar'}
                            >
                              {template.is_archived ? (
                                <Eye className="w-4 h-4" />
                              ) : (
                                <Edit2 className="w-4 h-4" />
                              )}
                            </a>
                          </Link>

                          {/* Duplicate button - for non-archived templates */}
                          {!template.is_archived && (
                            <button
                              onClick={() => openDuplicateModal(template)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Duplicar"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {/* Archive button - for published, non-archived templates */}
                          {template.status === 'published' && !template.is_archived && (
                            <button
                              onClick={() => handleArchive(template)}
                              disabled={isArchiving === template.id}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                              title="Archivar"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}

                          {/* Restore button - for archived templates */}
                          {template.is_archived && (
                            <button
                              onClick={() => handleRestore(template)}
                              disabled={isArchiving === template.id}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Restaurar"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete button - for draft templates OR archived templates */}
                          {(template.status === 'draft' || template.is_archived) && (
                            <button
                              onClick={() => handleDelete(template)}
                              disabled={isDeleting === template.id}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirmar Eliminación
            </h3>
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de eliminar el template <strong>"{deleteConfirmation.template.name}"</strong>?
            </p>
            {deleteConfirmation.counts && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 font-medium mb-2">
                  ⚠️ Este template tiene datos asociados:
                </p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• {deleteConfirmation.counts.instances} evaluaciones</li>
                  <li>• {deleteConfirmation.counts.responses} respuestas</li>
                  <li>• {deleteConfirmation.counts.snapshots} versiones guardadas</li>
                  <li>• {deleteConfirmation.counts.modules} módulos</li>
                </ul>
                <p className="text-sm text-red-800 font-medium mt-3">
                  Esta acción es permanente y no se puede deshacer.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeDelete(deleteConfirmation.template.id, true)}
                disabled={isDeleting === deleteConfirmation.template.id}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting === deleteConfirmation.template.id ? 'Eliminando...' : 'Eliminar Permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Template Modal */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Duplicar Template
            </h3>
            <p className="text-gray-600 mb-4">
              Se creará una copia del template <strong>&quot;{duplicateModal.template.name}&quot;</strong> con todos sus módulos, indicadores y expectativas.
            </p>

            <div className="space-y-4">
              {/* Name input */}
              <div>
                <label htmlFor="duplicate-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del nuevo template <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="duplicate-name"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue"
                  placeholder="Nombre del template"
                />
              </div>

              {/* Grade selector */}
              <div>
                <label htmlFor="duplicate-grade" className="block text-sm font-medium text-gray-700 mb-1">
                  Nivel <span className="text-red-500">*</span>
                </label>
                <select
                  id="duplicate-grade"
                  value={duplicateGradeId}
                  onChange={(e) => setDuplicateGradeId(e.target.value ? Number(e.target.value) : '')}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue focus:border-brand_blue"
                >
                  <option value="">Selecciona un nivel</option>
                  {grades.map((grade) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name} {grade.is_always_gt ? '(GT)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Puede ser el mismo nivel que el original o diferente.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeDuplicateModal}
                disabled={isDuplicating}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDuplicate}
                disabled={isDuplicating || !duplicateName.trim() || !duplicateGradeId}
                className="px-4 py-2 bg-brand_blue text-white hover:bg-brand_blue/90 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDuplicating ? 'Duplicando...' : 'Duplicar Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default AssessmentBuilderIndex;
