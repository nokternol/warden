import { api } from '@server/kernel/api';
import type { AppSettingsService } from './appSettingsService';

export function createAppSettingsProcedures({
  appSettingsService,
}: {
  appSettingsService: AppSettingsService;
}) {
  return api.appSettings.router({
    get: api.appSettings.get.handler(async () => appSettingsService.get()),
    update: api.appSettings.update.handler(async ({ input }) => appSettingsService.update(input)),
  });
}
