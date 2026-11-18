import React from 'react';
import Link from 'next/link';
import Avatar from '../common/Avatar';
import { ROLE_NAMES, UserRoleType } from '../../types/roles';
import {
  Settings, Users, ChevronDown, ChevronUp, Newspaper, Play,
  ArrowRight, Clock, ExternalLink, Briefcase
} from 'lucide-react';
import { getExternalSchoolLabel } from '../../constants/externalSchools';
import { LearningPathCard } from '../learning-paths';
import { NetflixCourseRow } from '../courses';
import { UpcomingCourseCard } from '../courses/UpcomingCourseCard';
import { CourseProposalSection } from '../course-proposals';
import { BadgesSection } from '../badges';
import { formatTimeAgo, getExcerpt } from './format';
import type { Panel, PanelDecisions } from '../../hooks/usePanel';

/**
 * Today's «Mi Panel», the classic view: the page's body moved out of `pages/dashboard.tsx`
 * unchanged (redesign 6A). It draws only what `usePanel()` gives it and the decisions the page
 * worked out with `panel.decide()` after its loading return (each condition has one copy, in the
 * hook; the gear and the route cards are asked here, at the place the markup asked them); the
 * frame (`MainLayout`), the loading mark and the two pop-ups stay in the page.
 */
export default function PanelClasico({ panel, decisions }: { panel: Panel; decisions: PanelDecisions }) {
  const {
    user,
    avatarUrl,
    communityExpanded,
    toggleCommunity,
    chooseCommunity,
    openWorkspaceSettings,
    openMember,
    newsArticles,
    youtubeVideos,
    dashboardStats,
    loadingNews,
    loadingVideos,
    loadingStats,
    upcomingCourses,
    inProgressCourses,
    openCourses,
    openCourse,
  } = panel;
  const {
    greetingName,
    showConsultorAffiliation,
    consultorAffiliationLabel,
    community,
    showUpcomingCourses,
    showCourseProposals,
    showBadges,
    showInProgressCourses,
    showLearningPaths,
    learningPathCards,
    showOpenCourses,
  } = decisions;

  return (
    <>
      {/* Welcome Header */}
      <div className="bg-brand_beige border-b border-brand_accent/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                user={user}
                avatarUrl={avatarUrl}
                size="lg"
                className="ring-4 ring-brand_accent shadow-lg"
              />
              <div>
                <h1 className="text-2xl font-bold text-brand_primary">
                  ¡Hola, {greetingName}!
                </h1>
                <p className="text-gray-600 mt-1">
                  Bienvenido de vuelta al hub de transformación de tu colegio
                </p>
                {showConsultorAffiliation && (
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                    <Briefcase className="w-4 h-4 text-brand_accent" />
                    <span>{consultorAffiliationLabel}</span>
                  </div>
                )}
              </div>
            </div>
            <Link
              href="/profile"
              className="hidden sm:flex items-center gap-2 px-4 py-2 bg-brand_primary text-white hover:bg-brand_primary/90 rounded-lg transition-colors shadow-sm"
            >
              <Settings className="h-4 w-4" />
              <span>Mi Perfil</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Growth Community Section - Collapsible */}
        {community && (() => {
          const { userCommunities, effectiveCommunityId, selectedRole, members, workspace, showCommunityPicker, canEditWorkspace } = community;

          return (
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div key={selectedRole.id}>
                  {/* Header - Always Visible */}
                  <button
                    onClick={toggleCommunity}
                    className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {workspace?.image_url ? (
                        <img
                          src={workspace.image_url}
                          alt={workspace.custom_name || selectedRole.community!.name}
                          className="w-14 h-14 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gradient-to-br from-brand_accent/20 to-brand_accent/10 rounded-xl flex items-center justify-center">
                          <Users className="w-7 h-7 text-brand_accent" />
                        </div>
                      )}
                      <div className="text-left">
                        <h2 className="text-lg font-semibold text-brand_primary">
                          Mi Comunidad de Crecimiento
                        </h2>
                        <p className="text-sm text-gray-500">
                          {selectedRole.school?.name || selectedRole.community!.name} • {members.length} miembros
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        {members.slice(0, 4).map((member, idx) => (
                          <div key={member.id} className="relative" style={{ zIndex: 4 - idx }}>
                            {member.avatar_url ? (
                              <img
                                src={member.avatar_url}
                                alt=""
                                className="w-8 h-8 rounded-full border-2 border-white object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full border-2 border-white bg-brand_accent flex items-center justify-center">
                                <span className="text-xs font-bold text-brand_primary">
                                  {member.first_name?.charAt(0) || 'U'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                        {members.length > 4 && (
                          <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-600">+{members.length - 4}</span>
                          </div>
                        )}
                      </div>
                      {communityExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {communityExpanded && (
                    <div className="px-6 pb-6 border-t border-gray-100">
                      {/* Community Selector - Only show if user has multiple communities */}
                      {showCommunityPicker && (
                        <div className="pt-4 pb-3 border-b border-gray-100 mb-4">
                          <p className="text-xs text-gray-500 mb-2">Seleccionar comunidad:</p>
                          <div className="flex flex-wrap gap-2">
                            {userCommunities.map(comm => (
                              <button
                                key={comm.community_id}
                                onClick={(e) => chooseCommunity(e, comm.community_id!)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                  comm.community_id === effectiveCommunityId
                                    ? 'bg-brand_accent text-brand_primary'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {comm.school?.name || comm.community?.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-4 flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                          {selectedRole.school?.name || selectedRole.community!.name}
                        </h3>
                        <div className="flex gap-2">
                          {/* Only for those who can save the settings: admin or this community's manager (N87) */}
                          {canEditWorkspace() && (
                          <button
                            onClick={(e) => openWorkspaceSettings(e, workspace)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Configuración"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          )}
                          <Link
                            href="/community/workspace"
                            className="px-3 py-1.5 text-sm font-medium text-brand_primary hover:bg-brand_accent/10 rounded-lg transition-colors"
                          >
                            Ver Espacio Completo →
                          </Link>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {members.map(member => {
                          const memberRole = member.user_roles?.[0]?.role_type as UserRoleType | undefined;
                          const roleLabel = memberRole ? ROLE_NAMES[memberRole] : null;
                          return (
                            <button
                              key={member.id}
                              onClick={() => openMember(member)}
                              className="flex flex-col items-center p-3 bg-gray-50 rounded-xl hover:bg-brand_accent/10 hover:shadow-sm transition-all group cursor-pointer"
                            >
                              {member.avatar_url ? (
                                <img
                                  src={member.avatar_url}
                                  alt=""
                                  className="w-12 h-12 rounded-full object-cover mb-2 group-hover:ring-2 ring-brand_accent transition-all"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-brand_accent flex items-center justify-center mb-2 group-hover:ring-2 ring-brand_accent/50 transition-all">
                                  <span className="text-lg font-bold text-brand_primary">
                                    {member.first_name?.charAt(0) || 'U'}
                                  </span>
                                </div>
                              )}
                              <p className="text-sm font-medium text-gray-900 text-center truncate w-full">
                                {[member.first_name, member.last_name].filter(Boolean).join(' ') || (member as any).name || 'Usuario'}
                              </p>
                              {roleLabel && (
                                <span className="text-xs text-gray-500 text-center truncate w-full">
                                  {roleLabel}
                                </span>
                              )}
                              {memberRole === 'consultor' && member.external_school_affiliation && (
                                <span className="text-xs text-brand_accent text-center truncate w-full">
                                  {getExternalSchoolLabel(member.external_school_affiliation)}
                                </span>
                              )}
                              {member.id === user?.id && (
                                <span className="text-xs text-brand_accent font-medium">Tú</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
          </section>
          );
        })()}

        {/* Latest News Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand_accent/10 rounded-lg">
                <Newspaper className="w-5 h-5 text-brand_accent" />
              </div>
              <h2 className="text-xl font-bold text-brand_primary">Últimas Noticias</h2>
            </div>
            <Link
              href="/noticias"
              className="text-sm font-medium text-brand_primary hover:text-brand_accent transition-colors flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {loadingNews ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="h-32 bg-gray-200 rounded-lg mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : newsArticles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {newsArticles.map((article, index) => (
                <a
                  key={article.id}
                  href={`/noticias/${article.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all ${
                    index === 0 ? 'md:col-span-1' : ''
                  }`}
                >
                  {article.featured_image && (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={article.featured_image}
                        alt={article.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-xs text-gray-500 mb-2">
                      {formatTimeAgo(article.display_date || article.created_at)}
                    </p>
                    <h3 className="font-semibold text-brand_primary group-hover:text-brand_accent transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {getExcerpt(article.content_html)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-gray-500">
              No hay noticias disponibles
            </div>
          )}
        </section>

        {/* YouTube Videos Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Play className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-brand_primary">Videos Recientes</h2>
            </div>
            <a
              href="https://www.youtube.com/@NuevaEducacionFundacion"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand_primary hover:text-brand_accent transition-colors flex items-center gap-1"
            >
              Ver canal <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {loadingVideos ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="aspect-video bg-gray-200 rounded-lg mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          ) : youtubeVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {youtubeVideos.map(video => (
                <a
                  key={video.id}
                  href={`https://www.youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all"
                >
                  <div className="aspect-video relative overflow-hidden bg-gray-900">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                      <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="w-8 h-8 text-white fill-white ml-1" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-brand_primary group-hover:text-brand_accent transition-colors line-clamp-2">
                      {video.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatTimeAgo(video.publishedAt)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-gray-500">
              No hay videos disponibles
            </div>
          )}
        </section>

        {/* Statistics Section - Netflix-inspired minimal design */}
        <section>
          <h2 className="text-xl font-bold text-brand_primary mb-6">{dashboardStats?.statsLabel || 'Estadísticas de la Plataforma'}</h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Total Users - Large emphasis card */}
            <div className="bg-brand_primary rounded-xl p-6">
              <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">Educadores Activos</p>
              <p className="text-5xl font-bold text-white mt-2">
                {loadingStats ? (
                  <span className="inline-block w-24 h-12 bg-gray-700 rounded animate-pulse"></span>
                ) : (
                  (dashboardStats?.totalUsers || 0).toLocaleString()
                )}
              </p>
              <p className="text-gray-500 text-sm mt-3">en tu alcance</p>
            </div>

            {/* Most Completed Course */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Curso Más Completado</p>
              {loadingStats ? (
                <div className="mt-4 space-y-3">
                  <div className="h-5 bg-gray-100 rounded w-full animate-pulse"></div>
                  <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse"></div>
                </div>
              ) : dashboardStats?.mostCompletedCourse ? (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold text-brand_primary leading-tight">
                    {dashboardStats.mostCompletedCourse.title}
                  </h3>
                  {dashboardStats.mostCompletedCourse.instructor_name && (
                    <p className="text-sm text-gray-600 mt-1">
                      Relator: {dashboardStats.mostCompletedCourse.instructor_name}
                    </p>
                  )}
                  <div className="flex items-baseline gap-2 mt-3">
                    <span className="text-3xl font-bold text-brand_accent">
                      {dashboardStats.mostCompletedCourse.completionCount}
                    </span>
                    <span className="text-gray-500 text-sm">completaciones</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 mt-4">Sin datos disponibles</p>
              )}
            </div>

            {/* Top Learner - Enhanced with more details */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Usuario Destacado</p>
              {loadingStats ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-full animate-pulse"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse"></div>
                      <div className="h-3 bg-gray-100 rounded w-1/2 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ) : dashboardStats?.topLearner ? (
                <div className="mt-4">
                  <div className="flex items-start gap-4">
                    {dashboardStats.topLearner.avatar_url ? (
                      <img
                        src={dashboardStats.topLearner.avatar_url}
                        alt=""
                        className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-brand_accent flex items-center justify-center flex-shrink-0">
                        <span className="text-xl font-bold text-brand_primary">
                          {dashboardStats.topLearner.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-brand_primary text-lg leading-tight truncate">
                        {dashboardStats.topLearner.name}
                      </h3>
                      {dashboardStats.topLearner.role && (
                        <p className="text-sm text-gray-600 mt-0.5">
                          {dashboardStats.topLearner.role}
                        </p>
                      )}
                      {dashboardStats.topLearner.school_name && (
                        <p className="text-sm text-gray-500 truncate mt-0.5">
                          {dashboardStats.topLearner.school_name}
                        </p>
                      )}
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-2xl font-bold text-brand_accent">
                          {dashboardStats.topLearner.completedCourses}
                        </span>
                        <span className="text-gray-500 text-sm">cursos completados</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 mt-4">Sin datos disponibles</p>
              )}
            </div>
          </div>
        </section>

        {/* Upcoming Courses Section */}
        {showUpcomingCourses && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-brand_accent/10 rounded-lg">
                <Clock className="w-5 h-5 text-brand_accent" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-brand_primary">Próximos Cursos</h2>
                <p className="text-sm text-gray-500">Cursos que podrás tomar próximamente</p>
              </div>
            </div>

            <div className="relative">
              {/* Horizontal scroll container */}
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
                {upcomingCourses.map((course) => (
                  <div
                    key={course.id}
                    className="flex-none w-[260px] sm:w-[280px] snap-start"
                  >
                    <UpcomingCourseCard course={course} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Course Proposals Section - Admin/Consultor only */}
        {showCourseProposals && (
          <CourseProposalSection userId={user?.id} />
        )}

        {/* Badges/Achievements Section - Mis Logros */}
        {showBadges && (
          <BadgesSection userId={user.id} maxDisplay={4} showViewAll={true} />
        )}

        {/* Continue Learning Section - Netflix Style */}
        {showInProgressCourses && (
          <NetflixCourseRow
            title="Continuar Aprendiendo"
            courses={inProgressCourses}
            emptyMessage="No tienes cursos en progreso"
            onCourseSelect={openCourse}
          />
        )}

        {/* Learning Paths Section */}
        {showLearningPaths && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-brand_primary">Mis Rutas de Aprendizaje</h2>
              <Link
                href="/mi-aprendizaje"
                className="text-sm font-medium text-brand_primary hover:text-brand_accent transition-colors flex items-center gap-1"
              >
                Ver todas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {learningPathCards().map(path => (
                <LearningPathCard
                  key={path.id}
                  id={path.id}
                  name={path.name}
                  description={path.description}
                  assigned_at={path.assigned_at}
                  progress={path.progress}
                  onClick={path.onClick}
                />
              ))}
            </div>
          </section>
        )}

        {/* Open Courses Section - Netflix Style */}
        {showOpenCourses && (
          <NetflixCourseRow
            title="Mis Cursos Abiertos"
            courses={openCourses}
            emptyMessage="No tienes cursos asignados"
            onCourseSelect={openCourse}
          />
        )}

      </div>
    </>
  );
}
