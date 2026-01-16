/**
 * QA Feature Checklist Page
 *
 * Admin interface for managing feature coverage tracking.
 * Shows which features have QA scenarios vs. which are untested.
 */

import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  CheckSquare,
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import QATourProvider from '@/components/qa/QATourProvider';
import type { FeatureArea } from '@/types/qa';
import { FEATURE_AREA_LABELS } from '@/types/qa';
import type { QAFeatureChecklistItem, FeatureCoverageStats } from '@/pages/api/qa/feature-checklist';

const QAFeatureChecklistPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Data state
  const [features, setFeatures] = useState<QAFeatureChecklistItem[]>([]);
  const [stats, setStats] = useState<FeatureCoverageStats | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingFeature, setEditingFeature] = useState<QAFeatureChecklistItem | null>(null);
  const [formData, setFormData] = useState({
    feature_name: '',
    feature_area: '' as FeatureArea | '',
    description: '',
    route_pattern: '',
    is_critical: false,
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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

      const isAdmin = roles?.some((r) => r.role_type === 'admin') || false;
      setHasPermission(isAdmin);
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch data
  useEffect(() => {
    if (user && hasPermission === true) {
      fetchFeatures();
    }
  }, [user, hasPermission]);

  const fetchFeatures = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/qa/feature-checklist', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setFeatures(data.features || []);
        setStats(data.stats || null);
        // Expand all areas by default
        const areas = new Set<string>((data.features || []).map((f: QAFeatureChecklistItem) => f.feature_area));
        setExpandedAreas(areas);
      } else {
        console.error('Failed to fetch features');
        toast.error('Error al cargar características');
      }
    } catch (error) {
      console.error('Error fetching features:', error);
      toast.error('Error al cargar características');
    } finally {
      setLoading(false);
    }
  };

  // Group features by area
  const groupedFeatures = features.reduce((acc, feature) => {
    if (!acc[feature.feature_area]) {
      acc[feature.feature_area] = [];
    }
    acc[feature.feature_area].push(feature);
    return acc;
  }, {} as Record<string, QAFeatureChecklistItem[]>);

  // Filter features
  const filterFeatures = (features: QAFeatureChecklistItem[]) => {
    return features.filter((feature) => {
      const matchesSearch =
        !searchQuery ||
        feature.feature_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        feature.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCritical = !showCriticalOnly || feature.is_critical;

      return matchesSearch && matchesCritical;
    });
  };

  // Toggle area expansion
  const toggleArea = (area: string) => {
    setExpandedAreas((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(area)) {
        newSet.delete(area);
      } else {
        newSet.add(area);
      }
      return newSet;
    });
  };

  // Get coverage indicator - uses brand colors only
  const getCoverageIndicator = (scenarioCount: number) => {
    if (scenarioCount === 0) {
      return { icon: <XCircle className="w-4 h-4 text-brand_gray_medium" />, color: 'bg-gray-100 text-brand_gray_medium', label: 'Sin cobertura' };
    }
    if (scenarioCount < 3) {
      return { icon: <AlertTriangle className="w-4 h-4 text-brand_accent" />, color: 'bg-brand_accent/10 text-brand_accent_hover', label: 'Cobertura baja' };
    }
    return { icon: <CheckCircle2 className="w-4 h-4 text-brand_accent" />, color: 'bg-brand_accent/20 text-brand_primary', label: 'Cubierto' };
  };

  // Open modal for create/edit
  const openModal = (feature?: QAFeatureChecklistItem) => {
    if (feature) {
      setEditingFeature(feature);
      setFormData({
        feature_name: feature.feature_name,
        feature_area: feature.feature_area,
        description: feature.description || '',
        route_pattern: feature.route_pattern || '',
        is_critical: feature.is_critical,
      });
    } else {
      setEditingFeature(null);
      setFormData({
        feature_name: '',
        feature_area: '',
        description: '',
        route_pattern: '',
        is_critical: false,
      });
    }
    setShowModal(true);
  };

  // Save feature
  const handleSave = async () => {
    if (!formData.feature_name || !formData.feature_area) {
      toast.error('Nombre y área son requeridos');
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const url = editingFeature
        ? `/api/qa/feature-checklist?id=${editingFeature.id}`
        : '/api/qa/feature-checklist';

      const response = await fetch(url, {
        method: editingFeature ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(editingFeature ? 'Característica actualizada' : 'Característica creada');
        setShowModal(false);
        fetchFeatures();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al guardar');
      }
    } catch (error) {
      console.error('Error saving feature:', error);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Delete feature
  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta característica?')) return;

    setDeletingId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/qa/feature-checklist?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        },
      });

      if (response.ok) {
        toast.success('Característica eliminada');
        fetchFeatures();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al eliminar');
      }
    } catch (error) {
      console.error('Error deleting feature:', error);
      toast.error('Error al eliminar');
    } finally {
      setDeletingId(null);
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
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="qa-admin"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">
              Acceso Denegado
            </h1>
            <p className="text-gray-700 mb-6">
              Solo administradores pueden gestionar el checklist de características.
            </p>
            <Link
              href="/admin/qa"
              className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-opacity-90 transition-colors"
            >
              Volver al Panel QA
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="qa-admin"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <QATourProvider tourId="qa-feature-checklist">
        <ResponsiveFunctionalPageHeader
          icon={<CheckSquare />}
          title="Checklist de Caracteristicas"
          subtitle="Cobertura de pruebas por funcionalidad"
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link
          href="/admin/qa"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al Panel QA
        </Link>

        {/* Coverage Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-tour="coverage-indicator">
            <div className="bg-white rounded-lg shadow-md p-4">
              <p className="text-sm text-gray-500">Cobertura Total</p>
              <p className="text-3xl font-bold text-brand_accent">
                {stats.coverage_percentage}%
              </p>
              <p className="text-xs text-gray-400">
                {stats.covered_features} de {stats.total_features} características
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4">
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Cobertura Crítica
              </p>
              <p className="text-3xl font-bold text-brand_accent">
                {stats.critical_coverage_percentage}%
              </p>
              <p className="text-xs text-gray-400">
                {stats.critical_covered} de {stats.critical_features} críticas
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4">
              <p className="text-sm text-gray-500">Sin Cobertura</p>
              <p className="text-3xl font-bold text-brand_gray_medium">
                {stats.total_features - stats.covered_features}
              </p>
              <p className="text-xs text-gray-400">características sin escenarios</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4">
              <p className="text-sm text-gray-500">Áreas</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.by_area.length}
              </p>
              <p className="text-xs text-gray-400">áreas funcionales</p>
            </div>
          </div>
        )}

        {/* Actions and Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar características..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                />
              </div>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
              >
                <option value="">Todas las áreas</option>
                {Object.entries(FEATURE_AREA_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showCriticalOnly}
                  onChange={(e) => setShowCriticalOnly(e.target.checked)}
                  className="rounded border-gray-300 text-brand_primary focus:ring-brand_primary"
                />
                Solo críticas
              </label>
            </div>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva Característica
            </button>
          </div>
        </div>

        {/* Feature List by Area */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4" data-tour="feature-list">
            {Object.entries(groupedFeatures)
              .filter(([area]) => !areaFilter || area === areaFilter)
              .map(([area, areaFeatures]) => {
                const filteredAreaFeatures = filterFeatures(areaFeatures);
                if (filteredAreaFeatures.length === 0) return null;

                const areaCoverage = stats?.by_area.find((a) => a.feature_area === area);
                const isExpanded = expandedAreas.has(area);

                return (
                  <div key={area} className="bg-white rounded-lg shadow-md overflow-hidden">
                    <button
                      onClick={() => toggleArea(area)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">
                          {FEATURE_AREA_LABELS[area as FeatureArea] || area}
                        </h3>
                        <span className="text-sm text-gray-500">
                          ({filteredAreaFeatures.length} características)
                        </span>
                        {areaCoverage && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            areaCoverage.percentage >= 80 ? 'bg-brand_accent/20 text-brand_primary' :
                            areaCoverage.percentage >= 50 ? 'bg-brand_accent/10 text-brand_accent_hover' :
                            'bg-gray-100 text-brand_gray_medium'
                          }`}>
                            {areaCoverage.percentage}% cobertura
                          </span>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-gray-100">
                        {filteredAreaFeatures.map((feature) => {
                          const coverage = getCoverageIndicator(feature.scenario_count || 0);

                          return (
                            <div
                              key={feature.id}
                              className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {coverage.icon}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {feature.feature_name}
                                    </p>
                                    {feature.is_critical && (
                                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-brand_accent/20 text-brand_primary">
                                        <Shield className="w-3 h-3" />
                                        Crítico
                                      </span>
                                    )}
                                  </div>
                                  {feature.description && (
                                    <p className="text-xs text-gray-500 truncate">
                                      {feature.description}
                                    </p>
                                  )}
                                  {feature.route_pattern && (
                                    <p className="text-xs text-gray-400 font-mono">
                                      {feature.route_pattern}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className={`text-xs px-2 py-1 rounded-full ${coverage.color}`}>
                                  {feature.scenario_count || 0} escenarios
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => openModal(feature)}
                                    className="p-1.5 text-gray-400 hover:text-brand_primary transition-colors"
                                    title="Editar"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(feature.id)}
                                    disabled={deletingId === feature.id}
                                    className="p-1.5 text-gray-400 hover:text-brand_gray_dark transition-colors"
                                    title="Eliminar"
                                  >
                                    {deletingId === feature.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {editingFeature ? 'Editar Característica' : 'Nueva Característica'}
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre *
                    </label>
                    <input
                      type="text"
                      value={formData.feature_name}
                      onChange={(e) => setFormData({ ...formData, feature_name: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                      placeholder="Ej: Login de usuario"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Área Funcional *
                    </label>
                    <select
                      value={formData.feature_area}
                      onChange={(e) => setFormData({ ...formData, feature_area: e.target.value as FeatureArea })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                    >
                      <option value="">Seleccionar área...</option>
                      {Object.entries(FEATURE_AREA_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descripción
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary"
                      placeholder="Breve descripción de la funcionalidad"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Patrón de Ruta
                    </label>
                    <input
                      type="text"
                      value={formData.route_pattern}
                      onChange={(e) => setFormData({ ...formData, route_pattern: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand_primary focus:border-brand_primary font-mono text-sm"
                      placeholder="Ej: /admin/users/*"
                    />
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.is_critical}
                      onChange={(e) => setFormData({ ...formData, is_critical: e.target.checked })}
                      className="rounded border-gray-300 text-brand_primary focus:ring-brand_primary"
                    />
                    <span className="text-sm text-gray-700">
                      Característica crítica (requiere cobertura prioritaria)
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_gray_dark transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </QATourProvider>
    </MainLayout>
  );
};

export default QAFeatureChecklistPage;
