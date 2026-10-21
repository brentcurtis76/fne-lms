'use strict';
/**
 * PASANT-B006 browser stage: Node egress guard, preloaded through NODE_OPTIONS=--require into every Node process of
 * the capped app unit (seed, Playwright runner and workers, next start).
 *
 * TCP/TLS connects and dns.lookup are allowed only to localhost, 127.0.0.0/8 and ::1 (IPv4-mapped loopback included).
 * Unix socket and pipe paths are local IPC and always pass. A refusal never reaches the network: it is appended to
 * EGRESS_LOG as one JSON line and surfaces to the caller as an ordinary connection/lookup error. Any line is a finding;
 * the controller requires the file to stay empty. Authored as source only; not run by the author.
 */
const dns = require('node:dns');
const fs = require('node:fs');
const net = require('node:net');

const LOG = process.env.EGRESS_LOG;

function loopback(host) {
  if (typeof host !== 'string') return false;
  const h = host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (h === 'localhost') return true;
  if (net.isIPv4(h)) return h.startsWith('127.');
  if (net.isIPv6(h)) return h === '::1' || /^::ffff:127\./.test(h);
  return false;
}

function refusal(kind, host, port, code) {
  const line = { utc: new Date().toISOString(), pid: process.pid, kind, host: String(host), port: port == null ? null : String(port) };
  try {
    if (LOG) fs.appendFileSync(LOG, JSON.stringify(line) + '\n');
  } catch {
    // The refusal itself still happens; only its record is lost.
  }
  const error = new Error(`egress-guard: ${kind} to ${line.host}:${line.port} refused (loopback only)`);
  error.code = code;
  return error;
}

// net.connect/createConnection, http(s), undici/fetch, tls.connect and http2 all end in Socket.prototype.connect.
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  let opts = args[0];
  if (Array.isArray(opts)) opts = opts[0]; // net.connect() passes its normalized [options, callback]
  let host;
  let port;
  if (opts !== null && typeof opts === 'object') {
    if (opts.path === undefined) {
      host = opts.host === undefined ? 'localhost' : opts.host;
      port = opts.port;
    }
  } else if (typeof opts === 'number' || (typeof opts === 'string' && /^\d+$/.test(opts))) {
    port = opts;
    host = typeof args[1] === 'string' ? args[1] : 'localhost';
  } // any other string is a Unix socket or pipe path: local IPC
  if (host !== undefined && !loopback(host)) {
    const error = refusal('connect', host, port, 'ECONNREFUSED');
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return connect.apply(this, args);
};

const lookup = dns.lookup;
dns.lookup = function guardedLookup(hostname, options, callback) {
  if (!loopback(hostname)) {
    const done = typeof options === 'function' ? options : callback;
    const error = refusal('dns.lookup', hostname, null, 'ENOTFOUND');
    if (typeof done === 'function') process.nextTick(done, error);
    return {};
  }
  return lookup.apply(this, arguments);
};

const promisesLookup = dns.promises.lookup;
dns.promises.lookup = function guardedPromisesLookup(hostname, ...rest) {
  if (!loopback(hostname)) return Promise.reject(refusal('dns.promises.lookup', hostname, null, 'ENOTFOUND'));
  return promisesLookup.call(this, hostname, ...rest);
};
