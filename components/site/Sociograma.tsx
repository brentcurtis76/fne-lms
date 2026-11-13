import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { clamp, prefersReducedMotion } from './useSiteEffects';

const STEPS = [
  {
    when: 'El punto de partida',
    title: 'La escuela que heredamos',
    text: 'Filas mirando al frente. Cada docente a solas con su curso. La dirección arriba y las familias afuera. Los vínculos existen, pero corren en una sola dirección.',
  },
  {
    when: 'En el aula',
    title: 'El aula se vuelve generativa',
    text: 'Las filas se abren. Los estudiantes se explican, se preguntan y se cuidan entre pares. La convivencia deja de competir con el aprendizaje y se convierte en su motor.',
  },
  {
    when: 'En el equipo',
    title: 'Nadie enseña solo',
    text: 'Los docentes salen de su sala y forman comunidades de crecimiento. El liderazgo se distribuye y la dirección acompaña en vez de controlar.',
  },
  {
    when: 'En la comunidad',
    title: 'Una comunidad que aprende',
    text: 'Las familias entran al proyecto educativo. La escuela completa funciona como un ecosistema de relaciones saludables, capaz de sostener su propio cambio.',
  },
];

type Kind = 'student' | 'teacher' | 'lead' | 'family';
type Point = [number, number];

interface Node {
  kind: Kind;
  /** Position at each of the four stages, in a -1..1 square. */
  at: [Point, Point, Point, Point];
  phase: number;
}

interface Edge {
  a: number;
  b: number;
  /** Stage (0..3, fractional) at which the bond appears and disappears. */
  on: number;
  off: number;
  /** Bonds of the finished community are drawn in gold. */
  gold: boolean;
}

const TAU = Math.PI * 2;
const CLASSES = 4;
const PER_CLASS = 12;

/** A school of four classrooms, three leaders and nine families, laid out for each stage. */
function buildSchool() {
  let seed = 11;
  const random = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rows: Point[] = [[-0.5, -0.2], [0.5, -0.2], [-0.5, 0.52], [0.5, 0.52]];
  const circles: Point[] = [[-0.5, -0.24], [0.5, -0.24], [-0.5, 0.5], [0.5, 0.5]];
  const diagonal: Point[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const nodes: Node[] = [];
  const teacherOf = (c: number) => c * (PER_CLASS + 1);
  const studentOf = (c: number, j: number) => c * (PER_CLASS + 1) + 1 + j;

  for (let c = 0; c < CLASSES; c++) {
    const [rx, ry] = rows[c];
    const [cx, cy] = circles[c];
    const base = Math.atan2(diagonal[c][1], diagonal[c][0]);
    const hub: Point = [Math.cos(base) * 0.66, Math.sin(base) * 0.66];
    nodes.push({
      kind: 'teacher',
      at: [
        [rx, ry - 0.23],
        [cx, cy - 0.21],
        [Math.cos(base) * 0.21, Math.sin(base) * 0.21],
        [Math.cos(base) * 0.25, Math.sin(base) * 0.25],
      ],
      phase: random() * TAU,
    });
    for (let j = 0; j < PER_CLASS; j++) {
      const col = j % 4;
      const row = Math.floor(j / 4);
      const ring = -Math.PI / 2 + ((j + 1) / (PER_CLASS + 1)) * TAU;
      const cluster = base + Math.PI + (j / PER_CLASS) * TAU;
      const final = base + ((j - 5.5) / (CLASSES * PER_CLASS)) * TAU;
      nodes.push({
        kind: 'student',
        at: [
          [rx + (col - 1.5) * 0.12, ry + (row - 0.55) * 0.115],
          [cx + Math.cos(ring) * 0.21, cy + Math.sin(ring) * 0.21],
          [hub[0] + Math.cos(cluster) * 0.2, hub[1] + Math.sin(cluster) * 0.2],
          [Math.cos(final) * 0.6, Math.sin(final) * 0.6],
        ],
        phase: random() * TAU,
      });
    }
  }

  const leadStart = nodes.length;
  const leadRows: Point[] = [[-0.14, -0.83], [0, -0.9], [0.14, -0.83]];
  leadRows.forEach((p, k) => {
    const angle = -Math.PI / 2 + (k / 3) * TAU;
    nodes.push({
      kind: 'lead',
      at: [p, [p[0], p[1] + 0.03], [Math.cos(angle) * 0.075, Math.sin(angle) * 0.075], [Math.cos(angle) * 0.085, Math.sin(angle) * 0.085]],
      phase: random() * TAU,
    });
  });

  const familyStart = nodes.length;
  const outside: Point[] = [
    [-0.96, -0.56], [-0.98, 0.06], [-0.95, 0.66], [0.96, -0.5], [0.98, 0.12], [0.95, 0.7], [-0.34, 0.97], [0.02, 0.93], [0.36, 0.97],
  ];
  outside.forEach((p, k) => {
    const angle = Math.atan2(p[1], p[0]);
    const ring: Point = [Math.cos(angle) * 0.93, Math.sin(angle) * 0.93];
    nodes.push({
      kind: 'family',
      at: [p, [p[0] * 0.985, p[1] * 0.985], [(p[0] + ring[0]) / 2, (p[1] + ring[1]) / 2], ring],
      phase: random() * TAU + k,
    });
  });

  const edges: Edge[] = [];
  const taken = new Set<string>();
  const bond = (a: number, b: number, on: number, off: number, gold = false) => {
    if (a === b) return;
    const key = `${Math.min(a, b)}-${Math.max(a, b)}-${gold ? 1 : 0}`;
    if (taken.has(key)) return;
    taken.add(key);
    edges.push({ a, b, on, off, gold });
  };

  // Stage 0: one-way bonds. Teacher to each student; the director to each teacher.
  for (let c = 0; c < CLASSES; c++) {
    for (let j = 0; j < PER_CLASS; j++) bond(teacherOf(c), studentOf(c, j), -1, 0.5 + random() * 0.3);
    bond(leadStart + 1, teacherOf(c), -1, 1.45 + random() * 0.3);
  }
  bond(leadStart, leadStart + 1, -1, 1.6);
  bond(leadStart + 1, leadStart + 2, -1, 1.6);

  // Stage 1: each classroom becomes a circle of peers (the teacher sits in it).
  for (let c = 0; c < CLASSES; c++) {
    const ring = [teacherOf(c), ...Array.from({ length: PER_CLASS }, (_, j) => studentOf(c, j))];
    ring.forEach((node, k) => {
      bond(node, ring[(k + 1) % ring.length], 0.4 + random() * 0.45, 2.5 + random() * 0.35);
      bond(node, ring[(k + 3) % ring.length], 0.6 + random() * 0.4, 2.5 + random() * 0.3);
    });
  }

  // Stage 2: the adults become a team; some students start to cross classrooms.
  for (let c = 0; c < CLASSES; c++) {
    for (let other = c + 1; other < CLASSES; other++) bond(teacherOf(c), teacherOf(other), 1.45 + random() * 0.4, 9, true);
    for (let k = 0; k < 3; k++) bond(teacherOf(c), leadStart + k, 1.5 + random() * 0.4, 9, true);
  }
  bond(leadStart, leadStart + 1, 1.55, 9, true);
  bond(leadStart + 1, leadStart + 2, 1.6, 9, true);
  bond(leadStart, leadStart + 2, 1.65, 9, true);
  for (let q = 0; q < 16; q++) {
    const ca = Math.floor(random() * CLASSES);
    const cb = (ca + 1 + Math.floor(random() * (CLASSES - 1))) % CLASSES;
    bond(studentOf(ca, Math.floor(random() * PER_CLASS)), studentOf(cb, Math.floor(random() * PER_CLASS)), 1.6 + random() * 0.6, 2.6 + random() * 0.3);
  }

  // Stage 3: one community. Students form a ring, families join it.
  const ring = nodes
    .map((node, index) => ({ index, angle: Math.atan2(node.at[3][1], node.at[3][0]), kind: node.kind }))
    .filter((entry) => entry.kind === 'student')
    .sort((p, q) => p.angle - q.angle)
    .map((entry) => entry.index);
  const total = ring.length;
  ring.forEach((node, i) => {
    bond(node, ring[(i + 1) % total], 2.05 + random() * 0.2, 9, true);
    bond(node, ring[(i + 7) % total], 2.15 + random() * 0.25, 9, true);
    if (i % 2 === 0) bond(node, ring[(i + 17) % total], 2.3 + random() * 0.25, 9, true);
  });
  for (let c = 0; c < CLASSES; c++) {
    for (let j = 0; j < PER_CLASS; j++) bond(teacherOf(c), studentOf(c, j), 2.2 + random() * 0.3, 9, true);
  }
  for (let k = 0; k < outside.length; k++) {
    const family = familyStart + k;
    const angle = Math.atan2(nodes[family].at[3][1], nodes[family].at[3][0]);
    const nearest = ring
      .map((index) => {
        const other = Math.atan2(nodes[index].at[3][1], nodes[index].at[3][0]);
        const gap = Math.abs(((other - angle + Math.PI * 3) % TAU) - Math.PI);
        return { index, gap };
      })
      .sort((p, q) => p.gap - q.gap)
      .slice(0, 3);
    nearest.forEach((entry, q) => bond(family, entry.index, 2.35 + q * 0.08 + random() * 0.2, 9, true));
  }

  return { nodes, edges };
}

/**
 * Scroll-driven picture of the thesis: a school read as a system of bonds,
 * from rows facing the front to one community. It is an illustration of the
 * model, drawn from invented points, never from a real school's data.
 */
export default function Sociograma() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const stepsBox = stepsRef.current;
    if (!canvas || !stage || !stepsBox || typeof IntersectionObserver === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = prefersReducedMotion();
    const { nodes, edges } = buildSchool();
    const steps = Array.from(stepsBox.querySelectorAll<HTMLElement>('.paso'));
    let target = 0;
    let shown = 0;
    let size = 0;
    let visible = false;
    let frame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      size = rect.width;
      canvas.width = canvas.height = Math.round(size * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const draw = (time: number) => {
      shown += (target - shown) * (reduce ? 1 : 0.08);
      const s = shown;
      const from = Math.min(2, Math.floor(s));
      const mix = ease(clamp(s - from));
      const radius = size * 0.45;
      const cx = size / 2;
      const cy = size / 2;
      const turn = reduce ? 0 : time * 0.00005 * clamp((s - 2.5) * 2);
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const wobble = 0.011 * (1 - (s / 3) * 0.7);
      ctx.clearRect(0, 0, size, size);

      const points = nodes.map((node) => {
        let x = node.at[from][0] + (node.at[from + 1][0] - node.at[from][0]) * mix;
        let y = node.at[from][1] + (node.at[from + 1][1] - node.at[from][1]) * mix;
        if (!reduce) {
          x += Math.sin(time * 0.0009 + node.phase) * wobble;
          y += Math.cos(time * 0.0011 + node.phase * 1.7) * wobble;
        }
        return [cx + (x * cos - y * sin) * radius, cy + (x * sin + y * cos) * radius] as Point;
      });

      const gold = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
      gold.addColorStop(0, '#fdb933');
      gold.addColorStop(0.55, '#ffd36b');
      gold.addColorStop(1, '#e8930c');

      let count = 0;
      for (const edge of edges) {
        const alpha = clamp((s - edge.on) / 0.22) * (1 - clamp((s - edge.off) / 0.25));
        if (alpha <= 0.01) continue;
        if (alpha > 0.5) count++;
        ctx.globalAlpha = alpha * (edge.gold ? 0.62 : 0.3);
        ctx.strokeStyle = edge.gold ? gold : '#fff';
        ctx.lineWidth = edge.gold ? 1.2 : 1;
        ctx.beginPath();
        ctx.moveTo(points[edge.a][0], points[edge.a][1]);
        ctx.lineTo(points[edge.b][0], points[edge.b][1]);
        ctx.stroke();
      }

      const finished = clamp((s - 2.2) / 0.8);
      nodes.forEach((node, index) => {
        const [x, y] = points[index];
        const adult = node.kind === 'teacher' || node.kind === 'lead';
        const r = size * (adult ? 0.0105 : node.kind === 'family' ? 0.008 : 0.0062);
        if (finished > 0) {
          ctx.globalAlpha = 0.14 * finished;
          ctx.fillStyle = '#fdb933';
          ctx.beginPath();
          ctx.arc(x, y, r * 3, 0, TAU);
          ctx.fill();
        }
        if (node.kind === 'family') {
          // Outside the school until the last stage: a hollow point that waits.
          const joined = clamp((s - 2.1) / 0.5);
          if (joined < 1 && !reduce) {
            ctx.globalAlpha = (1 - joined) * (0.4 - 0.4 * Math.sin(time * 0.003 + node.phase));
            ctx.strokeStyle = '#6fd3c4';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, r + 5 + 3 * Math.sin(time * 0.003 + node.phase), 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.45 + 0.55 * joined;
          ctx.strokeStyle = '#6fd3c4';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = joined;
          ctx.fillStyle = '#6fd3c4';
          ctx.fill();
          return;
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = adult ? '#fdb933' : '#fff';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        if (node.kind === 'lead') {
          ctx.strokeStyle = '#fdb933';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, r + 3.5, 0, TAU);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
      if (countRef.current) countRef.current.textContent = String(count);
      if (visible) frame = requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) {
        resize();
        frame = requestAnimationFrame(draw);
      }
    });
    observer.observe(stage);

    const onScroll = () => {
      const line = window.innerHeight * 0.55;
      const centers = steps.map((step) => {
        const rect = step.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      target = clamp(((line - centers[0]) / (centers[centers.length - 1] - centers[0])) * 3, 0, 3);
      const current = Math.round(target);
      steps.forEach((step, index) => step.classList.toggle('on', index === current));
      if (titleRef.current) titleRef.current.textContent = STEPS[current].title;
    };
    let queued = false;
    const scrollHandler = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        onScroll();
        queued = false;
      });
    };
    const resizeHandler = () => {
      if (visible) resize();
      onScroll();
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', resizeHandler);
    onScroll();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  return (
    <section className="socio" id="escuela">
      <div className="head">
        <div className="eyebrow rv">Leemos la escuela como un sistema de relaciones</div>
        <h2 className="rv">
          <span className="l">Así cambia</span> una escuela
        </h2>
        <p className="rv">
          Cada punto es una persona. Cada línea, un vínculo. Sigue bajando y mira lo que pasa cuando una comunidad
          educativa pone sus relaciones en el centro.
        </p>
      </div>
      <div className="stage" ref={stageRef}>
        <div className="viz">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Animación: los vínculos de una escuela pasan de filas que miran al frente a una comunidad completa conectada"
          />
          <div className="hud">
            <span ref={titleRef}>{STEPS[0].title}</span>
            <b ref={countRef}>0</b>
            <span>vínculos activos</span>
            <small>Ilustración del modelo. No son datos de una escuela real.</small>
          </div>
          <ul className="ley" aria-hidden="true">
            <li><i />Estudiantes</li>
            <li className="d"><i />Docentes</li>
            <li className="g"><i />Dirección</li>
            <li className="f"><i />Familias</li>
          </ul>
        </div>
        <div className="pasos" ref={stepsRef}>
          {STEPS.map((step, index) => (
            <article className={`paso${index === 0 ? ' on' : ''}`} key={step.title}>
              <span className="n">{step.when}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              {index === STEPS.length - 1 && (
                <p>
                  <Link className="btn mag" href="#contacto" data-testid="sociograma-cta">
                    Quiero esto para mi escuela <span className="arr">→</span>
                  </Link>
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
