import React from 'react';

type Point = [number, number];

/** Twelve schools of a network, placed by hand; no particular school is meant by any of them. */
const NODES: Point[] = [
  [70, 120], [175, 58], [292, 96], [412, 52], [500, 138], [122, 232],
  [252, 204], [384, 214], [492, 280], [84, 352], [226, 344], [366, 366],
];

const LINKS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 6], [2, 7], [3, 7], [4, 7], [4, 8],
  [5, 6], [6, 7], [7, 8], [5, 9], [5, 10], [6, 10], [7, 11], [8, 11], [9, 10], [10, 11], [6, 11],
];

/** The visitor's way through the network: every school once, always along a link. */
const ROUTE = [0, 1, 6, 2, 7, 3, 4, 8, 11, 10, 5, 9];
const LOOP_SECONDS = 18;

const ROUTE_PATH = `M${ROUTE.map((index) => NODES[index].join(' ')).join('L')}`;

/** When the traveller reaches each school, as a fraction of the whole route. */
const ARRIVAL: number[] = (() => {
  const reached: number[] = [0];
  for (let step = 1; step < ROUTE.length; step++) {
    const [ax, ay] = NODES[ROUTE[step - 1]];
    const [bx, by] = NODES[ROUTE[step]];
    reached.push(reached[step - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = reached[reached.length - 1];
  const byNode: number[] = [];
  ROUTE.forEach((node, step) => {
    byNode[node] = reached[step] / total;
  });
  return byNode;
})();

/**
 * "Un ecosistema, no una escuela suelta", drawn: a network of schools and one
 * gold point that travels through all of them, each lighting up as it arrives.
 * Decorative only, so it is hidden from assistive technology.
 */
export default function Ecosistema() {
  return (
    <div className="eco mv" aria-hidden="true">
      <svg viewBox="0 0 570 420" focusable="false">
        <g className="hilos">
          {LINKS.map(([a, b], index) => (
            <path
              key={`${a}-${b}`}
              className="hilo"
              pathLength={1}
              d={`M${NODES[a].join(' ')}L${NODES[b].join(' ')}`}
              style={{ ['--i' as string]: index }}
            />
          ))}
        </g>
        <path className="ruta" d={ROUTE_PATH} />
        {NODES.map(([x, y], index) => (
          <g
            key={index}
            className="escuela"
            transform={`translate(${x} ${y})`}
            style={{ animationDelay: `${(ARRIVAL[index] * LOOP_SECONDS).toFixed(2)}s` }}
          >
            <circle className="halo" r={18} />
            <circle className="punto" r={8} />
          </g>
        ))}
        <circle
          className="viajero"
          r={7.5}
          style={{ offsetPath: `path("${ROUTE_PATH}")`, animationDuration: `${LOOP_SECONDS}s` }}
        />
      </svg>
      <span className="mano">en red</span>
    </div>
  );
}
