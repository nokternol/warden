import { MetadataProviderType } from '@server/database/schema';
/**
 * ProviderSettingsService tests — behaviour-only, real in-memory SQLite.
 *
 * Confirms: CRUD operations, apiKey redaction on list/create/update,
 * and full-record retrieval (unredacted) via findActiveByTypes.
 *
 * Run: vitest run --project server
 */
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { ValidationError } from '@server/kernel/errors';
import { DomainEventBus } from '@server/kernel/eventBus';
import { ProviderSettingsService } from '@server/modules/providers/providerSettingsService';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5057,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

describe('ProviderSettingsService', () => {
  let service: ProviderSettingsService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    service = new ProviderSettingsService({ db: getDb() });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  it('returns an empty array when no providers are saved', async () => {
    const result = await service.list();
    expect(result).toEqual([]);
  });

  it('redacts apiKey to "***" in list results', async () => {
    await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr 4K',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'secret-key',
    });

    const [row] = await service.list();
    expect(row.apiKey).toBe('***');
  });

  it('returns null apiKey in list when no apiKey was saved', async () => {
    await service.create({
      type: MetadataProviderType.TVMAZE,
      name: 'TVMaze',
      url: 'https://api.tvmaze.com',
    });

    const [row] = await service.list();
    expect(row.apiKey).toBeNull();
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  it('creates a provider and returns it with apiKey redacted', async () => {
    const result = await service.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr Main',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'abc123',
    });

    expect(result.type).toBe(MetadataProviderType.SONARR);
    expect(result.name).toBe('Sonarr Main');
    expect(result.url).toBe('http://localhost:8989/api/v3');
    expect(result.apiKey).toBe('***');
    expect(result.id).toBeGreaterThan(0);
  });

  it('defaults isActive to true when not specified', async () => {
    const result = await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
    });

    expect(result.isActive).toBe(true);
  });

  // -------------------------------------------------------------------------
  // single-active-provider-per-type invariant (D8)
  // -------------------------------------------------------------------------

  it('rejects creating a second active provider of an already-active type', async () => {
    await service.create({
      type: MetadataProviderType.TMDB,
      name: 'TMDB',
      url: 'http://tmdb1',
    });

    await expect(
      service.create({
        type: MetadataProviderType.TMDB,
        name: 'TMDB 2',
        url: 'http://tmdb2',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('allows creating a second active Radarr instance — MediaSource role has no single-active invariant', async () => {
    await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr 1080p',
      url: 'http://radarr1:7878/api/v3',
    });

    await expect(
      service.create({
        type: MetadataProviderType.RADARR,
        name: 'Radarr 4K',
        url: 'http://radarr2:7878/api/v3',
      })
    ).resolves.toMatchObject({ isActive: true });
  });

  it('allows creating a second active Sonarr instance — MediaSource role has no single-active invariant', async () => {
    await service.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://sonarr1:8989/api/v3',
    });

    await expect(
      service.create({
        type: MetadataProviderType.SONARR,
        name: 'Sonarr 4K',
        url: 'http://sonarr2:8989/api/v3',
      })
    ).resolves.toMatchObject({ isActive: true });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  it('rejects activating a provider when a different active provider of its type exists (D8)', async () => {
    await service.create({
      type: MetadataProviderType.TMDB,
      name: 'Active TMDB',
      url: 'http://tmdb1',
    });
    const inactive = await service.create({
      type: MetadataProviderType.TMDB,
      name: 'Spare TMDB',
      url: 'http://tmdb2',
      isActive: false,
    });

    await expect(service.update(inactive.id, { isActive: true })).rejects.toThrow(ValidationError);
  });

  it('allows activating a second Radarr instance — MediaSource role has no single-active invariant', async () => {
    await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Active Radarr',
      url: 'http://radarr1:7878/api/v3',
    });
    const inactive = await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Spare Radarr',
      url: 'http://radarr2:7878/api/v3',
      isActive: false,
    });

    await expect(service.update(inactive.id, { isActive: true })).resolves.toMatchObject({
      isActive: true,
    });
  });

  it('allows re-saving an already-active provider with isActive:true (self-exclusion, D8)', async () => {
    const active = await service.create({
      type: MetadataProviderType.TMDB,
      name: 'Active TMDB',
      url: 'http://tmdb1',
    });

    const result = await service.update(active.id, { isActive: true, name: 'Renamed' });

    expect(result.isActive).toBe(true);
    expect(result.name).toBe('Renamed');
  });

  it('updates name and url and returns the updated row with apiKey redacted', async () => {
    const created = await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Old Name',
      url: 'http://old:7878/api/v3',
      apiKey: 'key',
    });

    const updated = await service.update(created.id, {
      name: 'New Name',
      url: 'http://new:7878/api/v3',
    });

    expect(updated.name).toBe('New Name');
    expect(updated.url).toBe('http://new:7878/api/v3');
    expect(updated.apiKey).toBe('***');
  });

  it('throws when updating a non-existent id', async () => {
    await expect(service.update(9999, { name: 'Ghost' })).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  it('removes the provider so it no longer appears in list', async () => {
    const created = await service.create({
      type: MetadataProviderType.PLEX,
      name: 'Plex',
      url: 'http://localhost:32400',
    });

    await service.delete(created.id);

    const list = await service.list();
    expect(list.find((r) => r.id === created.id)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // findActiveByTypes
  // -------------------------------------------------------------------------

  it('returns full (unredacted) records for the requested active types', async () => {
    await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'real-key',
    });
    await service.create({
      type: MetadataProviderType.SONARR,
      name: 'Sonarr',
      url: 'http://localhost:8989/api/v3',
      apiKey: 'sonarr-key',
    });

    const results = await service.findActiveByTypes([MetadataProviderType.RADARR]);

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(MetadataProviderType.RADARR);
    expect(results[0].apiKey).toBe('real-key');
  });

  it('excludes inactive providers from findActiveByTypes', async () => {
    await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Disabled Radarr',
      url: 'http://localhost:7878/api/v3',
      apiKey: 'key',
      isActive: false,
    });

    const results = await service.findActiveByTypes([MetadataProviderType.RADARR]);
    expect(results).toHaveLength(0);
  });

  it('returns at most one active provider per type, even with an inactive duplicate (D8)', async () => {
    await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr 1080p',
      url: 'http://radarr1:7878/api/v3',
      apiKey: 'key1',
    });
    await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr 4K',
      url: 'http://radarr2:7878/api/v3',
      apiKey: 'key2',
      isActive: false,
    });

    const results = await service.findActiveByTypes([MetadataProviderType.RADARR]);
    expect(results).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Date field integrity — createdAt / updatedAt must be proper Date instances
  // -------------------------------------------------------------------------

  it('create() returns createdAt and updatedAt as Date instances with recent timestamps', async () => {
    // The sqliteDateTime column stores seconds precision (truncates ms).
    // Floor `before` to the second boundary so the comparison is stable.
    const beforeMs = Math.floor(Date.now() / 1000) * 1000;
    const result = await service.create({
      type: MetadataProviderType.RADARR,
      name: 'Date Test',
      url: 'http://localhost:7878/api/v3',
    });
    const afterMs = Date.now() + 1000; // +1 s to absorb clock skew

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(beforeMs);
    expect(result.createdAt.getTime()).toBeLessThanOrEqual(afterMs);
    expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeMs);
    expect(result.updatedAt.getTime()).toBeLessThanOrEqual(afterMs);
  });

  it('list() returns providers whose createdAt and updatedAt are Date instances', async () => {
    await service.create({
      type: MetadataProviderType.SONARR,
      name: 'Date List Test',
      url: 'http://localhost:8989/api/v3',
    });

    const [row] = await service.list();

    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('findById() returns createdAt and updatedAt as Date instances', async () => {
    const created = await service.create({
      type: MetadataProviderType.PLEX,
      name: 'Plex Date Test',
      url: 'http://localhost:32400',
    });

    const found = await service.findById(created.id);

    expect(found.createdAt).toBeInstanceOf(Date);
    expect(found.updatedAt).toBeInstanceOf(Date);
  });

  it('findActiveByTypes() returns createdAt and updatedAt as Date instances', async () => {
    await service.create({
      type: MetadataProviderType.TMDB,
      name: 'TMDB Date Test',
      url: 'https://api.themoviedb.org',
      apiKey: 'tmdb-key',
    });

    const [result] = await service.findActiveByTypes([MetadataProviderType.TMDB]);

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('update() returns updatedAt as a Date that is >= createdAt', async () => {
    const created = await service.create({
      type: MetadataProviderType.SONARR,
      name: 'Before Update',
      url: 'http://localhost:8989/api/v3',
    });

    const updated = await service.update(created.id, { name: 'After Update' });

    expect(updated.updatedAt).toBeInstanceOf(Date);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.createdAt.getTime());
  });

  // -------------------------------------------------------------------------
  // provider:changed event — emitted on create/update for cross-module cache
  // invalidation (e.g. media's active-field-set cache), without providers
  // importing anything from media.
  // -------------------------------------------------------------------------

  it('emits provider:changed on create', async () => {
    const events = new DomainEventBus();
    const withBus = new ProviderSettingsService({ db: getDb(), eventBus: events });
    const listener = vi.fn();
    events.on('provider:changed', listener);

    await withBus.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits provider:changed on update', async () => {
    const events = new DomainEventBus();
    const withBus = new ProviderSettingsService({ db: getDb(), eventBus: events });
    const created = await withBus.create({
      type: MetadataProviderType.RADARR,
      name: 'Radarr',
      url: 'http://localhost:7878/api/v3',
    });
    const listener = vi.fn();
    events.on('provider:changed', listener);

    await withBus.update(created.id, { name: 'Renamed' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // precedenceCoverageValidator — injected fail-fast hook, called with the
  // prospective active-type set at the same point assertNoActiveConflict runs.
  // -------------------------------------------------------------------------

  it('rejects create when the injected precedenceCoverageValidator throws', async () => {
    const precedenceCoverageValidator = vi.fn(() => {
      throw new ValidationError('TAUTULLI covers playCount but PLEX does not');
    });
    const withValidator = new ProviderSettingsService({
      db: getDb(),
      precedenceCoverageValidator,
    });

    await expect(
      withValidator.create({
        type: MetadataProviderType.PLEX,
        name: 'Plex',
        url: 'http://localhost:32400',
      })
    ).rejects.toThrow(ValidationError);
  });
});
