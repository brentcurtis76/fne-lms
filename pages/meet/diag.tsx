import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * /meet/diag — capability probe for the Zoom hardware/network protocol (Z0B).
 *
 * This is the instrument consultores open on a school machine during a field
 * visit: it reports what the browser can actually do, in one screen, and
 * exports every reading as a single JSON blob to paste into the protocol
 * results sheet (docs/planning/zoom-hw-protocol.md).
 *
 * Two things it deliberately is NOT:
 *  - It is not a meeting. There is no meeting id, no join, no Zoom credential,
 *    and therefore no meeting authorization to perform. Gating is session
 *    presence only, exactly like the middleware matcher already enforces for
 *    /meet/*.
 *  - It is not a fix. Nothing here changes headers or capabilities; the
 *    crossOriginIsolated / SharedArrayBuffer rows MEASURE the current state.
 *    COOP/COEP are not set anywhere in this repo and this page does not set
 *    them.
 *
 * The camera+microphone probe doubles as the live proof of the /meet
 * Permissions-Policy override in next.config.js: under the global policy
 * (`camera=(), microphone=()`) getUserMedia is blocked before any browser
 * prompt; on /meet/* it reaches the prompt and can succeed.
 *
 * Built light on purpose — old school hardware, small screens, no layout
 * chrome, no data fetching.
 */

const REPORT_SCHEMA_VERSION = 2;

/**
 * Meeting SDK, loaded from Zoom's CDN on demand (Z0B-2).
 *
 * Not an npm dependency on purpose: `@zoom/meetingsdk@6.2.0` declares
 * `peer react@"18.2.0"` exactly and this repo runs react 18.3.1, so npm refuses
 * the install without `--legacy-peer-deps` — a flag that would change install
 * resolution for every CI job to serve one spike probe. Loading the standalone
 * bundle keeps package.json untouched and keeps the 3.7 MB bundle out of the
 * initial page load (it is fetched only when a tester presses "Entrar").
 * The React pin is a finding handed to Z3 (results §6).
 */
const SDK_VERSION = '6.2.0';
const SDK_BASE = `https://source.zoom.us/${SDK_VERSION}`;
const SDK_SRC = `${SDK_BASE}/zoom-meeting-embedded-${SDK_VERSION}.min.js`;

/**
 * Load order is load-bearing. The Component View bundle treats React and
 * ReactDOM as EXTERNALS: with no `window.React` present it throws
 * "ReferenceError: React is not defined" while evaluating and never assigns
 * `window.ZoomMtgEmbedded`. Zoom's vendor copies are react 18.2.0 — the exact
 * version the npm package pins as a peer, which is why they must come from Zoom
 * rather than from this app's own React 18.3.1.
 *
 * These globals are inert for the rest of the page: Next.js resolves React
 * through its bundle, never through `window.React`, and the SDK renders its own
 * tree into its own root element. Verified empirically (results §6).
 */
const SDK_VENDOR_SRCS = [
  `${SDK_BASE}/lib/vendor/react.min.js`,
  `${SDK_BASE}/lib/vendor/react-dom.min.js`,
];

/** The slice of the Component View surface this probe uses. */
type ZoomEmbeddedClient = {
  init: (options: {
    zoomAppRoot: HTMLElement;
    language: string;
    patchJsMedia?: boolean;
    leaveOnPageUnload?: boolean;
  }) => Promise<void>;
  join: (options: {
    sdkKey: string;
    signature: string;
    meetingNumber: string;
    userName: string;
    password?: string;
  }) => Promise<void>;
  leave: () => Promise<void>;
};

type ZoomEmbeddedGlobal = { createClient: () => ZoomEmbeddedClient };

declare global {
  interface Window {
    ZoomMtgEmbedded?: ZoomEmbeddedGlobal;
  }
}

/** Appends one classic script and resolves on load. Reuses an existing tag. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-sdk-src="${src}"]`);
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    const script = existing ?? document.createElement('script');
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      'error',
      () =>
        reject(
          new Error('No se pudo descargar el SDK de Zoom. Revisa la conexión a internet del colegio.')
        ),
      { once: true }
    );
    if (!existing) {
      script.src = src;
      script.dataset.sdkSrc = src;
      document.head.appendChild(script);
    }
  });
}

async function loadMeetingSdk(): Promise<ZoomEmbeddedGlobal> {
  if (window.ZoomMtgEmbedded) return window.ZoomMtgEmbedded;
  // Sequential on purpose — see SDK_VENDOR_SRCS. Parallel loading would race
  // React against the bundle that expects it to already be there.
  for (const src of SDK_VENDOR_SRCS) {
    await loadScript(src);
  }
  await loadScript(SDK_SRC);
  if (!window.ZoomMtgEmbedded) {
    throw new Error('El SDK se descargó pero no quedó disponible en la página.');
  }
  return window.ZoomMtgEmbedded;
}

type JoinState = 'idle' | 'joining' | 'joined' | 'error';

/** Thresholds mirror the §17 device matrix: P0 = Win10 4GB dual-core / Win11 i5, P1 = Chromebook 4GB / Android tablet. */
const FLOORS = {
  cores: { pass: 4, warn: 2 },
  memoryGb: { pass: 8, warn: 4 },
  downlinkMbps: { pass: 4, warn: 1.5 },
  rttMs: { pass: 80, warn: 300 },
  screenWidth: { pass: 1024, warn: 768 },
} as const;

type ProbeStatus = 'pass' | 'warn' | 'fail' | 'info' | 'pending';

type Probe = {
  id: string;
  label: string;
  value: string;
  status: ProbeStatus;
  /** Why this reading matters / what the threshold is. Shown under the value. */
  note?: string;
};

type DiagReport = {
  schemaVersion: number;
  capturedAt: string;
  surface: '/meet/diag';
  probes: Probe[];
};

type NavigatorConnection = {
  downlink?: number;
  rtt?: number;
  effectiveType?: string;
  saveData?: boolean;
};

type ExtendedNavigator = Navigator & {
  deviceMemory?: number;
  connection?: NavigatorConnection;
  mozConnection?: NavigatorConnection;
  webkitConnection?: NavigatorConnection;
};

const STATUS_LABEL: Record<ProbeStatus, string> = {
  pass: 'OK',
  warn: 'Atención',
  fail: 'Falla',
  info: 'Dato',
  pending: 'Sin medir',
};

const STATUS_CLASS: Record<ProbeStatus, string> = {
  pass: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-800',
  fail: 'bg-red-100 text-red-800',
  info: 'bg-gray-100 text-gray-700',
  pending: 'bg-gray-100 text-gray-500',
};

/** Coarse browser identification — the §17 matrix is per browser family. */
function identifyBrowser(ua: string): string {
  const match = (re: RegExp, name: string): string | null => {
    const found = ua.match(re);
    return found ? `${name} ${found[1]}` : null;
  };
  return (
    match(/Edg\/([\d.]+)/, 'Edge') ??
    match(/OPR\/([\d.]+)/, 'Opera') ??
    match(/Firefox\/([\d.]+)/, 'Firefox') ??
    // Chrome must be tested after Edge/Opera — both carry "Chrome/" too.
    match(/Chrome\/([\d.]+)/, 'Chrome') ??
    match(/Version\/([\d.]+).*Safari/, 'Safari') ??
    'Desconocido'
  );
}

function readConnection(nav: ExtendedNavigator): NavigatorConnection | undefined {
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

function readWebglRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return null;
    // Browsers increasingly restrict the unmasked strings; fall back to the
    // generic RENDERER, which is always readable.
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const unmasked = debugInfo
      ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string | null)
      : null;
    return unmasked ?? (gl.getParameter(gl.RENDERER) as string | null) ?? null;
  } catch {
    return null;
  }
}

function hasWasm(): boolean {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  } catch {
    return false;
  }
}

/** Grades a higher-is-better reading. */
function gradeAtLeast(value: number, floors: { pass: number; warn: number }): ProbeStatus {
  if (value >= floors.pass) return 'pass';
  if (value >= floors.warn) return 'warn';
  return 'fail';
}

/** Grades a lower-is-better reading. */
function gradeAtMost(value: number, floors: { pass: number; warn: number }): ProbeStatus {
  if (value <= floors.pass) return 'pass';
  if (value <= floors.warn) return 'warn';
  return 'fail';
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${bytes} bytes`;
}

/**
 * Everything that can be read without asking the user for anything.
 * Runs once on mount.
 */
function collectPassiveProbes(): Probe[] {
  const nav = navigator as ExtendedNavigator;
  const connection = readConnection(nav);
  const probes: Probe[] = [];

  probes.push({
    id: 'browser',
    label: 'Navegador',
    value: identifyBrowser(nav.userAgent),
    status: 'info',
    note: 'La matriz de pruebas cubre Chrome, Edge, Firefox y Safari.',
  });

  probes.push({
    id: 'user-agent',
    label: 'User agent',
    value: nav.userAgent,
    status: 'info',
  });

  probes.push({
    id: 'platform',
    label: 'Plataforma',
    value: nav.platform || 'No informada',
    status: 'info',
  });

  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null;
  probes.push({
    id: 'cpu-cores',
    label: 'Núcleos de CPU',
    value: cores === null ? 'No informado' : String(cores),
    status: cores === null ? 'info' : gradeAtLeast(cores, FLOORS.cores),
    note: `Mínimo del equipo P0: ${FLOORS.cores.warn} núcleos. Recomendado: ${FLOORS.cores.pass}.`,
  });

  const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  probes.push({
    id: 'device-memory',
    label: 'Memoria RAM (aprox.)',
    value: memory === null ? 'No informada (solo Chrome/Edge)' : `${memory} GB`,
    status: memory === null ? 'info' : gradeAtLeast(memory, FLOORS.memoryGb),
    note: `Mínimo P0/P1: ${FLOORS.memoryGb.warn} GB. El navegador redondea este valor hacia abajo.`,
  });

  const width = window.screen.width;
  const height = window.screen.height;
  const dpr = window.devicePixelRatio;
  probes.push({
    id: 'screen',
    label: 'Pantalla',
    value: `${width} × ${height} px · DPR ${dpr}`,
    status: gradeAtLeast(width, FLOORS.screenWidth),
    note: `Bajo ${FLOORS.screenWidth.warn} px de ancho la vista embebida de escritorio no es usable.`,
  });

  if (connection && typeof connection.downlink === 'number') {
    probes.push({
      id: 'downlink',
      label: 'Ancho de banda estimado',
      value: `${connection.downlink} Mbps${connection.effectiveType ? ` (${connection.effectiveType})` : ''}`,
      status: gradeAtLeast(connection.downlink, FLOORS.downlinkMbps),
      note: `Perfiles de la prueba: fibra · 4 Mbps · 1,5 Mbps. Es una estimación del navegador, no una medición de red.`,
    });
  } else {
    probes.push({
      id: 'downlink',
      label: 'Ancho de banda estimado',
      value: 'No informado (solo Chrome/Edge)',
      status: 'info',
      note: 'En Firefox y Safari mide la red con la herramienta indicada en el protocolo.',
    });
  }

  if (connection && typeof connection.rtt === 'number') {
    probes.push({
      id: 'rtt',
      label: 'Latencia estimada (RTT)',
      value: `${connection.rtt} ms`,
      status: gradeAtMost(connection.rtt, FLOORS.rttMs),
      note: `Perfiles de la prueba: 80 ms y 300 ms. Es una estimación del navegador.`,
    });
  } else {
    probes.push({
      id: 'rtt',
      label: 'Latencia estimada (RTT)',
      value: 'No informada (solo Chrome/Edge)',
      status: 'info',
    });
  }

  if (connection && typeof connection.saveData === 'boolean') {
    probes.push({
      id: 'save-data',
      label: 'Modo ahorro de datos',
      value: connection.saveData ? 'Activado' : 'Desactivado',
      status: connection.saveData ? 'warn' : 'pass',
      note: 'Con ahorro de datos activado el navegador degrada video sin avisar.',
    });
  }

  const wasm = hasWasm();
  probes.push({
    id: 'wasm',
    label: 'WebAssembly',
    value: wasm ? 'Disponible' : 'No disponible',
    status: wasm ? 'pass' : 'fail',
    note: 'El SDK de video lo necesita. Sin WebAssembly no hay experiencia embebida.',
  });

  const renderer = readWebglRenderer();
  const softwareRenderer = renderer !== null && /swiftshader|software|llvmpipe/i.test(renderer);
  probes.push({
    id: 'webgl',
    label: 'WebGL / aceleración gráfica',
    value: renderer ?? 'No disponible',
    status: renderer === null ? 'fail' : softwareRenderer ? 'warn' : 'pass',
    note: 'Un renderizador por software (SwiftShader, llvmpipe) sube mucho el uso de CPU con varias cámaras.',
  });

  const isolated = (window as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  probes.push({
    id: 'cross-origin-isolated',
    label: 'crossOriginIsolated',
    value: isolated ? 'Sí' : 'No',
    status: 'info',
    note: 'Solo medición. Sin aislamiento se pierden envío en 720p, supresión de ruido y audio de pestaña; la reunión funciona igual.',
  });

  const sab = typeof (window as unknown as { SharedArrayBuffer?: unknown }).SharedArrayBuffer !== 'undefined';
  probes.push({
    id: 'shared-array-buffer',
    label: 'SharedArrayBuffer',
    value: sab ? 'Disponible' : 'No disponible',
    status: 'info',
    note: 'Solo medición. Esta página no modifica ninguna cabecera para habilitarlo.',
  });

  let timezone = 'No informada';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
  } catch {
    /* Intl siempre existe en los navegadores del alcance; el catch es defensivo. */
  }
  probes.push({
    id: 'timezone',
    label: 'Zona horaria del equipo',
    value: `${timezone} (UTC${new Date().getTimezoneOffset() > 0 ? '-' : '+'}${Math.abs(new Date().getTimezoneOffset() / 60)})`,
    status: timezone === 'America/Santiago' ? 'pass' : 'warn',
    note: 'Las sesiones se agendan en hora de Chile. Un equipo con otra zona muestra horarios corridos.',
  });

  probes.push({
    id: 'cpu-load',
    label: 'Uso de CPU durante la reunión',
    value: 'No medible desde el navegador',
    status: 'info',
    note: 'Se mide en el equipo (Administrador de tareas) durante la llamada, según el protocolo. Umbral: bajo 90%.',
  });

  return probes;
}

type MeetDiagPageProps = {
  /** Public SDK app key, or null when the deployment has no Zoom env configured. */
  sdkClientId: string | null;
};

const MeetDiagPage: React.FC<MeetDiagPageProps> = ({ sdkClientId }) => {
  const [probes, setProbes] = useState<Probe[]>([]);
  const [storageProbe, setStorageProbe] = useState<Probe | null>(null);
  const [meetingNumber, setMeetingNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [joinState, setJoinState] = useState<JoinState>('idle');
  const [joinProbe, setJoinProbe] = useState<Probe>({
    id: 'test-join',
    label: 'Tiempo hasta entrar a la reunión',
    value: 'Sin probar',
    status: 'pending',
    note: 'Umbral del protocolo (B1): menos de 20 segundos desde el clic hasta ver y escuchar.',
  });
  const sdkRootRef = React.useRef<HTMLDivElement | null>(null);
  const clientRef = React.useRef<ZoomEmbeddedClient | null>(null);
  const [mediaProbe, setMediaProbe] = useState<Probe>({
    id: 'get-user-media',
    label: 'Cámara y micrófono',
    value: 'Sin probar',
    status: 'pending',
    note: 'Presiona "Probar cámara y micrófono". El navegador pedirá permiso.',
  });
  const [capturedAt, setCapturedAt] = useState<string>('');
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    setProbes(collectPassiveProbes());
    setCapturedAt(new Date().toISOString());

    let cancelled = false;
    const estimate = navigator.storage?.estimate;
    if (typeof estimate === 'function') {
      navigator.storage
        .estimate()
        .then((result) => {
          if (cancelled) return;
          const quota = result.quota ?? 0;
          const usage = result.usage ?? 0;
          setStorageProbe({
            id: 'storage',
            label: 'Almacenamiento disponible',
            value: `${formatBytes(quota - usage)} libres de ${formatBytes(quota)}`,
            status: 'info',
            note: 'Referencial. El SDK guarda pocos megabytes en caché.',
          });
        })
        .catch(() => {
          if (cancelled) return;
          setStorageProbe({
            id: 'storage',
            label: 'Almacenamiento disponible',
            value: 'No informado',
            status: 'info',
          });
        });
    } else {
      setStorageProbe({
        id: 'storage',
        label: 'Almacenamiento disponible',
        value: 'No informado',
        status: 'info',
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const runMediaProbe = useCallback(async () => {
    setMediaProbe((current) => ({ ...current, value: 'Solicitando permiso…', status: 'pending' }));

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaProbe({
        id: 'get-user-media',
        label: 'Cámara y micrófono',
        value: 'getUserMedia no disponible en este navegador',
        status: 'fail',
        note: 'Suele indicar un contexto no seguro (sin HTTPS) o un navegador demasiado antiguo.',
      });
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const video = stream.getVideoTracks();
      const audio = stream.getAudioTracks();
      const settings = video[0]?.getSettings();
      const resolution =
        settings?.width && settings?.height ? ` · ${settings.width}×${settings.height}` : '';
      setMediaProbe({
        id: 'get-user-media',
        label: 'Cámara y micrófono',
        value: `Cámara: ${video.length} · Micrófono: ${audio.length}${resolution}`,
        status: video.length > 0 && audio.length > 0 ? 'pass' : 'warn',
        note:
          video.length > 0 && audio.length > 0
            ? 'Permiso concedido y ambos dispositivos entregados. Esto confirma que la política de permisos de /meet permite la videollamada.'
            : 'Falta uno de los dos dispositivos. Revisa que el equipo tenga cámara y micrófono conectados.',
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : 'Error';
      const explanation =
        name === 'NotAllowedError'
          ? 'Permiso denegado por la persona usuaria o bloqueado por la política del navegador.'
          : name === 'NotFoundError'
            ? 'El equipo no tiene cámara o micrófono disponibles.'
            : name === 'NotReadableError'
              ? 'Otra aplicación está usando la cámara o el micrófono.'
              : 'Revisa la consola del navegador para el detalle.';
      setMediaProbe({
        id: 'get-user-media',
        label: 'Cámara y micrófono',
        value: `Error: ${name}`,
        status: 'fail',
        note: explanation,
      });
    } finally {
      // Always release the devices — the camera light staying on during a
      // school visit is alarming and this page never needs the stream.
      stream?.getTracks().forEach((track) => track.stop());
    }
  }, []);

  /**
   * The B1 measurement from the field protocol: time from the click to a joined
   * meeting. Measured with performance.now() around the SDK's own join promise —
   * the protocol asks the tester to stopwatch it, and this removes that error.
   *
   * Also the functional check of two things no document can settle: that the SDK
   * app's Embed toggle is actually on, and what the current SDK requires to join
   * an in-account meeting. A failure here is a RESULT, so the error text is
   * surfaced verbatim rather than smoothed over.
   */
  const runTestJoin = useCallback(async () => {
    const digits = meetingNumber.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 11) {
      setJoinProbe({
        id: 'test-join',
        label: 'Tiempo hasta entrar a la reunión',
        value: 'Número de reunión inválido',
        status: 'fail',
        note: 'El número de la reunión tiene entre 9 y 11 dígitos. Cópialo sin espacios.',
      });
      setJoinState('error');
      return;
    }

    setJoinState('joining');
    setJoinProbe((current) => ({ ...current, value: 'Entrando…', status: 'pending' }));

    const startedAt = performance.now();
    try {
      const signatureResponse = await fetch('/api/meet/diag-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingNumber: digits }),
      });
      if (!signatureResponse.ok) {
        throw new Error(
          signatureResponse.status === 404
            ? 'Esta instalación no tiene credenciales de Zoom configuradas.'
            : `No se pudo firmar la entrada (HTTP ${signatureResponse.status}).`
        );
      }
      const { signature, sdkKey } = (await signatureResponse.json()) as {
        signature: string;
        sdkKey: string;
      };

      const sdk = await loadMeetingSdk();
      const root = sdkRootRef.current;
      if (!root) throw new Error('No se encontró el contenedor de la reunión.');

      const client = clientRef.current ?? sdk.createClient();
      if (!clientRef.current) {
        await client.init({
          zoomAppRoot: root,
          // §20: the SDK ships es-ES; there is no es-CL locale.
          language: 'es-ES',
          patchJsMedia: true,
          leaveOnPageUnload: true,
        });
        clientRef.current = client;
      }

      await client.join({
        sdkKey,
        signature,
        meetingNumber: digits,
        userName: 'Prueba de equipo',
        ...(passcode ? { password: passcode } : {}),
      });

      const elapsedMs = Math.round(performance.now() - startedAt);
      const seconds = (elapsedMs / 1000).toFixed(1);
      setJoinProbe({
        id: 'test-join',
        label: 'Tiempo hasta entrar a la reunión',
        value: `${seconds} s (${elapsedMs} ms)`,
        // B1 threshold from the protocol: under 20 s passes.
        status: elapsedMs <= 20_000 ? 'pass' : 'fail',
        note: `Umbral del protocolo (B1): menos de 20 segundos. Medido desde el clic hasta que el SDK confirma la entrada. SDK ${SDK_VERSION}.`,
      });
      setJoinState('joined');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJoinProbe({
        id: 'test-join',
        label: 'Tiempo hasta entrar a la reunión',
        value: `No se pudo entrar: ${message}`,
        status: 'fail',
        note: 'Anota este mensaje completo en la planilla: distingue un problema de red de un problema de la cuenta de Zoom.',
      });
      setJoinState('error');
    }
  }, [meetingNumber, passcode]);

  const leaveTestJoin = useCallback(async () => {
    try {
      await clientRef.current?.leave();
    } catch {
      /* Leaving is best-effort — the tester is about to close the tab anyway. */
    }
    setJoinState('idle');
  }, []);

  const allProbes = useMemo<Probe[]>(
    () => [
      ...probes,
      ...(storageProbe ? [storageProbe] : []),
      mediaProbe,
      // Always present in the report, even unmeasured: a blank B1 column and a
      // "not attempted" reading are different facts for the embed decision.
      joinProbe,
    ],
    [probes, storageProbe, mediaProbe, joinProbe]
  );

  const report = useMemo<DiagReport>(
    () => ({
      schemaVersion: REPORT_SCHEMA_VERSION,
      capturedAt,
      surface: '/meet/diag',
      probes: allProbes,
    }),
    [capturedAt, allProbes]
  );

  const reportJson = useMemo(() => JSON.stringify(report, null, 2), [report]);

  const counts = useMemo(() => {
    return allProbes.reduce(
      (acc, probe) => ({ ...acc, [probe.status]: (acc[probe.status] ?? 0) + 1 }),
      {} as Partial<Record<ProbeStatus, number>>
    );
  }, [allProbes]);

  const copyReport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportJson);
      setCopyState('ok');
    } catch {
      setCopyState('error');
    }
  }, [reportJson]);

  return (
    <>
      <Head>
        <title>Diagnóstico de equipo — Reuniones | GENERA</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto w-full max-w-3xl">
          <header className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Reuniones · Diagnóstico
            </p>
            <h1 className="mt-1 text-xl font-semibold text-brand_primary sm:text-2xl">
              Diagnóstico del equipo
            </h1>
            <p className="mt-3 text-sm text-gray-600">
              Esta página revisa si este computador y esta red pueden sostener una videollamada
              dentro de GENERA. No inicia ninguna reunión ni graba nada.
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Sigue el protocolo de la visita, presiona{' '}
              <span className="font-medium">Probar cámara y micrófono</span> y luego{' '}
              <span className="font-medium">Copiar resultados</span>.
            </p>
          </header>

          <section className="mt-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Mediciones</h2>
              <p className="text-xs text-gray-500" data-testid="diag-summary">
                {counts.pass ?? 0} OK · {counts.warn ?? 0} con atención · {counts.fail ?? 0} con
                falla
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Medición
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Resultado
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allProbes.map((probe) => (
                    <tr
                      key={probe.id}
                      className="border-b border-gray-100 align-top"
                      data-testid={`diag-row-${probe.id}`}
                    >
                      <th scope="row" className="py-3 pr-3 font-medium text-gray-800">
                        {probe.label}
                      </th>
                      <td className="py-3 pr-3 text-gray-700">
                        <span className="break-words">{probe.value}</span>
                        {probe.note ? (
                          <span className="mt-1 block text-xs text-gray-500">{probe.note}</span>
                        ) : null}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[probe.status]}`}
                        >
                          {STATUS_LABEL[probe.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {allProbes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-sm text-gray-500">
                        Midiendo…
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs text-gray-500">
              Referencia de equipos: <span className="font-medium">P0</span> = Windows 10 con 4 GB y
              doble núcleo, o Windows 11 con procesador i5.{' '}
              <span className="font-medium">P1</span> = Chromebook con 4 GB o tablet Android. Un
              resultado &ldquo;Atención&rdquo; no impide usar la plataforma: significa que el equipo
              está en el mínimo y hay que anotarlo en la planilla.
            </p>
          </section>

          <section className="mt-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Prueba de cámara y micrófono</h2>
            <p className="mt-2 text-sm text-gray-600">
              El navegador pedirá permiso. Acepta para que la prueba sea válida. La cámara se apaga
              apenas termina la medición.
            </p>
            <button
              type="button"
              onClick={runMediaProbe}
              data-testid="diag-media-probe-button"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-brand_primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
            >
              Probar cámara y micrófono
            </button>
          </section>

          {sdkClientId === null ? (
            <section className="mt-5 rounded-xl border border-dashed border-gray-300 bg-white p-6">
              <h2 className="text-base font-semibold text-gray-900">Prueba de conexión</h2>
              <p className="mt-2 text-sm text-gray-600" data-testid="diag-join-placeholder">
                Prueba de conexión: disponible próximamente.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Este bloque necesita las credenciales de Zoom configuradas en el servidor. El resto
                del diagnóstico funciona igual: continúa con la Parte A del protocolo.
              </p>
            </section>
          ) : (
            <section className="mt-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900">Prueba de conexión</h2>
              <p className="mt-2 text-sm text-gray-600">
                Escribe el número y la clave de la reunión de prueba que te pasaron, y presiona{' '}
                <span className="font-medium">Entrar a la reunión</span>. El tiempo se mide solo y
                queda en el bloque de resultados.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-gray-800">Número de reunión</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={meetingNumber}
                    onChange={(event) => setMeetingNumber(event.target.value)}
                    placeholder="Por ejemplo: 87239242778"
                    data-testid="diag-join-meeting-number"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand_primary focus:outline-none focus:ring-1 focus:ring-brand_accent"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-800">Clave de la reunión</span>
                  <input
                    type="text"
                    autoComplete="off"
                    value={passcode}
                    onChange={(event) => setPasscode(event.target.value)}
                    placeholder="Si la reunión no tiene clave, déjalo vacío"
                    data-testid="diag-join-passcode"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand_primary focus:outline-none focus:ring-1 focus:ring-brand_accent"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runTestJoin}
                  disabled={joinState === 'joining' || joinState === 'joined'}
                  data-testid="diag-join-button"
                  className="inline-flex items-center justify-center rounded-lg bg-brand_primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand_gray_dark focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joinState === 'joining' ? 'Entrando…' : 'Entrar a la reunión'}
                </button>
                {joinState === 'joined' ? (
                  <button
                    type="button"
                    onClick={leaveTestJoin}
                    data-testid="diag-join-leave-button"
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
                  >
                    Salir de la reunión
                  </button>
                ) : null}
                <span className="text-sm text-gray-600" data-testid="diag-join-status">
                  {joinProbe.value}
                </span>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Para la medición B2 del protocolo, entra y sal tres veces seguidas y anota si las
                tres funcionaron. El video se abre dentro de esta misma página.
              </p>

              {/*
                The SDK renders itself into this element. It stays mounted so the
                client can be reused across the 3 join/leave cycles the protocol
                asks for (B2), instead of re-initialising each time.
              */}
              <div
                ref={sdkRootRef}
                data-testid="diag-join-sdk-root"
                className="mt-4 min-h-0 w-full overflow-hidden rounded-lg"
              />
            </section>
          )}

          <section className="mt-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900">Resultados</h2>
            <p className="mt-2 text-sm text-gray-600">
              Copia este bloque y pégalo en la planilla de la visita.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copyReport}
                data-testid="diag-copy-button"
                className="inline-flex items-center justify-center rounded-lg border border-brand_primary px-4 py-2.5 text-sm font-medium text-brand_primary transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
              >
                Copiar resultados
              </button>
              {copyState === 'ok' ? (
                <span className="text-sm text-green-700" data-testid="diag-copy-ok">
                  Copiado.
                </span>
              ) : null}
              {copyState === 'error' ? (
                <span className="text-sm text-amber-700" data-testid="diag-copy-error">
                  No se pudo copiar automáticamente. Selecciona el texto de abajo y cópialo a mano.
                </span>
              ) : null}
            </div>
            <textarea
              readOnly
              value={reportJson}
              rows={10}
              data-testid="diag-report-json"
              aria-label="Resultados en formato JSON"
              className="mt-4 w-full rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700"
            />
          </section>

          <div className="mt-5 px-1">
            <Link
              href="/dashboard"
              data-testid="diag-back-link"
              className="text-sm font-medium text-gray-600 hover:text-brand_primary"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    </>
  );
};

/**
 * Session presence only — the same bar the middleware already sets for
 * /meet/*. There is no meeting here, so there is nothing to authorize against;
 * adding a role check would only stop the consultores this page exists for.
 */
export const getServerSideProps: GetServerSideProps<MeetDiagPageProps> = async (context) => {
  const supabase = createPagesServerClient(context);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: `/login?next=${encodeURIComponent(context.resolvedUrl)}`,
        permanent: false,
      },
    };
  }

  // Read here rather than inlining NEXT_PUBLIC_* in the component so the absent
  // case is an explicit prop the page can branch on (and a test can assert)
  // instead of an undefined that silently renders a broken control.
  return { props: { sdkClientId: process.env.NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID ?? null } };
};

export default MeetDiagPage;
