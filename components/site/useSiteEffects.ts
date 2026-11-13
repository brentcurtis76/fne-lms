import { RefObject, useEffect } from 'react';

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
}

/**
 * Page-wide behaviour of the public site, attached to the `.ne` root:
 * scroll reveals (`.rv`, `.clip`), count-up numbers (`[data-n]`), the nav that
 * turns solid and hides on the way down, the progress bar, magnetic buttons
 * (`.mag`), the ring cursor and image parallax (`[data-img-par]`).
 *
 * Everything is plain DOM on purpose: these effects only toggle classes and
 * inline transforms, so they never cause a React render.
 */
export function useSiteEffects(root: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // `ne-js` gates the styles that hide content until it is revealed. On a
    // first load SiteLayout's inline script has already set it before paint; it
    // is left in place on unmount (it only affects `.ne` descendants) so moving
    // between the site's pages never flashes content in and out.
    const html = document.documentElement;
    html.classList.add('ne-html', 'ne-js');

    const reduce = prefersReducedMotion();
    const fine = !!window.matchMedia?.('(hover:hover) and (pointer:fine)').matches;
    // Every listener below is registered with this signal, so one abort removes them all.
    const listeners = new AbortController();
    const { signal } = listeners;

    const readyTimer = window.setTimeout(() => el.classList.add('ready'), 80);

    /* reveal + count-up; content that arrives later (news) is picked up by the MutationObserver */
    const seen = new WeakSet<Element>();
    const hasIO = 'IntersectionObserver' in window;
    const formatNumber = (value: number) => value.toLocaleString('es-CL');

    const reveal = hasIO
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((entry) => {
              // A block taller than the screen never shows 14% of itself: a fifth of the screen is enough.
              const enough =
                entry.intersectionRatio >= 0.14 || entry.intersectionRect.height >= window.innerHeight * 0.2;
              if (!entry.isIntersecting || !enough) return;
              entry.target.classList.add('in');
              reveal?.unobserve(entry.target);
            }),
          { threshold: [0, 0.05, 0.14], rootMargin: '0px 0px -6% 0px' }
        )
      : null;

    const counter = hasIO
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              counter?.unobserve(entry.target);
              if (reduce) return;
              const target = entry.target as HTMLElement;
              const end = Number(target.dataset.n);
              const prefix = target.dataset.pre || '';
              const start = performance.now() + 500;
              const tick = (now: number) => {
                const progress = clamp((now - start) / 1600);
                const value = Math.round(end * (1 - Math.pow(1 - progress, 4)));
                target.textContent = prefix + formatNumber(value);
                if (progress < 1) requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            }),
          { threshold: 0.5 }
        )
      : null;

    const watch = () => {
      el.querySelectorAll('.rv,.clip,.mv').forEach((node) => {
        if (seen.has(node)) return;
        seen.add(node);
        if (reveal) reveal.observe(node);
        else node.classList.add('in');
      });
      el.querySelectorAll('[data-n]').forEach((node) => {
        if (seen.has(node)) return;
        seen.add(node);
        counter?.observe(node);
      });
    };
    watch();
    const mutations = 'MutationObserver' in window ? new MutationObserver(watch) : null;
    mutations?.observe(el, { childList: true, subtree: true });

    /* nav, progress bar, parallax */
    const nav = el.querySelector<HTMLElement>('.nav');
    const progress = el.querySelector<HTMLElement>('.prog');
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      if (progress) progress.style.transform = `scaleX(${height > 0 ? y / height : 0})`;
      if (nav) {
        nav.classList.toggle('solid', y > 60);
        nav.classList.toggle(
          'away',
          y > window.innerHeight && y > lastY && !el.classList.contains('menu-open')
        );
      }
      lastY = y;
      if (!reduce) {
        el.querySelectorAll<HTMLElement>('[data-img-par]').forEach((image) => {
          const frame = image.parentElement;
          if (!frame) return;
          const rect = frame.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) return;
          const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
          image.style.transform = `translateY(${-9 + offset * -9}%)`;
        });
      }
    };
    let queued = false;
    window.addEventListener(
      'scroll',
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          onScroll();
          queued = false;
        });
      },
      { passive: true, signal }
    );
    window.addEventListener('resize', onScroll, { signal });
    onScroll();

    /* magnetic buttons + cursor ring: only with a real pointer */
    let cursorFrame = 0;
    if (fine && !reduce) {
      el.addEventListener(
        'mousemove',
        (event) => {
          const button = (event.target as Element).closest<HTMLElement>('.mag');
          if (!button) return;
          const rect = button.getBoundingClientRect();
          button.style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) * 0.22}px,${
            (event.clientY - rect.top - rect.height / 2) * 0.35
          }px)`;
        },
        { signal }
      );
      el.addEventListener(
        'mouseout',
        (event) => {
          const button = (event.target as Element).closest<HTMLElement>('.mag');
          if (button && !button.contains(event.relatedTarget as Node | null)) button.style.transform = '';
        },
        { signal }
      );

      const cursor = el.querySelector<HTMLElement>('.cur');
      const iso = el.querySelector<HTMLElement>('.hero .iso, .phero .iso, .pas-hero .iso');
      if (cursor) {
        let x = 0;
        let y = 0;
        let targetX = 0;
        let targetY = 0;
        window.addEventListener(
          'mousemove',
          (event) => {
            targetX = event.clientX;
            targetY = event.clientY;
            cursor.style.opacity = '1';
            cursor.classList.toggle(
              'act',
              !!(event.target as Element).closest?.('a,button,.door,figure,.eje li,summary')
            );
            if (iso) {
              iso.style.translate = `${(event.clientX / window.innerWidth - 0.5) * -40}px ${
                (event.clientY / window.innerHeight - 0.5) * -30
              }px`;
            }
          },
          { signal }
        );
        const follow = () => {
          x += (targetX - x) * 0.2;
          y += (targetY - y) * 0.2;
          cursor.style.transform = `translate(${x}px,${y}px)`;
          cursorFrame = requestAnimationFrame(follow);
        };
        cursorFrame = requestAnimationFrame(follow);
      }
    }

    return () => {
      listeners.abort();
      window.clearTimeout(readyTimer);
      cancelAnimationFrame(cursorFrame);
      mutations?.disconnect();
      reveal?.disconnect();
      counter?.disconnect();
      html.classList.remove('ne-html');
    };
  }, []);
}
