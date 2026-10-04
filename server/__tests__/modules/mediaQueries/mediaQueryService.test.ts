import { MetadataProviderType, metadataProviders } from '@server/database/schema';
import type { AppConfig } from '@server/kernel/config';
import { _resetDatabase, getDb, initializeDatabase } from '@server/kernel/db';
import { MediaQueryService } from '@server/modules/mediaQueries/mediaQueryService';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ISO_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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

describe('MediaQueryService', () => {
  let service: MediaQueryService;

  beforeEach(async () => {
    await initializeDatabase(testConfig);
    service = new MediaQueryService({ db: getDb() });
  });

  afterEach(async () => {
    await _resetDatabase();
  });

  // ── list ──────────────────────────────────────────────────────────────────

  it('returns an empty array when no queries exist', async () => {
    expect(await service.list()).toEqual([]);
  });

  it('returns all queries ordered by createdAt', async () => {
    await service.create({ name: 'First', contentType: 'movie', filterValues: [] });
    await service.create({ name: 'Second', contentType: 'series', filterValues: [] });

    const result = await service.list();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('First');
    expect(result[1].name).toBe('Second');
  });

  it('returns each item with createdAt as a valid ISO 8601 string', async () => {
    await service.create({ name: 'Q', contentType: 'movie', filterValues: [] });
    const [dto] = await service.list();
    expect(dto.createdAt).toMatch(ISO_REGEX);
  });

  it('returns filterValues array with registry-coerced types', async () => {
    await service.create({
      name: 'Movie Q',
      contentType: 'movie',
      filterValues: [
        { ruleKey: 'hasFile', value: true },
        { ruleKey: 'year', value: { min: 2010 } },
        { ruleKey: 'title', value: 'Inception' },
      ],
    });

    const [dto] = await service.list();
    expect(dto.filterValues).toHaveLength(3);
    const hasFile = dto.filterValues.find((f) => f.ruleKey === 'hasFile');
    expect(hasFile?.value).toBe(true);
    const year = dto.filterValues.find((f) => f.ruleKey === 'year');
    expect(year?.value).toEqual({ min: 2010 });
    const title = dto.filterValues.find((f) => f.ruleKey === 'title');
    expect(title?.value).toBe('Inception');
  });

  it('returns contentType on each dto', async () => {
    await service.create({ name: 'Movies', contentType: 'movie', filterValues: [] });
    await service.create({ name: 'Shows', contentType: 'series', filterValues: [] });

    const result = await service.list();
    expect(result[0].contentType).toBe('movie');
    expect(result[1].contentType).toBe('series');
  });

  it('returns health: healthy when query has no filter values', async () => {
    await service.create({ name: 'Empty', contentType: 'movie', filterValues: [] });
    const [dto] = await service.list();
    expect(dto.health.status).toBe('healthy');
    expect(dto.health.providerStatus).toEqual([]);
  });

  it('returns health: degraded when filter source providers are not configured', async () => {
    await service.create({
      name: 'Filtered',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'hasFile', value: true }],
    });
    const [dto] = await service.list();
    // No providers configured in test DB → all optional filters degrade
    expect(dto.health.status).toBe('degraded');
  });

  it('flags a qualificationIssue and degrades health when an entry is qualified to a providerId that is not an active instance', async () => {
    const db = getDb();
    const [provider] = await db
      .insert(metadataProviders)
      .values({
        type: MetadataProviderType.RADARR,
        name: 'Radarr',
        url: 'http://radarr',
        isActive: false,
      })
      .returning();
    await service.create({
      name: 'Dangling',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'qualityProfileIds', value: '5', providerId: provider.id }],
    });

    const [dto] = await service.list();

    expect(dto.health.status).toBe('degraded');
    expect(dto.health.qualificationIssues).toEqual([
      { filterKey: 'qualityProfileIds', providerId: provider.id, reason: 'not_active' },
    ]);
  });

  it('is healthy when the qualified providerId is an active instance', async () => {
    const db = getDb();
    const [provider] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning();
    await service.create({
      name: 'Qualified',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'qualityProfileIds', value: '5', providerId: provider.id }],
    });

    const [dto] = await service.list();

    expect(dto.health.qualificationIssues).toEqual([]);
  });

  it("getHealthForAutomation flags an entry qualified to a provider other than the automation's own binding", async () => {
    const db = getDb();
    const [providerA] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr A', url: 'http://radarrA' })
      .returning();
    const [providerB] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr B', url: 'http://radarrB' })
      .returning();
    const query = await service.create({
      name: 'Bound elsewhere',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'qualityProfileIds', value: '5', providerId: providerA.id }],
    });

    const health = await service.getHealthForAutomation(query.id, providerB.id);

    expect(health.status).toBe('degraded');
    expect(health.qualificationIssues).toEqual([
      {
        filterKey: 'qualityProfileIds',
        providerId: providerA.id,
        reason: 'wrong_automation_provider',
      },
    ]);
  });

  it("getHealthForAutomation is healthy when every qualified entry matches the automation's own provider", async () => {
    const db = getDb();
    const [provider] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning();
    const query = await service.create({
      name: 'Bound correctly',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'qualityProfileIds', value: '5', providerId: provider.id }],
    });

    const health = await service.getHealthForAutomation(query.id, provider.id);

    expect(health.qualificationIssues).toEqual([]);
  });

  // ── create ────────────────────────────────────────────────────────────────

  it('persists and round-trips a providerId qualification on a filter value entry', async () => {
    const db = getDb();
    const [provider] = await db
      .insert(metadataProviders)
      .values({ type: MetadataProviderType.RADARR, name: 'Radarr', url: 'http://radarr' })
      .returning();

    const created = await service.create({
      name: 'Qualified',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'qualityProfileIds', value: '5', providerId: provider.id }],
    });
    expect(created.filterValues[0].providerId).toBe(provider.id);

    const [listed] = await service.list();
    expect(listed.filterValues[0].providerId).toBe(provider.id);

    const fetched = await service.getById(created.id);
    expect(fetched.filterValues[0].providerId).toBe(provider.id);
  });

  it('leaves providerId undefined for an unqualified entry', async () => {
    const created = await service.create({
      name: 'Unqualified',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'hasFile', value: true }],
    });
    expect(created.filterValues[0].providerId).toBeUndefined();

    const [listed] = await service.list();
    expect(listed.filterValues[0].providerId).toBeUndefined();
  });

  it('inserts and returns a DTO with correct fields', async () => {
    const dto = await service.create({
      name: 'My Query',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'year', value: { min: 2015 } }],
    });

    expect(dto.id).toBeGreaterThan(0);
    expect(dto.name).toBe('My Query');
    expect(dto.contentType).toBe('movie');
    expect(dto.filterValues).toHaveLength(1);
    expect(dto.filterValues[0]).toEqual({ ruleKey: 'year', value: { min: 2015 } });
    expect(dto.createdAt).toMatch(ISO_REGEX);
  });

  it('trims whitespace from name on create', async () => {
    const dto = await service.create({
      name: '  Padded  ',
      contentType: 'movie',
      filterValues: [],
    });
    expect(dto.name).toBe('Padded');
  });

  it('throws ValidationError for unknown filter key', async () => {
    await expect(
      service.create({
        name: 'Bad',
        contentType: 'movie',
        filterValues: [{ ruleKey: 'nonExistentKey', value: 'x' }],
      })
    ).rejects.toThrow('nonExistentKey');
  });

  it('throws ValidationError when filter key does not match contentType', async () => {
    await expect(
      service.create({
        name: 'Wrong type',
        contentType: 'movie',
        filterValues: [{ ruleKey: 'seriesStatus', value: 'ended' }],
      })
    ).rejects.toThrow('seriesStatus');
  });

  it('throws ValidationError when a range rule is given a bare scalar value', async () => {
    await expect(
      service.create({
        name: 'Bad range',
        contentType: 'movie',
        filterValues: [{ ruleKey: 'imdbRating', value: 8 }],
      })
    ).rejects.toThrow('imdbRating');
  });

  it('throws ValidationError when a non-range rule is given a range-shaped value', async () => {
    await expect(
      service.create({
        name: 'Unexpected range',
        contentType: 'movie',
        filterValues: [{ ruleKey: 'hasFile', value: { min: 1 } }],
      })
    ).rejects.toThrow('hasFile');
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it('removes the record so it no longer appears in list', async () => {
    const created = await service.create({
      name: 'To Delete',
      contentType: 'movie',
      filterValues: [],
    });
    await service.delete(created.id);
    const list = await service.list();
    expect(list.find((r) => r.id === created.id)).toBeUndefined();
  });

  it('cascades delete to filter values', async () => {
    const created = await service.create({
      name: 'With Filters',
      contentType: 'movie',
      filterValues: [{ ruleKey: 'hasFile', value: true }],
    });
    await service.delete(created.id);
    // Verify via list — if cascade works, no orphan rows cause issues
    expect(await service.list()).toHaveLength(0);
  });

  it('throws NotFoundError when deleting an unknown id', async () => {
    await expect(service.delete(99999)).rejects.toThrow('not found');
  });
});
