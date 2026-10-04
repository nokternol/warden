import { buildContainer, scopePerRequest } from '@server/container';
import { users } from '@server/database/schema';
import { serveApi } from '@server/kernel/api';
import { loadConfig } from '@server/kernel/config';
import { type DrizzleDb, closeDatabase, initializeDatabase } from '@server/kernel/db';
import { checkUser } from '@server/kernel/middleware/auth';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createAuthProcedures } from '@server/modules/auth';
import { createMockConfig } from '@tests/factories';
import { server } from '@tests/mocks/server';
import express, { type Express } from 'express';
import session from 'express-session';
import { http, HttpResponse } from 'msw';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('auth procedures', () => {
  let app: Express;
  let db: DrizzleDb;

  beforeAll(async () => {
    const mockConfig = createMockConfig({ DB_PATH: ':memory:', DB_LOGGING: false });
    for (const [key, value] of Object.entries(mockConfig)) {
      process.env[key] = String(value);
    }
    const config = loadConfig();
    db = await initializeDatabase(config);
    const container = buildContainer({ config, db });

    app = express();
    app.use(express.json());
    app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
    app.use(requestIdMiddleware);
    app.use(scopePerRequest);
    app.use(checkUser);
    app.use(serveApi({ auth: createAuthProcedures(container.cradle) }));
  });

  beforeEach(() => {
    server.use(
      http.get('https://plex.tv/api/v2/user', () =>
        HttpResponse.json({ id: 4242, email: 'Owner@Example.com', username: 'owner' })
      )
    );
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('signs in with a Plex token and starts a session the current-user call recognises', async () => {
    const agent = request.agent(app);

    const signIn = await agent.post('/api/auth/plex').send({ authToken: 'plex-token' });
    expect(signIn.status).toBe(200);
    expect(signIn.body.data).toMatchObject({ email: 'owner@example.com', plexId: 4242 });

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ email: 'owner@example.com', plexUsername: 'owner' });
  });

  it('signs out, after which the current-user call is refused', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/plex').send({ authToken: 'plex-token' });

    const signOut = await agent.post('/api/auth/logout');
    expect(signOut.status).toBe(200);
    expect(signOut.body).toEqual({ status: 'ok', data: { success: true } });

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('refuses a different Plex account once the instance has an owner, starting no session and creating no user', async () => {
    await request(app).post('/api/auth/plex').send({ authToken: 'plex-token' });
    server.use(
      http.get('https://plex.tv/api/v2/user', () =>
        HttpResponse.json({ id: 9001, email: 'stranger@example.com', username: 'stranger' })
      )
    );
    const stranger = request.agent(app);

    const signIn = await stranger.post('/api/auth/plex').send({ authToken: 'stranger-token' });
    expect(signIn.status).toBe(403);
    expect(signIn.body.error).toMatchObject({
      type: 'FORBIDDEN',
      message: expect.stringMatching(/another Plex account/),
    });

    const me = await stranger.get('/api/auth/me');
    expect(me.status).toBe(401);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
