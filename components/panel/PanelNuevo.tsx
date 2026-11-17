import React from 'react';
import Link from 'next/link';
import {
  ArrowRight, BookOpen, Briefcase, Clock, ExternalLink, Newspaper, Play, Settings, TrendingUp,
} from 'lucide-react';
import Avatar from '../common/Avatar';
import { Button, Card, Skeleton } from '../ui/kit';
import { formatTimeAgo, getExcerpt } from './format';
import type { Panel, PanelDecisions } from '../../hooks/usePanel';
import { PanelSection, ROW_ITEM, fullTitle } from './PanelSection';
import { CourseCardNuevo } from './CourseCardNuevo';
import { RouteCardNuevo } from './RouteCardNuevo';
import { UpcomingCardNuevo } from './UpcomingCardNuevo';
import { ProposalsNuevo } from './ProposalsNuevo';
import { BadgesNuevo } from './BadgesNuevo';
import { CommunityCardNuevo } from './CommunityCardNuevo';

/**
 * The new look's «Mi Panel» (redesign 6B), drawn by `pages/dashboard.tsx` when `useLook()` answers
 * `nuevo`. It reads the SAME `usePanel()` result and the SAME decisions as today's view
 * (`PanelClasico`): every section under the hook's condition, every list in the hook's order,
 * every destination the hook's. The two decisions that are functions are called where today's
 * markup calls them: `learningPathCards()` inside «Mis Rutas de Aprendizaje», `canEditWorkspace()`
 * inside the opened community block. Approved changes (Brent, 13 Nov 2026): the order of the
 * sections and the two columns; course and upcoming cards open with «Detalles»; every row has its
 * arrows; the course picture links to the course; «Mi Perfil» at every width; the route card is a
 * link; the loading mark is placeholders (`PanelSkeleton`, drawn by the page).
 */

const H2 = 'font-mont text-[1.0625rem] font-extrabold uppercase leading-[1.4] tracking-[0.06em] text-brand_primary';
const EYEBROW = 'font-mont text-[0.6875rem] font-medium uppercase leading-[1.6] tracking-[0.26em]';

export default function PanelNuevo({ panel, decisions }: { panel: Panel; decisions: PanelDecisions }) {
  const {
    user,
    avatarUrl,
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
    courseAddress,
    learningPathAddress,
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
    <div data-testid="panel-nuevo">
      {/* Welcome band */}
      <div className="bg-brand_gray_dark text-white" data-testid="panel-nuevo-welcome">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-4 px-4 py-[18px] lg:px-7 lg:py-[22px]">
          <Avatar user={user} avatarUrl={avatarUrl} size="lg" className="ring-2 ring-brand_accent" />
          <div className="grid min-w-0 flex-1 gap-1">
            <h1 className="text-[1.375rem] font-extrabold text-white lg:text-[1.625rem]">
              <span className="font-light">¡Hola, </span>
              {greetingName}!
            </h1>
            <p className="text-[0.8125rem] text-white/80">Bienvenido de vuelta al hub de transformación de tu colegio</p>
            {showConsultorAffiliation && (
              <p className="inline-flex items-center gap-2 text-[0.8125rem] text-white/80">
                <Briefcase aria-hidden="true" className="h-3.5 w-3.5 text-brand_accent" />
                <span>{consultorAffiliationLabel}</span>
              </p>
            )}
          </div>
          {/* An outline button on a dark band: the kit's outline is drawn for light surfaces (see the 6B report). */}
          <Link
            href="/profile"
            className="inline-flex min-h-[40px] items-center justify-center gap-[0.7em] whitespace-nowrap rounded-full border border-white/60 px-[1.5em] py-[0.6em] font-mont text-[0.6875rem] font-bold uppercase leading-[1.2] tracking-[0.14em] text-white no-underline transition-colors duration-150 hover:border-white hover:bg-white/10 motion-reduce:transition-none [&_svg]:h-4 [&_svg]:w-4"
            data-testid="panel-nuevo-profile"
          >
            <Settings aria-hidden="true" />
            <span>Mi Perfil</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1360px] grid-cols-[minmax(0,1fr)] items-start gap-[22px] px-4 pb-8 pt-[18px] lg:gap-7 lg:px-7 lg:pb-10 lg:pt-6 min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── main column: what I am doing ── */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[22px] lg:gap-7" data-testid="panel-nuevo-main">
          {showInProgressCourses && (
            <PanelSection
              title="Continuar Aprendiendo"
              icon={<Play />}
              row
              itemsKey={inProgressCourses.map((course) => course.id).join(' ')}
              data-testid="panel-section-continue"
            >
              {inProgressCourses.map((course, index) => (
                <div key={course.id} className={ROW_ITEM}>
                  <CourseCardNuevo
                    course={course}
                    href={courseAddress(course.id)}
                    onOpen={openCourse}
                    primary={index === 0}
                    testId={`panel-course-continue-${course.id}`}
                  />
                </div>
              ))}
            </PanelSection>
          )}

          {showLearningPaths && (
            <PanelSection
              title="Mis Rutas de Aprendizaje"
              icon={<TrendingUp />}
              data-testid="panel-section-routes"
              action={
                <Button variant="quiet" size="sm" href="/mi-aprendizaje">
                  Ver todas <ArrowRight aria-hidden="true" />
                </Button>
              }
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3.5">
                {learningPathCards().map((path) => (
                  <RouteCardNuevo
                    key={path.id}
                    name={path.name}
                    description={path.description}
                    assigned_at={path.assigned_at}
                    progress={path.progress}
                    href={learningPathAddress(path.id)}
                    testId={`panel-route-${path.id}`}
                  />
                ))}
              </div>
            </PanelSection>
          )}

          {showOpenCourses && (
            <PanelSection
              title="Mis Cursos Abiertos"
              icon={<BookOpen />}
              row
              itemsKey={openCourses.map((course) => course.id).join(' ')}
              data-testid="panel-section-open"
            >
              {openCourses.map((course) => (
                <div key={course.id} className={ROW_ITEM}>
                  <CourseCardNuevo
                    course={course}
                    href={courseAddress(course.id)}
                    onOpen={openCourse}
                    testId={`panel-course-open-${course.id}`}
                  />
                </div>
              ))}
            </PanelSection>
          )}

          {showUpcomingCourses && (
            <PanelSection
              title="Próximos Cursos"
              icon={<Clock />}
              sub="Cursos que podrás tomar próximamente"
              row
              itemsKey={upcomingCourses.map((course) => course.id).join(' ')}
              data-testid="panel-section-upcoming"
            >
              {upcomingCourses.map((course) => (
                <div key={course.id} className={ROW_ITEM}>
                  <UpcomingCardNuevo course={course} testId={`panel-upcoming-${course.id}`} />
                </div>
              ))}
            </PanelSection>
          )}

          {showCourseProposals && <ProposalsNuevo userId={user?.id} />}

          {showBadges && <BadgesNuevo userId={user.id} maxDisplay={4} showViewAll={true} />}
        </div>

        {/* ── side column: my community, my school, what is new ── */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[22px] lg:gap-7" data-testid="panel-nuevo-side">
          {community && <CommunityCardNuevo panel={panel} community={community} />}

          {/* The numbers */}
          <section className="grid gap-3" data-testid="panel-section-stats">
            <h2 className={H2}>{dashboardStats?.statsLabel || 'Estadísticas de la Plataforma'}</h2>
            <div className="grid gap-1 rounded bg-brand_primary p-4 text-white" data-testid="panel-stats-users">
              <p className={`${EYEBROW} text-white/80`}>Educadores Activos</p>
              <p className="text-[2.125rem] font-bold leading-tight text-white">
                {loadingStats ? (
                  // A placeholder on black: the kit's Skeleton is drawn for light surfaces (see the 6B report).
                  <span aria-hidden="true" className="inline-block h-10 w-24 animate-pulse rounded-sm bg-white/20 motion-reduce:animate-none" />
                ) : (
                  (dashboardStats?.totalUsers || 0).toLocaleString()
                )}
              </p>
              <p className="text-[0.8125rem] text-white/80">en tu alcance</p>
            </div>

            <Card className="grid gap-1 p-4" data-testid="panel-stats-course">
              <p className={`${EYEBROW} text-gray-600`}>Curso Más Completado</p>
              {loadingStats ? (
                <div className="grid gap-2 pt-1">
                  <Skeleton width="100%" height={18} />
                  <Skeleton width="33%" height={14} />
                </div>
              ) : dashboardStats?.mostCompletedCourse ? (
                <>
                  <h3 className="text-[0.9375rem] font-semibold leading-tight text-brand_primary">
                    {dashboardStats.mostCompletedCourse.title}
                  </h3>
                  {dashboardStats.mostCompletedCourse.instructor_name && (
                    <p className="text-[0.8125rem] text-gray-600">Relator: {dashboardStats.mostCompletedCourse.instructor_name}</p>
                  )}
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="text-[1.625rem] font-bold leading-none text-brand_primary">
                      {dashboardStats.mostCompletedCourse.completionCount}
                    </span>
                    <span className="text-[0.8125rem] text-gray-600">completaciones</span>
                  </p>
                </>
              ) : (
                <p className="pt-1 text-[0.8125rem] text-gray-600">Sin datos disponibles</p>
              )}
            </Card>

            <Card className="grid gap-2 p-4" data-testid="panel-stats-learner">
              <p className={`${EYEBROW} text-gray-600`}>Usuario Destacado</p>
              {loadingStats ? (
                <div className="flex items-center gap-3">
                  <Skeleton className="flex-none rounded-full" width={48} height={48} />
                  <div className="grid flex-1 gap-2">
                    <Skeleton width="75%" height={14} />
                    <Skeleton width="50%" height={12} />
                  </div>
                </div>
              ) : dashboardStats?.topLearner ? (
                <>
                  <div className="flex items-center gap-3">
                    {dashboardStats.topLearner.avatar_url ? (
                      <img src={dashboardStats.topLearner.avatar_url} alt="" className="h-12 w-12 flex-none rounded-full object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-brand_accent text-base font-bold text-brand_primary">
                        {dashboardStats.topLearner.name.charAt(0)}
                      </span>
                    )}
                    <div className="grid min-w-0">
                      <h3 className="truncate text-[0.9375rem] font-semibold text-brand_primary" {...fullTitle(dashboardStats.topLearner.name)}>{dashboardStats.topLearner.name}</h3>
                      {dashboardStats.topLearner.role && (
                        <span className="text-[0.8125rem] text-gray-600">{dashboardStats.topLearner.role}</span>
                      )}
                      {dashboardStats.topLearner.school_name && (
                        <span className="truncate text-[0.8125rem] text-gray-600" {...fullTitle(dashboardStats.topLearner.school_name)}>{dashboardStats.topLearner.school_name}</span>
                      )}
                    </div>
                  </div>
                  <p className="flex items-baseline gap-2">
                    <span className="text-[1.625rem] font-bold leading-none text-brand_primary">
                      {dashboardStats.topLearner.completedCourses}
                    </span>
                    <span className="text-[0.8125rem] text-gray-600">cursos completados</span>
                  </p>
                </>
              ) : (
                <p className="text-[0.8125rem] text-gray-600">Sin datos disponibles</p>
              )}
            </Card>
          </section>

          {/* Latest news */}
          <PanelSection
            title="Últimas Noticias"
            icon={<Newspaper />}
            data-testid="panel-section-news"
            action={
              <Button variant="quiet" size="sm" href="/noticias">
                Ver todas <ArrowRight aria-hidden="true" />
              </Button>
            }
          >
            <Card className="divide-y divide-brand_primary/[0.12] overflow-hidden">
              {loadingNews ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 px-4 py-3" data-testid="panel-news-placeholder">
                    <Skeleton className="flex-none" width={72} height={72} />
                    <div className="grid flex-1 content-start gap-2">
                      <Skeleton width="30%" height={10} />
                      <Skeleton width="90%" height={14} />
                      <Skeleton width="70%" height={10} />
                    </div>
                  </div>
                ))
              ) : newsArticles.length > 0 ? (
                newsArticles.map((article) => (
                  <a
                    key={article.id}
                    href={`/noticias/${article.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 px-4 py-3 no-underline transition-colors duration-150 hover:bg-gray-50 motion-reduce:transition-none"
                    data-testid={`panel-news-${article.id}`}
                  >
                    {article.featured_image && (
                      <img src={article.featured_image} alt={article.title} className="h-[72px] w-[72px] flex-none rounded object-cover" />
                    )}
                    <div className="grid min-w-0 gap-0.5">
                      <span className="text-xs text-gray-600">{formatTimeAgo(article.display_date || article.created_at)}</span>
                      <h3 className="line-clamp-2 text-[0.8125rem] font-bold leading-snug text-brand_primary" {...fullTitle(article.title)}>{article.title}</h3>
                      <span className="line-clamp-2 text-xs text-gray-600">{getExcerpt(article.content_html)}</span>
                    </div>
                  </a>
                ))
              ) : (
                <p className="px-4 py-8 text-center text-[0.8125rem] text-gray-600">No hay noticias disponibles</p>
              )}
            </Card>
          </PanelSection>

          {/* Recent videos */}
          <PanelSection
            title="Videos Recientes"
            icon={<Play />}
            data-testid="panel-section-videos"
            action={
              <Button
                variant="quiet"
                size="sm"
                href="https://www.youtube.com/@NuevaEducacionFundacion"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver canal <ExternalLink aria-hidden="true" />
              </Button>
            }
          >
            {loadingVideos ? (
              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i} className="grid gap-2 p-2.5" data-testid="panel-video-placeholder">
                    <Skeleton className="aspect-video" width="100%" height="auto" />
                    <Skeleton width="75%" height={14} />
                  </Card>
                ))}
              </div>
            ) : youtubeVideos.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                {youtubeVideos.map((video) => (
                  <Card
                    key={video.id}
                    interactive
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="overflow-hidden"
                    data-testid={`panel-video-${video.id}`}
                  >
                    <span className="relative block aspect-video overflow-hidden bg-brand_primary">
                      <img src={video.thumbnail} alt={video.title} className="h-full w-full object-cover" />
                      <span className="absolute inset-0 m-auto flex h-[46px] w-[46px] items-center justify-center rounded-full bg-brand_accent text-brand_primary">
                        <Play aria-hidden="true" className="h-[18px] w-[18px]" />
                      </span>
                    </span>
                    <div className="grid gap-0.5 p-2.5">
                      <h3 className="line-clamp-2 text-xs font-bold leading-snug text-brand_primary" {...fullTitle(video.title)}>{video.title}</h3>
                      <span className="text-xs text-gray-600">{formatTimeAgo(video.publishedAt)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="px-4 py-8 text-center text-[0.8125rem] text-gray-600">No hay videos disponibles</Card>
            )}
          </PanelSection>
        </div>
      </div>
    </div>
  );
}
