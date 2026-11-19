import React from 'react';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { Calendar, MapPin, Clock, Filter as FilterIcon, X, Link2, Users, CalendarPlus } from 'lucide-react';
import HelpButton from '../../../components/tutorials/HelpButton';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getStatusBadge, formatTime, getModalityIcon, getCancellationSubBadge } from '../../../lib/utils/session-ui-helpers';
import type { SessionListItem } from '../../../components/sessions/SessionsList.types';
import { useSessionsList } from '../../../hooks/useSessionsList';

const ConsultorSessionsPage: React.FC = () => {
  const {
    router,
    user,
    loading,
    sessions,
    totalSessions,
    filters,
    setFilters,
    allSchools,
    cancellationMap,
    handleLogout,
    handleClearFilters,
    handleLoadMore,
    mySessions,
    otherSessions,
    mySessionsByDate,
    otherSessionsByDate,
    sortedMyDates,
    sortedOtherDates,
    nextSessionCountdown,
    pendingReportsCount,
  } = useSessionsList();

  const renderSessionCard = (session: SessionListItem, dimmed: boolean = false) => {
    const badge = getStatusBadge(session.status);

    return (
      <div
        key={session.id}
        onClick={() => router.push(`/consultor/sessions/${session.id}`)}
        aria-label={`Ver detalles de ${session.title}`}
        className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
          dimmed
            ? 'border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300'
            : 'border-gray-300 hover:border-brand_accent hover:shadow-sm'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-gray-900 truncate">{session.title}</h3>
              {session.recurrence_group_id && session.session_number && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Link2 className="w-3 h-3" />
                  <span>#{session.session_number}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>
                  {formatTime(session.start_time)} - {formatTime(session.end_time)}
                  <span className="text-xs text-gray-500 ml-1">(Chile)</span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                {getModalityIcon(session.modality)}
                <span className="capitalize">{session.modality}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {session.status === 'cancelada' && (() => {
              const ledger = cancellationMap.get(session.id);
              return getCancellationSubBadge(
                ledger?.status ?? null,
                ledger?.admin_override ?? false
              );
            })()}
          </div>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          {session.schools && <div className="flex items-center gap-1"><MapPin className="w-3 h-3 flex-shrink-0" /> {session.schools.name}</div>}
          {session.growth_communities && <div className="flex items-center gap-1"><Users className="w-3 h-3 flex-shrink-0" /> {session.growth_communities.name}</div>}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <MainLayout user={user} onLogout={handleLogout}>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Cargando...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout user={user} onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ResponsiveFunctionalPageHeader
          icon={<Calendar className="h-6 w-6" />}
          title="Mis Sesiones"
          subtitle="Vista de sesiones de consultoría asignadas"
        >
          <HelpButton sectionId="mis-sesiones" />
        </ResponsiveFunctionalPageHeader>

        {/* Quick stats header */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Total Sesiones</div>
            <div className="text-2xl font-bold text-gray-900">{totalSessions}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Informes Pendientes</div>
            <div className="text-2xl font-bold text-orange-600">{pendingReportsCount}</div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600">Próxima Sesión</div>
            <div className="text-2xl font-bold text-gray-900">{nextSessionCountdown}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FilterIcon className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Filtros</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por colegio</label>
              <select
                value={filters.school_id}
                onChange={(e) => setFilters({ ...filters, school_id: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                {allSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por estado</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="pendiente_aprobacion">Pendiente Aprobación</option>
                <option value="programada">Programada</option>
                <option value="en_progreso">En Progreso</option>
                <option value="pendiente_informe">Pendiente Informe</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha desde</label>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta</label>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={handleClearFilters}
              className="text-sm text-brand_accent hover:text-brand_accent_hover flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              Limpiar filtros
            </button>
            {sessions.length > 0 && (
              <a
                href={`/api/sessions/ical?${new URLSearchParams(
                  Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
                ).toString()}`}
                download
                className="text-sm text-brand_accent hover:text-brand_accent_hover flex items-center gap-1"
              >
                <CalendarPlus className="w-4 h-4" />
                Exportar Calendario
              </a>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My Sessions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Mis Sesiones</h2>
            {mySessions.length === 0 ? (
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center text-gray-600">
                No está asignado como facilitador en ninguna sesión
              </div>
            ) : (
              <div className="space-y-4">
                {sortedMyDates.map((date) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      {format(parseISO(date), 'EEEE, dd MMMM yyyy', { locale: es })}
                    </h3>
                    <div className="space-y-3">
                      {mySessionsByDate[date].map((session) => renderSessionCard(session, false))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other Sessions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Otras Sesiones en Mis Colegios</h2>
            {otherSessions.length === 0 ? (
              <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 text-center text-gray-600">
                No hay otras sesiones en sus colegios asignados
              </div>
            ) : (
              <div className="space-y-4">
                {sortedOtherDates.map((date) => (
                  <div key={date}>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">
                      {format(parseISO(date), 'EEEE, dd MMMM yyyy', { locale: es })}
                    </h3>
                    <div className="space-y-3">
                      {otherSessionsByDate[date].map((session) => renderSessionCard(session, true))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Load More */}
        {sessions.length < totalSessions && (
          <div className="mt-6 text-center">
            <button
              onClick={handleLoadMore}
              className="px-6 py-2 bg-brand_accent text-brand_primary font-semibold rounded-lg hover:bg-brand_accent_hover"
            >
              Cargar más
            </button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ConsultorSessionsPage;
