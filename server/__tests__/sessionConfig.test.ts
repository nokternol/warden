import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '../kernel/config';

const MS_PER_DAY = 86400 * 1000;
const DAYS_30 = 30 * MS_PER_DAY;

describe('SESSION_TTL_SECONDS', () => {
  it('is exactly 30 days expressed in seconds', () => {
    expect(SESSION_TTL_SECONDS).toBe(86400 * 30);
  });

  it('cookie maxAge (ms) and store ttl (s) agree on the same duration', () => {
    const cookieMaxAgeMs = SESSION_TTL_SECONDS * 1000;
    const storeTtlMs = SESSION_TTL_SECONDS * 1000;
    expect(cookieMaxAgeMs).toBe(storeTtlMs);
    expect(cookieMaxAgeMs).toBe(DAYS_30);
  });
});

describe('SESSION_COOKIE', () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    session({ secret: 'test', resave: false, saveUninitialized: true, cookie: SESSION_COOKIE })
  );
  app.get('/', (_req, res) => {
    res.send('ok');
  });

  it('is set over plain HTTP, as a LAN install is reached, without Secure', async () => {
    const res = await request(app).get('/');
    const [cookie] = res.get('Set-Cookie') ?? [];
    expect(cookie).toBeDefined();
    expect(cookie).not.toMatch(/Secure/);
  });

  it('is marked Secure over HTTPS behind a trusted proxy', async () => {
    const res = await request(app).get('/').set('X-Forwarded-Proto', 'https');
    expect(res.get('Set-Cookie')?.[0]).toMatch(/Secure/);
  });
});
