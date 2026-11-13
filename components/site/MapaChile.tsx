import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { CHILE_ISLANDS, CHILE_MAIN } from './chilePath';
import { clamp, prefersReducedMotion } from './useSiteEffects';

interface City {
  id: string;
  name: string;
  region: string;
  /** Map position (see chilePath.ts for the projection). */
  x: number;
  y: number;
  /** Which side of the dot the label sits on, and a small vertical nudge in px. */
  side: 1 | -1;
  dy?: number;
  /** Straight-line km from Iquique, the northernmost city of the network. */
  km: number;
  zone: 'Norte' | 'Centro' | 'Sur';
}

/**
 * Cities with schools that are part of the transformation, north to south.
 * Alto Hospicio sits 7 km from Iquique; its dot is drawn a little inland so
 * the two stay legible at country scale.
 */
const CITIES: City[] = [
  { id: 'iqq', name: 'Iquique', region: 'Región de Tarapacá', x: 491, y: 301, side: -1, km: 0, zone: 'Norte' },
  { id: 'aho', name: 'Alto Hospicio', region: 'Región de Tarapacá', x: 509, y: 315, side: 1, dy: 5, km: 7, zone: 'Norte' },
  { id: 'val', name: 'Vallenar', region: 'Región de Atacama', x: 440, y: 1137, side: 1, km: 931, zone: 'Norte' },
  { id: 'coq', name: 'Coquimbo', region: 'Región de Coquimbo', x: 393, y: 1275, side: -1, km: 1090, zone: 'Norte' },
  { id: 'vap', name: 'Valparaíso', region: 'Región de Valparaíso', x: 371, y: 1585, side: -1, dy: -4, km: 1434, zone: 'Centro' },
  { id: 'scl', name: 'Santiago', region: 'Región Metropolitana', x: 447, y: 1625, side: 1, dy: -3, km: 1473, zone: 'Centro' },
  { id: 'llo', name: 'Llolleo', region: 'Región de Valparaíso', x: 371, y: 1641, side: -1, dy: 5, km: 1497, zone: 'Centro' },
  { id: 'qdt', name: 'Quinta de Tilcoco', region: 'Región de O’Higgins', x: 421, y: 1716, side: 1, km: 1575, zone: 'Centro' },
  { id: 'cur', name: 'Curicó', region: 'Región del Maule', x: 401, y: 1778, side: 1, dy: 2, km: 1646, zone: 'Centro' },
  { id: 'tal', name: 'Talca', region: 'Región del Maule', x: 368, y: 1823, side: -1, km: 1698, zone: 'Centro' },
  { id: 'chi', name: 'Chillán', region: 'Región de Ñuble', x: 331, y: 1941, side: 1, km: 1833, zone: 'Sur' },
  { id: 'vld', name: 'Valdivia', region: 'Región de Los Ríos', x: 239, y: 2261, side: -1, km: 2200, zone: 'Sur' },
  { id: 'oso', name: 'Osorno', region: 'Región de Los Lagos', x: 248, y: 2337, side: 1, km: 2282, zone: 'Sur' },
];

const ZONES: Array<City['zone']> = ['Norte', 'Centro', 'Sur'];
const REGION_COUNT = new Set(CITIES.map((city) => city.region)).size;
const SPAN_KM = Math.round(CITIES[CITIES.length - 1].km / 10) * 10;
const ROUTE = `M${CITIES.map((city) => `${city.x} ${city.y}`).join('L')}`;
const PARALLELS = [20, 25, 30, 35, 40, 45, 50, 55];
const IDLE_HINT = 'Pasa por una ciudad para ubicarla en el mapa.';

/**
 * Chile drawn in one stroke, then the network lighting up from Iquique to
 * Osorno. Plays once when it scrolls into view; "Ver de nuevo" replays it.
 */
export default function MapaChile() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') return;
    const box = section.querySelector<HTMLElement>('.mapbox');
    const svg = section.querySelector<SVGSVGElement>('svg.m');
    const list = section.querySelector<HTMLElement>('.zonas');
    const detail = section.querySelector<HTMLElement>('.det');
    const again = section.querySelector<HTMLButtonElement>('.again');
    if (!box || !svg || !list) return;

    const reduce = prefersReducedMotion();
    const counters = {
      cities: section.querySelector<HTMLElement>('[data-c="ciudades"]'),
      regions: section.querySelector<HTMLElement>('[data-c="regiones"]'),
      km: section.querySelector<HTMLElement>('[data-c="km"]'),
    };
    const format = (value: number) => value.toLocaleString('es-CL');
    const each = (id: string, fn: (node: Element) => void) =>
      section.querySelectorAll(`[data-city="${id}"]`).forEach(fn);

    let full = [0, 0, 1, 1];
    let zoomed = [0, 0, 1, 1];
    let state = 0; // 0 idle, 1 zooming, 2 finished
    let timers: number[] = [];
    let frame = 0;

    const setViewBox = (v: number[]) => {
      svg.setAttribute('viewBox', v.map((n) => n.toFixed(1)).join(' '));
      svg.style.setProperty('--u', (v[2] / box.clientWidth).toFixed(4));
    };
    const layout = () => {
      const aspect = box.clientWidth / box.clientHeight;
      const fullHeight = 4500;
      full = [404 - (fullHeight * aspect) / 2, -300, fullHeight * aspect, fullHeight];
      const height = 2540;
      const width = Math.max(1150, height * aspect);
      const fitted = width / aspect;
      zoomed = [372 - width / 2, 1320 - fitted / 2, width, fitted];
      const unit = width / box.clientWidth;
      svg.querySelectorAll<SVGGElement>('[data-parallel]').forEach((label) => {
        label.setAttribute('transform', `translate(${(zoomed[0] + 12 * unit).toFixed(0)} ${label.dataset.parallel})`);
      });
      setViewBox(state ? zoomed : full);
    };

    const setCounters = (index: number) => {
      const shown = CITIES.slice(0, index + 1);
      if (counters.cities) counters.cities.textContent = String(shown.length);
      if (counters.regions) counters.regions.textContent = String(new Set(shown.map((city) => city.region)).size);
      if (counters.km) counters.km.textContent = format(index === CITIES.length - 1 ? SPAN_KM : CITIES[index].km);
    };
    const showAll = () => {
      svg.classList.add('draw', 'zoomed', 'done');
      box.classList.add('zoomed');
      CITIES.forEach((city) => each(city.id, (node) => node.classList.add('in')));
      setCounters(CITIES.length - 1);
    };
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const reset = () => {
      timers.forEach(window.clearTimeout);
      timers = [];
      cancelAnimationFrame(frame);
      svg.classList.add('nt');
      list.classList.add('nt');
      svg.classList.remove('draw', 'zoomed', 'done');
      box.classList.remove('zoomed');
      section.querySelectorAll('[data-city].in').forEach((node) => node.classList.remove('in'));
      Object.values(counters).forEach((node) => {
        if (node) node.textContent = '0';
      });
      state = 0;
      setViewBox(full);
      void svg.getBoundingClientRect();
      svg.classList.remove('nt');
      list.classList.remove('nt');
    };
    const lightCities = () => {
      svg.classList.add('zoomed');
      box.classList.add('zoomed');
      CITIES.forEach((city, index) =>
        later(300 + index * 400, () => {
          each(city.id, (node) => node.classList.add('in'));
          setCounters(index);
        })
      );
      later(300 + CITIES.length * 400 + 700, () => {
        svg.classList.add('done');
        state = 2;
      });
    };
    const zoom = () => {
      state = 1;
      const start = performance.now();
      const duration = 2000;
      const ratio = zoomed[2] / full[2];
      const step = (now: number) => {
        const p = clamp((now - start) / duration);
        const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const width = full[2] * Math.pow(ratio, eased);
        const k = (width - full[2]) / (zoomed[2] - full[2]);
        setViewBox([
          full[0] + (zoomed[0] - full[0]) * k,
          full[1] + (zoomed[1] - full[1]) * k,
          width,
          full[3] + (zoomed[3] - full[3]) * k,
        ]);
        if (p < 1) frame = requestAnimationFrame(step);
        else lightCities();
      };
      frame = requestAnimationFrame(step);
    };
    const play = () => {
      reset();
      requestAnimationFrame(() => {
        svg.classList.add('draw');
        later(2300, zoom);
      });
    };

    layout();
    let observer: IntersectionObserver | undefined;
    const replay = () => {
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      play();
    };
    if (reduce) {
      state = 2;
      setViewBox(zoomed);
      svg.classList.add('nt');
      showAll();
      if (again) again.hidden = true;
    } else {
      // Server-rendered finished (so it reads without JavaScript); blank it until it plays.
      reset();
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0].isIntersecting) return;
          observer?.disconnect();
          play();
        },
        { threshold: 0.35 }
      );
      observer.observe(box);
      again?.addEventListener('click', replay);
    }

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(layout, 120);
    };
    window.addEventListener('resize', onResize);

    const highlight = (id: string | null) => {
      svg.classList.toggle('hov', !!id);
      list.classList.toggle('hov', !!id);
      section.querySelectorAll('[data-city].on').forEach((node) => node.classList.remove('on'));
      if (id) each(id, (node) => node.classList.add('on'));
      const city = CITIES.find((candidate) => candidate.id === id);
      if (detail) detail.textContent = city ? `${city.name} · ${city.region}` : IDLE_HINT;
    };
    const pick = (event: Event) => {
      const node = (event.target as Element).closest<HTMLElement>('[data-city]');
      return node && node.classList.contains('in') ? node.dataset.city ?? null : null;
    };
    const over = (event: Event) => highlight(pick(event));
    const leave = () => highlight(null);
    const cityLayer = svg.querySelector('.cities');
    [list, cityLayer].forEach((layer) => {
      layer?.addEventListener('pointerover', over);
      layer?.addEventListener('pointerleave', leave);
      layer?.addEventListener('click', over);
    });
    list.addEventListener('focusin', over);
    list.addEventListener('focusout', leave);

    return () => {
      timers.forEach(window.clearTimeout);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      again?.removeEventListener('click', replay);
      [list, cityLayer].forEach((layer) => {
        layer?.removeEventListener('pointerover', over);
        layer?.removeEventListener('pointerleave', leave);
        layer?.removeEventListener('click', over);
      });
      list.removeEventListener('focusin', over);
      list.removeEventListener('focusout', leave);
    };
  }, []);

  return (
    <section className="mapa" id="mapa" ref={sectionRef}>
      <div className="wrap cols">
        <div>
          <div className="eyebrow rv">Dónde está pasando</div>
          <h2 className="rv">
            <span className="l">De Iquique</span> a Osorno
          </h2>
          <p className="lead rv">
            Trece ciudades tienen hoy escuelas que forman parte de la transformación. Una red que recorre Chile de
            norte a sur y que aprende junto a las escuelas de vanguardia de Barcelona.
          </p>
          <div className="nums rv">
            <div>
              <b data-c="ciudades">{CITIES.length}</b>
              <span>ciudades</span>
            </div>
            <div>
              <b data-c="regiones">{REGION_COUNT}</b>
              <span>regiones</span>
            </div>
            <div>
              <b data-c="km">{SPAN_KM.toLocaleString('es-CL')}</b>
              <span>km de norte a sur</span>
            </div>
          </div>
          <ul className="zonas">
            {ZONES.map((zone) => (
              <li key={zone}>
                <span>{zone}</span>
                <div>
                  {CITIES.filter((city) => city.zone === zone).map((city) => (
                    <button
                      type="button"
                      key={city.id}
                      className="in"
                      data-city={city.id}
                      data-testid={`mapa-ciudad-${city.id}`}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <p className="nota det" aria-live="polite">
            {IDLE_HINT}
          </p>
          <div className="foot">
            <Link className="btn mag" href="#contacto" data-testid="mapa-cta">
              ¿Tu escuela es la próxima? <span className="arr">→</span>
            </Link>
            <button className="again" type="button" data-testid="mapa-ver-de-nuevo">
              ↻ Ver de nuevo
            </button>
          </div>
        </div>
        <div className="mapbox">
          <svg
            className="m draw zoomed done"
            role="img"
            aria-label={`Mapa de Chile con las ${CITIES.length} ciudades donde hay escuelas que forman parte de la transformación: ${CITIES.map((city) => city.name).join(', ')}`}
            viewBox="-520 50 1784 2540"
            preserveAspectRatio="xMidYMid meet"
          >
            <g className="grat">
              {PARALLELS.map((parallel) => {
                const y = (parallel - 17.2) * 100;
                return (
                  <React.Fragment key={parallel}>
                    <line x1={-3000} x2={4000} y1={y} y2={y} />
                    <g data-parallel={y} transform={`translate(-500 ${y})`}>
                      <text className="sc" x={0} y={-6}>{`${parallel}° S`}</text>
                    </g>
                  </React.Fragment>
                );
              })}
            </g>
            <path className="isl" d={CHILE_ISLANDS} />
            <path className="land" pathLength={1} d={CHILE_MAIN} />
            <g className="route">
              {CITIES.slice(1).map((city, index) => (
                <path
                  key={city.id}
                  className="tramo in"
                  data-city={city.id}
                  pathLength={1}
                  d={`M${CITIES[index].x} ${CITIES[index].y}L${city.x} ${city.y}`}
                />
              ))}
              <path className="flujo" pathLength={1} d={ROUTE} />
            </g>
            <g className="cities">
              {CITIES.map((city) => (
                <g
                  key={city.id}
                  className="city in"
                  data-city={city.id}
                  transform={`translate(${city.x} ${city.y})`}
                >
                  <g className="sc">
                    <circle className="halo" r={6} />
                    <circle className="hit" r={20} />
                    <circle className="dot" r={5.5} />
                    <text
                      className="nm"
                      x={city.side * 14}
                      y={4 + (city.dy ?? 0)}
                      textAnchor={city.side < 0 ? 'end' : 'start'}
                    >
                      {city.name}
                    </text>
                  </g>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
