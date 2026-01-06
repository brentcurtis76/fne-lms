import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ClipboardList,
  ArrowLeft,
  Save,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Upload,
  Copy,
  History,
  Lock,
  Eye,
  Target,
  Archive,
  RotateCcw,
} from 'lucide-react';
import type {
  AssessmentTemplate,
  AssessmentModule,
  AssessmentIndicator,
  TransformationArea,
  IndicatorCategory,
  FrequencyUnit,
  UpdateTemplateRequest,
  CreateModuleRequest,
  UpdateModuleRequest,
} from '@/types/assessment-builder';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  FREQUENCY_UNIT_OPTIONS,
  FREQUENCY_UNIT_LABELS,
  DEFAULT_FREQUENCY_UNIT_OPTIONS,
} from '@/types/assessment-builder';

const STATUS_LABELS: Record<string, { label: string; bgColor: string; textColor: string }> = {
  draft: { label: 'Borrador', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
  published: { label: 'Publicado', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  archived: { label: 'Archivado', bgColor: 'bg-gray-100', textColor: 'text-gray-800' },
};

interface IndicatorData {
  id: string;
  moduleId: string;
  code?: string;
  name: string;
  description?: string;
  category: IndicatorCategory;
  frequencyConfig?: { unit?: string; min?: number; max?: number };
  frequencyUnitOptions?: FrequencyUnit[];
  level0Descriptor?: string;
  level1Descriptor?: string;
  level2Descriptor?: string;
  level3Descriptor?: string;
  level4Descriptor?: string;
  displayOrder: number;
  weight: number;
  isActive: boolean;
}

interface ModuleWithIndicators extends Omit<AssessmentModule, 'indicators'> {
  indicators?: IndicatorData[];
  isExpanded?: boolean;
  indicatorsLoaded?: boolean;
}

const TemplateEditor: React.FC = () => {
  const router = useRouter();
  const { templateId } = router.query;
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Template state
  const [template, setTemplate] = useState<AssessmentTemplate | null>(null);
  const [modules, setModules] = useState<ModuleWithIndicators[]>([]);

  // Edit template modal
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  });

  // Module modal
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleWithIndicators | null>(null);
  const [moduleForm, setModuleForm] = useState<{
    name: string;
    description: string;
    instructions: string;
    weight: number;
  }>({
    name: '',
    description: '',
    instructions: '',
    weight: 1,
  });

  // Indicator modal
  const [isIndicatorModalOpen, setIsIndicatorModalOpen] = useState(false);
  const [indicatorModuleId, setIndicatorModuleId] = useState<string | null>(null);
  const [editingIndicator, setEditingIndicator] = useState<IndicatorData | null>(null);
  const [indicatorForm, setIndicatorForm] = useState<{
    code: string;
    name: string;
    description: string;
    category: IndicatorCategory;
    frequencyUnit: string;
    frequencyUnitOptions: FrequencyUnit[];
    level0Descriptor: string;
    level1Descriptor: string;
    level2Descriptor: string;
    level3Descriptor: string;
    level4Descriptor: string;
    weight: number;
  }>({
    code: '',
    name: '',
    description: '',
    category: 'cobertura',
    frequencyUnit: 'veces',
    frequencyUnitOptions: [...DEFAULT_FREQUENCY_UNIT_OPTIONS],
    level0Descriptor: '',
    level1Descriptor: '',
    level2Descriptor: '',
    level3Descriptor: '',
    level4Descriptor: '',
    weight: 1,
  });

  // Publishing state
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Usage stats for warning banner
  const [usageStats, setUsageStats] = useState<{
    instanceCount: number;
    responseCount: number;
    hasResponses: boolean;
  } | null>(null);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [hasAcknowledgedWarning, setHasAcknowledgedWarning] = useState(false);

  // Archive/Delete state
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState<{
    counts?: { instances: number; responses: number; snapshots: number; modules: number };
  } | null>(null);

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

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

  // Fetch template and modules
  const fetchTemplate = useCallback(async () => {
    if (!templateId || typeof templateId !== 'string' || !user || hasPermission === false) return;

    setLoading(true);
    try {
      // Fetch template
      const templateRes = await fetch(`/api/admin/assessment-builder/templates/${templateId}`);
      if (!templateRes.ok) {
        const data = await templateRes.json();
        throw new Error(data.error || 'Error al cargar el template');
      }
      const templateData = await templateRes.json();
      setTemplate(templateData.template);
      setTemplateForm({
        name: templateData.template.name,
        description: templateData.template.description || '',
      });
      // Store usage stats for published templates
      if (templateData.usageStats) {
        setUsageStats(templateData.usageStats);
      }

      // Fetch modules
      const modulesRes = await fetch(`/api/admin/assessment-builder/templates/${templateId}/modules`);
      if (modulesRes.ok) {
        const modulesData = await modulesRes.json();
        setModules((modulesData.modules || []).map((m: AssessmentModule) => ({ ...m, isExpanded: false })));
      }
    } catch (error: any) {
      console.error('Error fetching template:', error);
      toast.error(error.message || 'Error al cargar el template');
      router.push('/admin/assessment-builder');
    } finally {
      setLoading(false);
    }
  }, [templateId, user, hasPermission, router]);

  useEffect(() => {
    if (user && hasPermission === true && templateId) {
      fetchTemplate();
    }
  }, [user, hasPermission, templateId, fetchTemplate]);

  // Update template
  const handleUpdateTemplate = async () => {
    if (!template) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateForm.name.trim(),
          description: templateForm.description.trim() || undefined,
        } as UpdateTemplateRequest),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al actualizar el template');
      }

      const data = await response.json();
      setTemplate(data.template);
      setIsEditingTemplate(false);
      toast.success('Template actualizado');
    } catch (error: any) {
      console.error('Error updating template:', error);
      toast.error(error.message || 'Error al actualizar el template');
    } finally {
      setIsSaving(false);
    }
  };

  // Module CRUD
  const openModuleModal = (module?: ModuleWithIndicators) => {
    if (module) {
      setEditingModule(module);
      setModuleForm({
        name: module.name,
        description: module.description || '',
        instructions: module.instructions || '',
        weight: module.weight,
      });
    } else {
      setEditingModule(null);
      setModuleForm({ name: '', description: '', instructions: '', weight: 1 });
    }
    setIsModuleModalOpen(true);
  };

  const handleSaveModule = async () => {
    if (!template) return;
    if (!moduleForm.name.trim()) {
      toast.error('El nombre del módulo es requerido');
      return;
    }

    setIsSaving(true);
    try {
      if (editingModule) {
        // Update module
        const response = await fetch(
          `/api/admin/assessment-builder/templates/${template.id}/modules/${editingModule.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: moduleForm.name.trim(),
              description: moduleForm.description.trim() || undefined,
              instructions: moduleForm.instructions.trim() || undefined,
              weight: moduleForm.weight,
            } as UpdateModuleRequest),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Error al actualizar el módulo');
        }

        const data = await response.json();
        setModules(prev =>
          prev.map(m => (m.id === editingModule.id ? { ...data.module, isExpanded: m.isExpanded } : m))
        );
        toast.success('Módulo actualizado');
      } else {
        // Create module
        const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/modules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: template.id,
            name: moduleForm.name.trim(),
            description: moduleForm.description.trim() || undefined,
            instructions: moduleForm.instructions.trim() || undefined,
            weight: moduleForm.weight,
          } as CreateModuleRequest),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Error al crear el módulo');
        }

        const data = await response.json();
        setModules(prev => [...prev, { ...data.module, isExpanded: false }]);
        toast.success('Módulo creado');
      }

      setIsModuleModalOpen(false);
    } catch (error: any) {
      console.error('Error saving module:', error);
      toast.error(error.message || 'Error al guardar el módulo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteModule = async (module: ModuleWithIndicators) => {
    if (!template) return;
    if (!confirm(`¿Estás seguro de eliminar el módulo "${module.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/assessment-builder/templates/${template.id}/modules/${module.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al eliminar el módulo');
      }

      setModules(prev => prev.filter(m => m.id !== module.id));
      toast.success('Módulo eliminado');
    } catch (error: any) {
      console.error('Error deleting module:', error);
      toast.error(error.message || 'Error al eliminar el módulo');
    }
  };

  // Indicator CRUD
  const openIndicatorModal = (moduleId: string, indicator?: IndicatorData) => {
    setIndicatorModuleId(moduleId);
    if (indicator) {
      setEditingIndicator(indicator);
      setIndicatorForm({
        code: indicator.code || '',
        name: indicator.name,
        description: indicator.description || '',
        category: indicator.category,
        frequencyUnit: indicator.frequencyConfig?.unit || 'veces',
        frequencyUnitOptions: indicator.frequencyUnitOptions || [...DEFAULT_FREQUENCY_UNIT_OPTIONS],
        level0Descriptor: indicator.level0Descriptor || '',
        level1Descriptor: indicator.level1Descriptor || '',
        level2Descriptor: indicator.level2Descriptor || '',
        level3Descriptor: indicator.level3Descriptor || '',
        level4Descriptor: indicator.level4Descriptor || '',
        weight: indicator.weight,
      });
    } else {
      setEditingIndicator(null);
      setIndicatorForm({
        code: '',
        name: '',
        description: '',
        category: 'cobertura',
        frequencyUnit: 'veces',
        frequencyUnitOptions: [...DEFAULT_FREQUENCY_UNIT_OPTIONS],
        level0Descriptor: '',
        level1Descriptor: '',
        level2Descriptor: '',
        level3Descriptor: '',
        level4Descriptor: '',
        weight: 1,
      });
    }
    setIsIndicatorModalOpen(true);
  };

  const handleSaveIndicator = async () => {
    if (!template || !indicatorModuleId) return;
    if (!indicatorForm.name.trim()) {
      toast.error('El nombre del indicador es requerido');
      return;
    }

    // For profundidad, require at least one level descriptor
    if (indicatorForm.category === 'profundidad') {
      const hasDescriptor =
        indicatorForm.level0Descriptor.trim() ||
        indicatorForm.level1Descriptor.trim() ||
        indicatorForm.level2Descriptor.trim() ||
        indicatorForm.level3Descriptor.trim() ||
        indicatorForm.level4Descriptor.trim();
      if (!hasDescriptor) {
        toast.error('Los indicadores de profundidad requieren al menos un descriptor de nivel');
        return;
      }
    }

    // For frecuencia, require at least one unit option
    if (indicatorForm.category === 'frecuencia') {
      if (indicatorForm.frequencyUnitOptions.length === 0) {
        toast.error('Los indicadores de frecuencia requieren al menos un período permitido');
        return;
      }
    }

    setIsSaving(true);
    try {
      const body: any = {
        name: indicatorForm.name.trim(),
        description: indicatorForm.description.trim() || undefined,
        category: indicatorForm.category,
        weight: indicatorForm.weight,
      };

      if (indicatorForm.code.trim()) {
        body.code = indicatorForm.code.trim();
      }

      if (indicatorForm.category === 'frecuencia') {
        body.frequencyConfig = { unit: indicatorForm.frequencyUnit || 'veces' };
        body.frequencyUnitOptions = indicatorForm.frequencyUnitOptions;
      }

      if (indicatorForm.category === 'profundidad') {
        body.level0Descriptor = indicatorForm.level0Descriptor.trim() || undefined;
        body.level1Descriptor = indicatorForm.level1Descriptor.trim() || undefined;
        body.level2Descriptor = indicatorForm.level2Descriptor.trim() || undefined;
        body.level3Descriptor = indicatorForm.level3Descriptor.trim() || undefined;
        body.level4Descriptor = indicatorForm.level4Descriptor.trim() || undefined;
      }

      if (editingIndicator) {
        // Update indicator
        const response = await fetch(
          `/api/admin/assessment-builder/templates/${template.id}/modules/${indicatorModuleId}/indicators/${editingIndicator.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Error al actualizar el indicador');
        }

        const data = await response.json();
        setModules(prev =>
          prev.map(m =>
            m.id === indicatorModuleId
              ? {
                  ...m,
                  indicators: (m.indicators || []).map(ind =>
                    ind.id === editingIndicator.id ? data.indicator : ind
                  ),
                }
              : m
          )
        );
        toast.success('Indicador actualizado');
      } else {
        // Create indicator
        const response = await fetch(
          `/api/admin/assessment-builder/templates/${template.id}/modules/${indicatorModuleId}/indicators`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Error al crear el indicador');
        }

        const data = await response.json();
        setModules(prev =>
          prev.map(m =>
            m.id === indicatorModuleId
              ? { ...m, indicators: [...(m.indicators || []), data.indicator] }
              : m
          )
        );
        toast.success('Indicador creado');
      }

      setIsIndicatorModalOpen(false);
    } catch (error: any) {
      console.error('Error saving indicator:', error);
      toast.error(error.message || 'Error al guardar el indicador');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteIndicator = async (moduleId: string, indicator: IndicatorData) => {
    if (!template) return;
    if (!confirm(`¿Estás seguro de eliminar el indicador "${indicator.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/assessment-builder/templates/${template.id}/modules/${moduleId}/indicators/${indicator.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al eliminar el indicador');
      }

      setModules(prev =>
        prev.map(m =>
          m.id === moduleId
            ? { ...m, indicators: (m.indicators || []).filter(ind => ind.id !== indicator.id) }
            : m
        )
      );
      toast.success('Indicador eliminado');
    } catch (error: any) {
      console.error('Error deleting indicator:', error);
      toast.error(error.message || 'Error al eliminar el indicador');
    }
  };

  // Publishing functions
  const handlePublish = async () => {
    if (!template) return;

    // Count total indicators
    let totalIndicators = 0;
    for (const module of modules) {
      if (module.indicators) {
        totalIndicators += module.indicators.length;
      }
    }

    if (modules.length === 0) {
      toast.error('El template debe tener al menos un módulo para ser publicado');
      return;
    }

    if (totalIndicators === 0) {
      toast.error('El template debe tener al menos un indicador para ser publicado');
      return;
    }

    if (!confirm(`¿Estás seguro de publicar este template? Una vez publicado, no podrá ser editado directamente.`)) {
      return;
    }

    // Ask if they want to upgrade existing assignments
    const upgradeExisting = confirm(
      '¿Deseas crear nuevas evaluaciones para docentes que ya tienen asignaciones previas de este template?\n\n' +
      'Si seleccionas "Aceptar", los docentes verán la nueva versión en su lista.\n' +
      'Si seleccionas "Cancelar", solo nuevas asignaciones usarán esta versión.'
    );

    setIsPublishing(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upgradeExisting }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al publicar');
      }

      const data = await response.json();
      setTemplate(prev => prev ? { ...prev, status: 'published', version: data.template.version } : null);

      // Show upgrade results if applicable
      let message = data.message || 'Template publicado correctamente';
      if (data.upgrade?.instancesCreated > 0) {
        message += `. Se crearon ${data.upgrade.instancesCreated} nuevas evaluaciones para docentes existentes.`;
      }
      toast.success(message);
    } catch (error: any) {
      console.error('Error publishing:', error);
      toast.error(error.message || 'Error al publicar template');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDuplicate = async () => {
    if (!template) return;

    // Different message for published vs draft templates
    const confirmMessage = template.status === 'published'
      ? 'Este template está publicado y no puede modificarse directamente.\n\n¿Deseas crear una nueva versión borrador para editar?'
      : '¿Crear una copia borrador de este template?';

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/duplicate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al duplicar');
      }

      const data = await response.json();
      toast.success('Nueva versión borrador creada. Ahora puedes editar.');
      // Navigate to the new template
      router.push(`/admin/assessment-builder/${data.template.id}`);
    } catch (error: any) {
      console.error('Error duplicating:', error);
      toast.error(error.message || 'Error al duplicar template');
    } finally {
      setIsDuplicating(false);
    }
  };

  const openVersionHistory = async () => {
    if (!template) return;
    setIsVersionHistoryOpen(true);
    setLoadingVersions(true);

    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/versions`);
      if (response.ok) {
        const data = await response.json();
        setVersions(data.versions || []);
      }
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Archive a published template
  const handleArchive = async () => {
    if (!template || template.status !== 'published' || template.is_archived) return;

    if (!confirm(`¿Estás seguro de archivar este template? No podrá ser usado para nuevas evaluaciones.`)) {
      return;
    }

    setIsArchiving(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/archive`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al archivar template');
      }

      toast.success('Template archivado correctamente');
      router.push('/admin/assessment-builder');
    } catch (error: any) {
      console.error('Error archiving:', error);
      toast.error(error.message || 'Error al archivar template');
    } finally {
      setIsArchiving(false);
    }
  };

  // Restore an archived template
  const handleRestore = async () => {
    if (!template || !template.is_archived) return;

    setIsArchiving(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}/archive?action=restore`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al restaurar template');
      }

      toast.success('Template restaurado correctamente');
      // Reload to update is_archived state
      fetchTemplate();
    } catch (error: any) {
      console.error('Error restoring:', error);
      toast.error(error.message || 'Error al restaurar template');
    } finally {
      setIsArchiving(false);
    }
  };

  // Delete template (with confirmation for templates with data)
  const handleDelete = async () => {
    if (!template) return;

    // Draft templates - simple confirmation
    if (template.status === 'draft') {
      if (!confirm(`¿Estás seguro de eliminar el template "${template.name}"? Esta acción no se puede deshacer.`)) {
        return;
      }
      await executeDelete();
      return;
    }

    // Non-archived published templates can't be deleted
    if (!template.is_archived) {
      toast.error('Los templates publicados deben ser archivados antes de eliminarse');
      return;
    }

    // Check for related data first
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/assessment-builder/templates/${template.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.requiresConfirmation) {
        // Show confirmation modal
        setDeleteConfirmData({ counts: data.counts });
        setShowDeleteConfirm(true);
        setIsDeleting(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Error al eliminar template');
      }

      toast.success('Template eliminado correctamente');
      router.push('/admin/assessment-builder');
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(error.message || 'Error al eliminar template');
      setIsDeleting(false);
    }
  };

  // Execute delete with confirmation
  const executeDelete = async (withConfirm = false) => {
    if (!template) return;

    setIsDeleting(true);
    try {
      const url = withConfirm
        ? `/api/admin/assessment-builder/templates/${template.id}?confirm=true`
        : `/api/admin/assessment-builder/templates/${template.id}`;

      const response = await fetch(url, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al eliminar template');
      }

      toast.success('Template eliminado correctamente');
      router.push('/admin/assessment-builder');
    } catch (error: any) {
      console.error('Error deleting:', error);
      toast.error(error.message || 'Error al eliminar template');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const toggleModuleExpand = async (moduleId: string) => {
    const module = modules.find(m => m.id === moduleId);
    if (!module) return;

    // If expanding and indicators not loaded yet, fetch them
    if (!module.isExpanded && !module.indicatorsLoaded && template) {
      try {
        const response = await fetch(
          `/api/admin/assessment-builder/templates/${template.id}/modules/${moduleId}/indicators`
        );
        if (response.ok) {
          const data = await response.json();
          setModules(prev =>
            prev.map(m =>
              m.id === moduleId
                ? { ...m, isExpanded: true, indicators: data.indicators || [], indicatorsLoaded: true }
                : m
            )
          );
          return;
        }
      } catch (error) {
        console.error('Error fetching indicators:', error);
      }
    }

    setModules(prev =>
      prev.map(m => (m.id === moduleId ? { ...m, isExpanded: !m.isExpanded } : m))
    );
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Loading state
  if (loading || hasPermission === null) {
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
            <p className="text-gray-700 mb-6">No tienes permiso para editar templates de evaluación.</p>
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

  if (!template) {
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
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Template no encontrado</h1>
            <Link href="/admin/assessment-builder" legacyBehavior>
              <a className="px-6 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
                Volver a la lista
              </a>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  const statusStyle = STATUS_LABELS[template.status] || STATUS_LABELS.draft;
  const isDraft = template.status === 'draft';
  const isArchived = template.is_archived === true;
  // canEdit: Allow editing if not archived (both draft and published can be edited)
  const canEdit = !isArchived;

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
        subtitle={template.name}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link href="/admin/assessment-builder" legacyBehavior>
          <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a la lista
          </a>
        </Link>

        {/* Warning banner for published templates with responses */}
        {!isDraft && usageStats?.hasResponses && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 text-amber-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-amber-800">
                  Este template tiene evaluaciones en uso
                </h4>
                <p className="text-sm text-amber-700 mt-1">
                  Hay {usageStats.instanceCount} evaluación{usageStats.instanceCount !== 1 ? 'es' : ''} asignada{usageStats.instanceCount !== 1 ? 's' : ''} con {usageStats.responseCount} respuesta{usageStats.responseCount !== 1 ? 's' : ''} registrada{usageStats.responseCount !== 1 ? 's' : ''}.
                  Los cambios que realices afectarán a las nuevas evaluaciones. Las respuestas existentes mantendrán su snapshot actual.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Template Info Card */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {isEditingTemplate ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                      <input
                        type="text"
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                      <textarea
                        value={templateForm.description}
                        onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                        rows={2}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdateTemplate}
                        disabled={isSaving}
                        className="px-3 py-1.5 bg-brand_blue text-white rounded text-sm hover:bg-brand_blue/90 disabled:opacity-50"
                      >
                        {isSaving ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingTemplate(false);
                          setTemplateForm({ name: template.name, description: template.description || '' });
                        }}
                        className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl font-semibold text-brand_blue">{template.name}</h2>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyle.bgColor} ${statusStyle.textColor}`}>
                        {statusStyle.label}
                      </span>
                    </div>
                    {template.description && (
                      <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Área: {AREA_LABELS[template.area]}</span>
                      <span>Versión: {template.version}</span>
                    </div>
                  </>
                )}
              </div>
              {!isEditingTemplate && (
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingTemplate(true)}
                      className="p-2 text-gray-500 hover:text-brand_blue hover:bg-gray-100 rounded-lg transition-colors"
                      title="Editar información"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={openVersionHistory}
                    className="p-2 text-gray-500 hover:text-brand_blue hover:bg-gray-100 rounded-lg transition-colors"
                    title="Historial de versiones"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Publishing Actions */}
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
            {isDraft ? (
              <>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Edit2 className="w-4 h-4" />
                  <span>Modo edición - Puedes modificar el template</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="inline-flex items-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    title="Eliminar template"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {isDeleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                  <Link href={`/admin/assessment-builder/${template.id}/expectations`} legacyBehavior>
                    <a className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg shadow hover:bg-amber-700 transition-colors text-sm font-medium">
                      <Target className="w-4 h-4 mr-2" />
                      Expectativas
                    </a>
                  </Link>
                  <button
                    onClick={handlePublish}
                    disabled={isPublishing || modules.length === 0}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title={modules.length === 0 ? 'Agrega módulos e indicadores antes de publicar' : 'Publicar template'}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {isPublishing ? 'Publicando...' : 'Publicar'}
                  </button>
                </div>
              </>
            ) : isArchived ? (
              <>
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <Archive className="w-4 h-4" />
                  <span>Template archivado v{template.version} - No disponible para nuevas evaluaciones</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="inline-flex items-center px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    title="Eliminar template"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {isDeleting ? 'Eliminando...' : 'Eliminar'}
                  </button>
                  <button
                    onClick={handleRestore}
                    disabled={isArchiving}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {isArchiving ? 'Restaurando...' : 'Restaurar'}
                  </button>
                  <button
                    onClick={handleDuplicate}
                    disabled={isDuplicating}
                    className="inline-flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-brand_blue/90 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    {isDuplicating ? 'Creando borrador...' : 'Editar (Nueva Versión)'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <Edit2 className="w-4 h-4" />
                  <span>Template publicado v{template.version} - Puedes editar</span>
                  {usageStats?.hasResponses && (
                    <span className="text-xs text-amber-600 ml-2">(con {usageStats.responseCount} respuestas)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleArchive}
                    disabled={isArchiving}
                    className="inline-flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    title="Archivar template"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    {isArchiving ? 'Archivando...' : 'Archivar'}
                  </button>
                  <Link href={`/admin/assessment-builder/${template.id}/expectations`} legacyBehavior>
                    <a className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg shadow hover:bg-amber-700 transition-colors text-sm font-medium">
                      <Target className="w-4 h-4 mr-2" />
                      Expectativas
                    </a>
                  </Link>
                  <button
                    onClick={handleDuplicate}
                    disabled={isDuplicating}
                    className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg shadow hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50"
                    title="Crear copia borrador"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {isDuplicating ? 'Duplicando...' : 'Duplicar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modules Section */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-brand_blue">Módulos</h3>
              <p className="text-sm text-gray-500">{modules.length} módulo{modules.length !== 1 ? 's' : ''}</p>
            </div>
            {canEdit && (
              <button
                onClick={() => openModuleModal()}
                className="inline-flex items-center px-3 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-brand_blue/90 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-1" />
                Agregar Módulo
              </button>
            )}
          </div>

          {modules.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="mx-auto h-12 w-12 text-gray-300" />
              <h4 className="mt-4 text-lg font-medium text-gray-900">Sin módulos</h4>
              <p className="mt-2 text-sm text-gray-500">
                Agrega módulos para organizar los indicadores de evaluación
              </p>
              {canEdit && (
                <button
                  onClick={() => openModuleModal()}
                  className="mt-4 inline-flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg text-sm font-medium hover:bg-brand_blue/90"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Agregar Módulo
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {modules.map((module, index) => (
                <div key={module.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 text-gray-400">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => toggleModuleExpand(module.id)}
                        className="flex items-center gap-2 text-left w-full"
                      >
                        {module.isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-400">#{index + 1}</span>
                            <span className="font-medium text-gray-900">{module.name}</span>
                            <span className="text-xs text-gray-500">Peso: {module.weight}</span>
                          </div>
                          {module.description && (
                            <p className="text-sm text-gray-500 truncate">{module.description}</p>
                          )}
                        </div>
                      </button>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openModuleModal(module)}
                          className="p-2 text-gray-500 hover:text-brand_blue hover:bg-gray-100 rounded-lg transition-colors"
                          title="Editar módulo"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteModule(module)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar módulo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded content - indicators */}
                  {module.isExpanded && (
                    <div className="mt-4 ml-10 p-4 bg-gray-50 rounded-lg">
                      {module.instructions && (
                        <div className="mb-3">
                          <span className="text-xs font-medium text-gray-500">Instrucciones:</span>
                          <p className="text-sm text-gray-700">{module.instructions}</p>
                        </div>
                      )}

                      {/* Indicators section */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-gray-700">
                            Indicadores ({(module.indicators || []).length})
                          </h4>
                          {canEdit && (
                            <button
                              onClick={() => openIndicatorModal(module.id)}
                              className="inline-flex items-center px-2 py-1 text-xs bg-brand_blue text-white rounded hover:bg-brand_blue/90"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Agregar
                            </button>
                          )}
                        </div>

                        {!module.indicatorsLoaded ? (
                          <p className="text-sm text-gray-500">Cargando indicadores...</p>
                        ) : (module.indicators || []).length === 0 ? (
                          <p className="text-sm text-gray-500 italic">
                            Sin indicadores. {canEdit ? 'Agrega indicadores usando el botón de arriba.' : ''}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {(module.indicators || []).map((indicator, indIndex) => (
                              <div
                                key={indicator.id}
                                className="flex items-start justify-between p-3 bg-white rounded-lg border border-gray-200"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-gray-400">#{indIndex + 1}</span>
                                    {indicator.code && (
                                      <span className="text-xs font-mono bg-gray-100 px-1 rounded">
                                        {indicator.code}
                                      </span>
                                    )}
                                    <span className="font-medium text-gray-900 text-sm">
                                      {indicator.name}
                                    </span>
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full ${
                                        indicator.category === 'cobertura'
                                          ? 'bg-blue-100 text-blue-700'
                                          : indicator.category === 'frecuencia'
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-green-100 text-green-700'
                                      }`}
                                    >
                                      {CATEGORY_LABELS[indicator.category]}
                                    </span>
                                  </div>
                                  {indicator.description && (
                                    <p className="text-xs text-gray-500 truncate">
                                      {indicator.description}
                                    </p>
                                  )}
                                  {indicator.category === 'frecuencia' && indicator.frequencyConfig?.unit && (
                                    <p className="text-xs text-gray-400 mt-1">
                                      Unidad: {indicator.frequencyConfig.unit}
                                    </p>
                                  )}
                                  {indicator.category === 'profundidad' && (
                                    <p className="text-xs text-gray-400 mt-1">
                                      Niveles configurados: {
                                        [
                                          indicator.level0Descriptor,
                                          indicator.level1Descriptor,
                                          indicator.level2Descriptor,
                                          indicator.level3Descriptor,
                                          indicator.level4Descriptor,
                                        ].filter(Boolean).length
                                      }/5
                                    </p>
                                  )}
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-1 ml-2">
                                    <button
                                      onClick={() => openIndicatorModal(module.id, indicator)}
                                      className="p-1.5 text-gray-400 hover:text-brand_blue hover:bg-gray-100 rounded"
                                      title="Editar indicador"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteIndicator(module.id, indicator)}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                      title="Eliminar indicador"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Module Modal */}
      {isModuleModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => setIsModuleModalOpen(false)} />

            <div className="relative inline-block w-full max-w-lg p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <h3 className="text-lg font-semibold text-brand_blue mb-4">
                {editingModule ? 'Editar Módulo' : 'Nuevo Módulo'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={moduleForm.name}
                    onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })}
                    placeholder="Ej: Conocimiento del Estudiante"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea
                    value={moduleForm.description}
                    onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                    rows={2}
                    placeholder="Descripción del módulo..."
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Instrucciones</label>
                  <textarea
                    value={moduleForm.instructions}
                    onChange={(e) => setModuleForm({ ...moduleForm, instructions: e.target.value })}
                    rows={2}
                    placeholder="Instrucciones para completar este módulo..."
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Peso</label>
                  <input
                    type="number"
                    value={moduleForm.weight}
                    onChange={(e) => setModuleForm({ ...moduleForm, weight: parseFloat(e.target.value) || 1 })}
                    min={0}
                    step={0.1}
                    className="block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Peso relativo del módulo en el cálculo total
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsModuleModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveModule}
                  disabled={isSaving}
                  className="px-4 py-2 bg-brand_blue text-white rounded-lg text-sm font-medium hover:bg-brand_blue/90 disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingModule ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Indicator Modal */}
      {isIndicatorModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => setIsIndicatorModalOpen(false)} />

            <div className="relative inline-block w-full max-w-2xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-brand_blue mb-4">
                {editingIndicator ? 'Editar Indicador' : 'Nuevo Indicador'}
              </h3>

              <div className="space-y-4">
                {/* Basic info row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={indicatorForm.name}
                      onChange={(e) => setIndicatorForm({ ...indicatorForm, name: e.target.value })}
                      placeholder="Ej: Conocimiento de contextos"
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                    <input
                      type="text"
                      value={indicatorForm.code}
                      onChange={(e) => setIndicatorForm({ ...indicatorForm, code: e.target.value })}
                      placeholder="Ej: P1.1"
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                  <textarea
                    value={indicatorForm.description}
                    onChange={(e) => setIndicatorForm({ ...indicatorForm, description: e.target.value })}
                    rows={2}
                    placeholder="Descripción del indicador..."
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                  />
                </div>

                {/* Category and weight row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Categoría <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={indicatorForm.category}
                      onChange={(e) => setIndicatorForm({ ...indicatorForm, category: e.target.value as IndicatorCategory })}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                    >
                      <option value="cobertura">Cobertura (Sí/No)</option>
                      <option value="frecuencia">Frecuencia (Número)</option>
                      <option value="profundidad">Profundidad (Niveles 0-4)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Peso</label>
                    <input
                      type="number"
                      value={indicatorForm.weight}
                      onChange={(e) => setIndicatorForm({ ...indicatorForm, weight: parseFloat(e.target.value) || 1 })}
                      min={0}
                      step={0.1}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                    />
                  </div>
                </div>

                {/* Frequency config */}
                {indicatorForm.category === 'frecuencia' && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Períodos permitidos <span className="text-red-500">*</span>
                      <span className="text-xs font-normal text-gray-500 ml-2">
                        (selecciona al menos uno)
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      El docente podrá elegir entre estas opciones al responder
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {FREQUENCY_UNIT_OPTIONS.map((unit) => (
                        <label key={unit} className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={indicatorForm.frequencyUnitOptions.includes(unit)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setIndicatorForm({
                                  ...indicatorForm,
                                  frequencyUnitOptions: [...indicatorForm.frequencyUnitOptions, unit],
                                });
                              } else {
                                setIndicatorForm({
                                  ...indicatorForm,
                                  frequencyUnitOptions: indicatorForm.frequencyUnitOptions.filter((u) => u !== unit),
                                });
                              }
                            }}
                            className="w-4 h-4 text-brand_blue border-gray-300 rounded focus:ring-brand_blue"
                          />
                          <span className="text-sm text-gray-700 capitalize">
                            Por {FREQUENCY_UNIT_LABELS[unit]}
                          </span>
                        </label>
                      ))}
                    </div>
                    {indicatorForm.frequencyUnitOptions.length === 0 && (
                      <p className="text-xs text-red-500 mt-2">
                        Debes seleccionar al menos un período
                      </p>
                    )}
                  </div>
                )}

                {/* Profundidad level descriptors */}
                {indicatorForm.category === 'profundidad' && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                      Descriptores de nivel <span className="text-red-500">*</span>
                      <span className="text-xs font-normal text-gray-500 ml-2">
                        (al menos uno requerido)
                      </span>
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Nivel 0 - No implementado
                        </label>
                        <input
                          type="text"
                          value={indicatorForm.level0Descriptor}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, level0Descriptor: e.target.value })}
                          placeholder="Descriptor para nivel 0..."
                          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Nivel 1 - Inicial
                        </label>
                        <input
                          type="text"
                          value={indicatorForm.level1Descriptor}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, level1Descriptor: e.target.value })}
                          placeholder="Descriptor para nivel 1..."
                          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Nivel 2 - En desarrollo
                        </label>
                        <input
                          type="text"
                          value={indicatorForm.level2Descriptor}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, level2Descriptor: e.target.value })}
                          placeholder="Descriptor para nivel 2..."
                          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Nivel 3 - Consolidado
                        </label>
                        <input
                          type="text"
                          value={indicatorForm.level3Descriptor}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, level3Descriptor: e.target.value })}
                          placeholder="Descriptor para nivel 3..."
                          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Nivel 4 - Ejemplar
                        </label>
                        <input
                          type="text"
                          value={indicatorForm.level4Descriptor}
                          onChange={(e) => setIndicatorForm({ ...indicatorForm, level4Descriptor: e.target.value })}
                          placeholder="Descriptor para nivel 4..."
                          className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-brand_blue"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsIndicatorModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveIndicator}
                  disabled={isSaving}
                  className="px-4 py-2 bg-brand_blue text-white rounded-lg text-sm font-medium hover:bg-brand_blue/90 disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : editingIndicator ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {isVersionHistoryOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={() => setIsVersionHistoryOpen(false)} />

            <div className="relative inline-block w-full max-w-lg p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-brand_blue">
                  Historial de Versiones
                </h3>
                <button
                  onClick={() => setIsVersionHistoryOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              {loadingVersions ? (
                <div className="py-8 text-center text-gray-500">
                  Cargando versiones...
                </div>
              ) : versions.length === 0 ? (
                <div className="py-8 text-center">
                  <History className="mx-auto h-12 w-12 text-gray-300" />
                  <p className="mt-4 text-gray-500">
                    No hay versiones publicadas aún.
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Publica el template para crear la primera versión.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {versions.map((version: any) => (
                    <div
                      key={version.id}
                      className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">
                          Versión {version.version}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(version.createdAt).toLocaleDateString('es-CL', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{version.stats.modules} módulos</span>
                        <span>{version.stats.indicators} indicadores</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsVersionHistoryOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteConfirmData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirmar Eliminación
            </h3>
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de eliminar el template <strong>"{template.name}"</strong>?
            </p>
            {deleteConfirmData.counts && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 font-medium mb-2">
                  ⚠️ Este template tiene datos asociados:
                </p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• {deleteConfirmData.counts.instances} evaluaciones</li>
                  <li>• {deleteConfirmData.counts.responses} respuestas</li>
                  <li>• {deleteConfirmData.counts.snapshots} versiones guardadas</li>
                  <li>• {deleteConfirmData.counts.modules} módulos</li>
                </ul>
                <p className="text-sm text-red-800 font-medium mt-3">
                  Esta acción es permanente y no se puede deshacer.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmData(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => executeDelete(true)}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar Permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default TemplateEditor;
