// Loaded into the app server (not the browser) by "stack.sh serve pictures": the server's clock stands still at
// RD_SERVER_NOW. Without it, answers that carry "now" (a date computed on the server, "hace N días") would change
// from one run to the next and with the time of day. Timers (setTimeout and the like) are not touched.
const RealDate = Date;
const fixed = RealDate.parse(process.env.RD_SERVER_NOW || '');
if (Number.isFinite(fixed)) {
  globalThis.Date = new Proxy(RealDate, {
    construct(target, args, newTarget) {
      return args.length ? Reflect.construct(target, args, newTarget) : Reflect.construct(target, [fixed], newTarget);
    },
    apply(target) { return new target(fixed).toString(); },
    get(target, prop, receiver) { return prop === 'now' ? () => fixed : Reflect.get(target, prop, receiver); },
  });
}
