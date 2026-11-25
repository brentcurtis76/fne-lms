/**
 * Fakes for «Consultorías» and «Reportes de Sesiones» in both looks (redesign 6S, release SC, builder
 * C2). It reuses the session screens' fakes (`sessionsFakes.tsx`: the router, `fetch`, the toasts, the
 * role helper, the look, the markers, the log) and adds what these two pages need on top:
 *   - a Supabase client whose queries chain `select` / `eq` / `single` and resolve with an answer by
 *     table; each query is written to the log as one entry when it is sent (awaited);
 *   - a stand-in for `next/dynamic` that loads the module after the mount, so the lazy chart pieces
 *     arrive as they do in the browser, and swaps each recharts piece for a stand-in that draws its
 *     props as data attributes (series names, colours) and its children.
 * Every person, school and address here is invented.
 */
import React from 'react';
import { fakes, log } from './sessionsFakes';

export interface ScTwoAnswers {
  /** The profile read (`profiles` … `.single()`); `null` = no profile row. */
  profile?: unknown;
  /** The count of `user_roles` per filter column (`community_id`, `generation_id`, `school_id`). */
  counts?: Record<string, number>;
  /** Name rows for `growth_communities`, `schools`, `generations`, by id. */
  names?: Record<string, Record<string, { id: string; name: string }>>;
}

export const scTwo = { answers: {} as ScTwoAnswers };

export function resetScTwo(answers: ScTwoAnswers) {
  scTwo.answers = answers;
}

function answerFor(query: { from: string; eq: [string, unknown][]; single: boolean; head: boolean }) {
  const a = scTwo.answers;
  if (query.from === 'profiles') return { data: a.profile ?? null, error: null };
  if (query.from === 'user_roles') {
    const column = query.eq.find(([c]) => c !== 'is_active')?.[0] ?? '';
    return { count: a.counts?.[column] ?? 0, data: null, error: null };
  }
  const id = String(query.eq.find(([c]) => c === 'id')?.[1] ?? '');
  return { data: a.names?.[query.from]?.[id] ?? null, error: null };
}

/** A Supabase client: `auth` as the session fakes, `from` with a chain that logs itself when sent. */
export const chainClient: any = {
  auth: {
    getSession: () => {
      log('auth.getSession');
      return Promise.resolve({ data: { session: (fakes.scenario as any)?.session ?? null }, error: null });
    },
    signOut: () => {
      log('auth.signOut');
      return Promise.resolve({ error: null });
    },
  },
  from: (table: string) => {
    const query = { from: table, select: '' as string, options: null as unknown, eq: [] as [string, unknown][], single: false, head: false };
    const send = () => {
      log({ from: query.from, select: query.select, options: query.options, eq: query.eq, single: query.single });
      return Promise.resolve(answerFor(query));
    };
    const chain: any = {
      select: (columns: string, options?: { head?: boolean }) => {
        query.select = columns;
        query.options = options ?? null;
        query.head = Boolean(options?.head);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        query.eq.push([column, value]);
        return chain;
      },
      single: () => {
        query.single = true;
        return send();
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => send().then(resolve, reject),
    };
    return chain;
  },
};

/**
 * `next/dynamic`: the module arrives after the mount, as in the browser (no server render). jsdom has no
 * layout, so a piece loaded from `recharts` is swapped for the stand-in of the same name below (found by
 * identity among recharts' exports); anything else is drawn as loaded.
 */
export function fakeDynamic(loader: () => Promise<{ default: React.ComponentType<any> }>) {
  return function Dynamic(props: any) {
    const [Loaded, setLoaded] = React.useState<React.ComponentType<any> | null>(null);
    React.useEffect(() => {
      let alive = true;
      Promise.all([loader(), import('recharts')]).then(([mod, recharts]) => {
        const name = Object.keys(recharts).find((key) => (recharts as any)[key] === mod.default);
        const stand = name ? (fakeRecharts as Record<string, React.ComponentType<any>>)[name] : undefined;
        if (alive) setLoaded(() => stand ?? mod.default);
      });
      return () => {
        alive = false;
      };
    }, []);
    return Loaded ? <Loaded {...props} /> : null;
  };
}

/** A chart piece that draws its name, its series' words and colours, and its children. */
function piece(name: string) {
  return function Piece(props: any) {
    const { children, data, dataKey, name: seriesName, fill, stroke, content, label } = props;
    void content;
    void label;
    return (
      <div
        data-recharts={name}
        data-key={typeof dataKey === 'string' ? dataKey : undefined}
        data-name={typeof seriesName === 'string' ? seriesName : undefined}
        data-fill={typeof fill === 'string' ? fill : undefined}
        data-stroke={typeof stroke === 'string' ? stroke : undefined}
        data-rows={Array.isArray(data) ? data.length : undefined}
      >
        {children}
      </div>
    );
  };
}

export const fakeRecharts = {
  BarChart: piece('BarChart'),
  Bar: piece('Bar'),
  PieChart: piece('PieChart'),
  Pie: piece('Pie'),
  Cell: piece('Cell'),
  AreaChart: piece('AreaChart'),
  Area: piece('Area'),
  XAxis: piece('XAxis'),
  YAxis: piece('YAxis'),
  CartesianGrid: piece('CartesianGrid'),
  Tooltip: piece('Tooltip'),
  Legend: piece('Legend'),
  ResponsiveContainer: piece('ResponsiveContainer'),
};

/** The series of one chart card, by its heading: each series' word and colour, in order. */
export function seriesOf(heading: string): Array<[string | null, string | null]> {
  const title = Array.from(document.querySelectorAll('h2, h3')).find((h) => h.textContent === heading);
  const card = title?.closest('[aria-label]') ?? title?.parentElement;
  if (!card) return [];
  return Array.from(card.querySelectorAll('[data-recharts="Bar"], [data-recharts="Area"], [data-recharts="Cell"]')).map((el) => [
    el.getAttribute('data-name'),
    el.getAttribute('data-fill'),
  ]);
}
