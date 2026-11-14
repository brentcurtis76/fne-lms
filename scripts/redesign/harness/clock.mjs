// Runs in the page before any of its scripts: the page's clock starts at the harness's moment on every load and then
// runs at normal speed. Only Date is touched; timers and animation frames stay real (a fully faked clock slows the
// charts' drawing to a crawl, and a frozen one stops everything that waits by comparing times).
export function browserClock(startAt) {
  const RealDate = Date; const loadedAt = RealDate.now();
  const now = () => startAt + (RealDate.now() - loadedAt);
  // eslint-disable-next-line no-global-assign
  Date = new Proxy(RealDate, {
    construct(target, args, newTarget) { return args.length ? Reflect.construct(target, args, newTarget) : Reflect.construct(target, [now()], newTarget); },
    apply(target) { return new target(now()).toString(); },
    get(target, prop, receiver) { return prop === 'now' ? now : Reflect.get(target, prop, receiver); },
  });
}
