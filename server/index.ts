import { loadEnv } from './kernel/env';
// Must run before any import that reads process.env (including loadConfig).
loadEnv();
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import next from 'next';
import { buildContainer, scopePerRequest } from './container';
import { loadConfig } from './kernel/config';
import { SESSION_TTL_SECONDS } from './kernel/config';
import { closeDatabase, initializeDatabase } from './kernel/db';
import { getChildLogger } from './kernel/logger';
import {
  errorHandlerMiddleware,
  requestIdMiddleware,
  requestLoggerMiddleware,
} from './kernel/middleware';
import { createApiRouter } from './modules';
import { DrizzleStore } from './modules/auth';
import { failedStateMiddleware, systemHealthCheck } from './modules/system';

const log = getChildLogger('Server');

async function startServer() {
  const config = loadConfig();
  const dev = config.NODE_ENV !== 'production';
  const port = config.PORT;

  try {
    log.info('Preparing Next.js...');
    const app = next({ dev });
    const handle = app.getRequestHandler();
    await app.prepare();
    log.info('Next.js prepared successfully');

    // Initialize database connection and run migrations
    const db = await initializeDatabase(config);

    // Assert system invariants and self-heal before mounting routes
    await systemHealthCheck(db);

    // Build DI container with initialized dependencies
    const container = buildContainer({
      config,
      db,
    });

    // Seed the cron scheduler with active automations from DB
    const { automationService, automationScheduler } = container.cradle;
    const activeAutomations = await automationService.listActive();
    for (const a of activeAutomations) {
      automationScheduler.schedule(a);
    }
    log.info('Automation scheduler seeded', { count: automationScheduler.count });

    const server = express();

    // Trust proxy (for correct IP behind reverse proxy)
    if (config.TRUST_PROXY) {
      server.set('trust proxy', 1);
    }

    // Security
    server.use(helmet({ contentSecurityPolicy: false }));
    server.use(cors());

    // Body parsing
    server.use(express.json());
    server.use(express.urlencoded({ extended: true }));
    server.use(cookieParser());

    // Session middleware (before API routes)
    server.use(
      '/api',
      session({
        secret: config.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          maxAge: SESSION_TTL_SECONDS * 1000,
          httpOnly: true,
          sameSite: 'lax',
          secure: config.NODE_ENV === 'production',
        },
        store: new DrizzleStore({
          db,
          ttl: SESSION_TTL_SECONDS,
          cleanupLimit: 2,
        }),
      })
    );

    // Request pipeline
    server.use(requestIdMiddleware);
    server.use(requestLoggerMiddleware);
    server.use(scopePerRequest);

    // API routes — dependencies injected via container cradle
    server.use('/api', createApiRouter(container.cradle));

    // Next.js catch-all
    server.all('*', (req, res) => handle(req, res));

    // Error handler (must be LAST)
    server.use(errorHandlerMiddleware);

    const httpServer = server.listen(port, '0.0.0.0', () => {
      log.info('Server started', { port, env: config.NODE_ENV });
      log.info(`Open http://localhost:${port}`);
      if (config.BYPASS_AUTH) {
        log.warn('BYPASS_AUTH is on: every API procedure answers without a signed-in user');
      }
    });

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        log.error(`Port ${port} is already in use`);
      } else {
        log.error('Server error', { error: error.message });
      }
      process.exit(1);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      log.info(`${signal} received, closing server gracefully`);
      automationScheduler.stopAll();
      httpServer.close(async () => {
        log.info('HTTP server closed');
        await closeDatabase();
        log.info('Database connection closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('Critical startup failure — serving failed-state UI', { error });

    // Always bind so Docker health checks can reach the port.
    // Serve an error page instead of the normal route tree.
    const failedApp = express();
    failedApp.use(failedStateMiddleware(reason));
    failedApp.listen(config.PORT, '0.0.0.0', () => {
      log.info('Failed-state server bound', { port: config.PORT });
    });
  }
}

startServer();
