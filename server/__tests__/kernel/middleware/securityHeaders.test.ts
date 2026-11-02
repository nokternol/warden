import { securityHeadersMiddleware } from '@server/kernel/middleware';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

/** An app behind one trusted proxy, so X-Forwarded-Proto decides whether a request is HTTPS. */
function app() {
  const server = express();
  server.set('trust proxy', 1);
  server.use(securityHeadersMiddleware);
  server.get('/', (_req, res) => {
    res.send('ok');
  });
  return server;
}

describe('securityHeadersMiddleware', () => {
  it('omits Cross-Origin-Opener-Policy over plain HTTP, where browsers ignore it and log an error', async () => {
    const res = await request(app()).get('/');

    expect(res.headers['cross-origin-opener-policy']).toBeUndefined();
  });

  it('sends Cross-Origin-Opener-Policy over HTTPS', async () => {
    const res = await request(app()).get('/').set('X-Forwarded-Proto', 'https');

    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('sends the other security headers either way', async () => {
    const res = await request(app()).get('/');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
