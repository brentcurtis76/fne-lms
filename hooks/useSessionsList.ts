import { useState, useEffect, useRef, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import { toast } from 'react-hot-toast';
import { getUserPrimaryRole } from '../utils/roleUtils';
import { differenceInDays, differenceInHours } from 'date-fns';
import { formatTime } from '../lib/utils/session-ui-helpers';
import { getSessionDateTime } from '../lib/utils/session-timezone';
import type { SessionListItem } from '../components/sessions/SessionsList.types';

/**
 * Everything «Mis Sesiones» (the consultor's sessions list) knows and decides: its state, the
 * access check and its redirects, the sessions call and its toast, the cancellation ledger read,
 * the address kept in step with the filters, sign-out, and the lists and numbers the markup draws.
 * Moved out of `pages/consultor/sessions/index.tsx` unchanged (redesign 6S, release SA): the same
 * hooks in the same order, the same effects with the same dependency lists.
 */
export function useSessionsList() {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isConsultorOrAdmin, setIsConsultorOrAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data state
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Filter state
  const [filters, setFilters] = useState({
    school_id: router.query.school_id as string || '',
    status: router.query.status as string || '',
    date_from: router.query.date_from as string || '',
    date_to: router.query.date_to as string || '',
  });

  // Reset page when filters change
  const prevFiltersRef = useRef(filters);
  useEffect(() => {
    if (JSON.stringify(prevFiltersRef.current) !== JSON.stringify(filters)) {
      setPage(1);
      prevFiltersRef.current = filters;
    }
  }, [filters]);

  // Cached school list for filter dropdown (populated on initial unfiltered load)
  const [allSchools, setAllSchools] = useState<{id: number; name: string}[]>([]);

  // Cancellation sub-badge data: session_id → { status, admin_override }
  const [cancellationMap, setCancellationMap] = useState<
    Map<string, { status: 'penalizada' | 'devuelta'; admin_override: boolean }>
  >(new Map());

  useEffect(() => {
    if (router.isReady) {
      initializeAuth();
    }
  }, [router.isReady]);

  useEffect(() => {
    if (user && isConsultorOrAdmin) {
      fetchSessions();
    }
  }, [user, isConsultorOrAdmin, filters, page]);

  // Batch-fetch cancellation ledger data for all cancelled sessions
  useEffect(() => {
    const cancelledIds = sessions
      .filter((s) => s.status === 'cancelada')
      .map((s) => s.id);

    if (cancelledIds.length === 0) {
      setCancellationMap(new Map());
      return;
    }

    supabase
      .from('contract_hours_ledger')
      .select('session_id, status, admin_override')
      .in('session_id', cancelledIds)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, { status: 'penalizada' | 'devuelta'; admin_override: boolean }>();
        for (const entry of data as { session_id: string; status: string; admin_override: boolean }[]) {
          if (entry.session_id && (entry.status === 'penalizada' || entry.status === 'devuelta')) {
            map.set(entry.session_id, {
              status: entry.status as 'penalizada' | 'devuelta',
              admin_override: entry.admin_override ?? false,
            });
          }
        }
        setCancellationMap(map);
      });
  }, [sessions]);

  // Update URL when filters change (skip initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const query: Record<string, string> = {};
    if (filters.school_id) query.school_id = filters.school_id;
    if (filters.status) query.status = filters.status;
    if (filters.date_from) query.date_from = filters.date_from;
    if (filters.date_to) query.date_to = filters.date_to;

    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [filters]);

  const initializeAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const userRole = await getUserPrimaryRole(session.user.id);
      const allowed = userRole === 'consultor' || userRole === 'admin';
      setIsConsultorOrAdmin(allowed);

      if (!allowed) {
        router.push('/dashboard');
        return;
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) return;

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (filters.school_id) params.append('school_id', filters.school_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);

      const response = await fetch(`/api/sessions?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Error al cargar sesiones');
      }

      const result = await response.json();
      const newSessions = result.data?.sessions || [];
      if (page === 1) {
        setSessions(newSessions);
      } else {
        setSessions((prev) => [...prev, ...newSessions]);
      }
      setTotalSessions(result.data?.total || 0);

      // Cache school list on initial unfiltered load
      if (page === 1 && !filters.school_id && !filters.status && !filters.date_from && !filters.date_to) {
        const schoolMap = new Map<number, string>();
        newSessions.forEach((s: SessionListItem) => {
          if (s.school_id && s.schools?.name) schoolMap.set(s.school_id, s.schools.name);
        });
        setAllSchools(Array.from(schoolMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (error: unknown) {
      console.error('Error fetching sessions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar sesiones';
      toast.error(errorMessage);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleClearFilters = () => {
    setFilters({
      school_id: '',
      status: '',
      date_from: '',
      date_to: '',
    });
    setPage(1);
  };

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const mySessions = useMemo(() =>
    sessions.filter((s) =>
      s.session_facilitators.some((f) => f.user_id === user?.id)
    ),
    [sessions, user?.id]
  );

  const otherSessions = useMemo(() =>
    sessions.filter(
      (s) => !s.session_facilitators.some((f) => f.user_id === user?.id)
    ),
    [sessions, user?.id]
  );

  // Group sessions by date
  const groupByDate = (sessionList: SessionListItem[]) => {
    const groups: Record<string, SessionListItem[]> = {};
    sessionList.forEach((s) => {
      if (!groups[s.session_date]) {
        groups[s.session_date] = [];
      }
      groups[s.session_date].push(s);
    });
    return groups;
  };

  const mySessionsByDate = useMemo(
    () => groupByDate(mySessions),
    [mySessions]
  );

  const otherSessionsByDate = useMemo(
    () => groupByDate(otherSessions),
    [otherSessions]
  );

  const sortedMyDates = useMemo(
    () => Object.keys(mySessionsByDate).sort().reverse(),
    [mySessionsByDate]
  );

  const sortedOtherDates = useMemo(
    () => Object.keys(otherSessionsByDate).sort().reverse(),
    [otherSessionsByDate]
  );

  const getNextSessionCountdown = (): string => {
    const now = new Date();
    const upcoming = sessions
      .filter((s) => ['programada', 'en_progreso'].includes(s.status))
      .filter((s) => {
        const sessionDateTime = getSessionDateTime(s.session_date, s.start_time);
        return sessionDateTime >= now;
      })
      .sort((a, b) => {
        const dateA = getSessionDateTime(a.session_date, a.start_time);
        const dateB = getSessionDateTime(b.session_date, b.start_time);
        return dateA.getTime() - dateB.getTime();
      });

    if (upcoming.length === 0) return 'Sin sesiones próximas';

    const next = upcoming[0];
    const sessionDateTime = getSessionDateTime(next.session_date, next.start_time);
    const diffDays = differenceInDays(sessionDateTime, now);
    const diffHours = differenceInHours(sessionDateTime, now);

    if (diffDays === 0) {
      if (diffHours === 0) return 'Hoy';
      return `Hoy a las ${formatTime(next.start_time)}`;
    }
    if (diffDays === 1) return 'Mañana';
    return `En ${diffDays} días`;
  };

  const nextSessionCountdown = useMemo(
    () => getNextSessionCountdown(),
    [sessions]
  );

  const pendingReportsCount = useMemo(
    () => sessions.filter((s) => s.status === 'pendiente_informe').length,
    [sessions]
  );

  // ── One copy of each decision the markup makes (redesign 6S, release SA, step 3). Each is the
  // markup's own expression, word for word, worked out when and only when the markup worked it
  // out: those of the body in `decide()`, which the page calls after its loading return, as the
  // markup was drawn only there; those the markup worked out per row or only inside a drawn part
  // are functions, asked at that place.

  /** Called by the page after its loading return, once per render that draws the body. */
  const decide = () => {
    // The calendar export link: drawn only when there are rows.
    const showExportCalendar = sessions.length > 0;
    // The two columns' empty sentences
    const noMySessions = mySessions.length === 0;
    const noOtherSessions = otherSessions.length === 0;
    // «Cargar más»
    const showLoadMore = sessions.length < totalSessions;
    return { showExportCalendar, noMySessions, noOtherSessions, showLoadMore };
  };
  // The export link's address (asked only where the link is drawn): it carries the filters set.
  const icalHref = () => `/api/sessions/ical?${new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  ).toString()}`;
  // Per card: the series number (keeps the markup's shape: a 0 is drawn), the cancellation
  // ledger outcome, and where a click goes.
  const seriesNumberShown = (session: SessionListItem) => session.recurrence_group_id && session.session_number;
  const isCancelled = (session: SessionListItem) => session.status === 'cancelada';
  const ledgerOf = (sessionId: string) => cancellationMap.get(sessionId);
  const openSession = (sessionId: string) => router.push(`/consultor/sessions/${sessionId}`);

  // The filter controls
  const changeSchoolFilter = (e: ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, school_id: e.target.value });
  const changeStatusFilter = (e: ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, status: e.target.value });
  const changeDateFromFilter = (e: ChangeEvent<HTMLInputElement>) => setFilters({ ...filters, date_from: e.target.value });
  const changeDateToFilter = (e: ChangeEvent<HTMLInputElement>) => setFilters({ ...filters, date_to: e.target.value });

  return {
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
    // The decisions (step 3): those of the body worked out only when `decide()` is called
    decide,
    icalHref,
    seriesNumberShown,
    isCancelled,
    ledgerOf,
    openSession,
    changeSchoolFilter,
    changeStatusFilter,
    changeDateFromFilter,
    changeDateToFilter,
  };
}

export type SessionsList = ReturnType<typeof useSessionsList>;
export type SessionsListDecisions = ReturnType<SessionsList['decide']>;
