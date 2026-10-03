import { api } from '@server/kernel/api';
import type { AppConfig } from '@server/kernel/config';

export function createSystemProcedures({ config }: { config: AppConfig }) {
  return api.system.router({
    health: api.system.health.handler(async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: config.COMMIT_TAG,
      environment: config.NODE_ENV,
    })),
  });
}
