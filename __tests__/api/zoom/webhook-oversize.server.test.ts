// @vitest-environment node
/**
 * The 413 over a REAL socket (Sol F5).
 *
 * The rest of the webhook suite drives the handler with an EventEmitter double, which
 * is the right tool for gate order and lifecycle semantics — and is structurally unable
 * to observe this bug. A double records `res.status(413)` regardless of whether those
 * bytes ever reached a client; only a real `http.Server` with a real client on the
 * other end can tell a flushed 413 apart from a socket the server tore down first.
 * Before the fix, this test received ECONNRESET.
 *
 * What is real here: the server, the socket, the client, and the >1 MiB upload. The one
 * shim is a five-line `status`/`json` adapter over the raw `ServerResponse`, because
 * those two helpers are Next's, not Node's. Everything the test asserts on — headers,
 * status line, body, and whether any of it arrived at all — is genuine wire behaviour.
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import type { NextApiRequest, NextApiResponse } from 'next';

import { handleZoomWebhook, MAX_WEBHOOK_BODY_BYTES } from '../../../pages/api/zoom/webhook';

const FIXTURE_SECRET = 'fixture-secret-token-not-a-real-secret';
const ENV = { ZOOM_WEBHOOK_SECRET_TOKEN: FIXTURE_SECRET } as unknown as NodeJS.ProcessEnv;

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
});

/** Next's `res.status().json()` over a raw ServerResponse. Nothing else is shimmed. */
function withNextHelpers(res: http.ServerResponse): NextApiResponse {
  const next = res as unknown as NextApiResponse;
  next.status = (code: number) => {
    res.statusCode = code;
    return next;
  };
  next.json = (body: unknown) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
    return next;
  };
  return next;
}

async function startServer(): Promise<number> {
  server = http.createServer((req, res) => {
    void handleZoomWebhook(req as unknown as NextApiRequest, withNextHelpers(res), { env: ENV });
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

interface ClientOutcome {
  statusCode?: number;
  body?: string;
  connectionHeader?: string;
  /** Set when the client never saw a response at all — the pre-fix behaviour. */
  errorCode?: string;
}

/** POSTs `bytes` and reports what the CLIENT observed, response or error. */
function postOversized(port: number, bytes: number): Promise<ClientOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let responseStarted = false;
    let requestErrorTimer: NodeJS.Timeout | undefined;
    const finish = (outcome: ClientOutcome) => {
      if (settled) return;
      settled = true;
      if (requestErrorTimer) clearTimeout(requestErrorTimer);
      resolve(outcome);
    };

    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: '/api/zoom/webhook',
        headers: {
          'content-type': 'application/json',
          'content-length': String(bytes),
          'x-zm-signature': 'v0=deadbeef',
          'x-zm-request-timestamp': '1754000000',
        },
      },
      (response) => {
        responseStarted = true;
        if (requestErrorTimer) clearTimeout(requestErrorTimer);
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          finish({
            statusCode: response.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
            connectionHeader: response.headers.connection,
          })
        );
        // A server that destroys the socket mid-response lands here rather than 'end'.
        response.on('error', (error: NodeJS.ErrnoException) =>
          finish({ statusCode: response.statusCode, errorCode: error.code ?? error.message })
        );
      }
    );

    // The upload itself may fail once the server stops reading — that is expected and
    // is NOT the thing under test; what matters is whether a response arrived.
    request.on('error', (error: NodeJS.ErrnoException) => {
      if (responseStarted) return;
      const errorCode = error.code ?? error.message;
      // Refusing a request mid-upload legitimately closes the write side and may
      // surface EPIPE before Node emits the already-in-flight `response` event.
      // Give the wire response a short opportunity to win; only classify this as
      // the old no-response regression if no status line follows.
      requestErrorTimer = setTimeout(() => {
        if (!responseStarted) finish({ errorCode });
      }, 250);
    });

    // 64 KiB at a time, so the response can arrive while we are still writing.
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    let written = 0;
    const pump = () => {
      while (written < bytes) {
        const size = Math.min(chunk.length, bytes - written);
        written += size;
        if (!request.write(size === chunk.length ? chunk : chunk.subarray(0, size))) {
          request.once('drain', pump);
          return;
        }
      }
      request.end();
    };
    pump();
  });
}

describe('/api/zoom/webhook — oversized body over a real socket', () => {
  it('answers 413 to a real client posting more than 1 MiB — not ECONNRESET', async () => {
    const port = await startServer();

    const outcome = await postOversized(port, MAX_WEBHOOK_BODY_BYTES + 64 * 1024);

    // The whole point: a status code arrived.
    expect(outcome.errorCode).toBeUndefined();
    expect(outcome.statusCode).toBe(413);
    expect(JSON.parse(outcome.body as string)).toEqual({ error: 'Payload too large' });
    // Refused mid-upload, so the connection cannot be reused.
    expect(outcome.connectionHeader).toBe('close');
  }, 20_000);

  it('still verifies a normally-sized body, so the cap is not answering everything', async () => {
    const port = await startServer();

    // Under the cap, with a bogus signature: the read completes and gate 4 rejects it.
    // A 401 here proves the 413 above came from the SIZE, not from the request shape.
    const outcome = await postOversized(port, 1024);

    expect(outcome.errorCode).toBeUndefined();
    expect(outcome.statusCode).toBe(401);
  }, 20_000);
});
