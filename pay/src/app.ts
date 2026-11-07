// HTTP API used by the site's donate page.
//
//   POST /v1/donations       new donation address   201 DonationStatus (state "waiting")
//   GET  /v1/donations/:id   payment status          200 DonationStatus
//   GET  /v1/health          wallet ready?           200 / 503
//
// No request is logged, and no IP address is stored beyond the in-memory rate limiter.

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { errorText } from './donations.ts';
import type { Donations } from './donations.ts';
import { RateLimiter } from './ratelimit.ts';

export interface AppOptions {
  allowedOrigins: string[];
  createsPerIpPerHour: number;
  createsPerHour: number;
  /** Read the client address from X-Forwarded-For (set when running behind Caddy). */
  trustProxy: boolean;
}

const HOUR = 60 * 60 * 1000;

export function createApp(donations: Donations, options: AppOptions): Server {
  const perIp = new RateLimiter(options.createsPerIpPerHour, HOUR);
  const overall = new RateLimiter(options.createsPerHour, HOUR);

  function clientKey(req: IncomingMessage): string {
    if (options.trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      const value = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
      // The last entry is the one our own proxy added; earlier ones can be forged.
      const last = value?.split(',').pop()?.trim();
      if (last) return last;
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (origin && options.allowedOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
    }
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');

    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', 'GET, POST');
      res.setHeader('access-control-max-age', '600');
      res.writeHead(204).end();
      return;
    }

    if (path === '/v1/health' && req.method === 'GET') {
      return send(res, donations.ready ? 200 : 503, { ready: donations.ready });
    }

    if (path === '/v1/donations' && req.method === 'POST') {
      if (!donations.ready) return send(res, 503, { error: 'wallet_unavailable' });
      if (!perIp.take(clientKey(req)) || !overall.take('all')) return send(res, 429, { error: 'rate_limited' });
      return send(res, 201, await donations.create());
    }

    const match = /^\/v1\/donations\/([^/]+)$/.exec(path);
    if (match && req.method === 'GET') {
      if (!donations.ready) return send(res, 503, { error: 'wallet_unavailable' });
      const status = await donations.status(match[1]);
      return status ? send(res, 200, status) : send(res, 404, { error: 'not_found' });
    }

    send(res, 404, { error: 'not_found' });
  }

  return createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(`request failed: ${errorText(err)}`);
      if (!res.headersSent) send(res, 503, { error: 'wallet_unavailable' });
      else res.end();
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
