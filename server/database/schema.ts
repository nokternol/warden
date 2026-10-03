import type { AutomationStatus } from '@contract/schemas';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { createdAt, updatedAt } from './columns/datetime';
export { createdAt, updatedAt };

// ---------------------------------------------------------------------------
// Enums (plain TypeScript — SQLite has no native enum type)
// ---------------------------------------------------------------------------
export enum UserType {
  PLEX = 'plex',
}

export enum MetadataProviderType {
  RADARR = 'RADARR',
  SONARR = 'SONARR',
  TAUTULLI = 'TAUTULLI',
  PLEX = 'PLEX',
  JELLYFIN = 'JELLYFIN',
  OVERSEERR = 'OVERSEERR',
  SEERR = 'SEERR',
  TMDB = 'TMDB',
  OMDB = 'OMDB',
  TVMAZE = 'TVMAZE',
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = sqliteTable(
  'user',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    plexUsername: text('plexUsername'),
    plexId: integer('plexId'),
    // select: false equivalent — omit from all standard queries at the call site
    plexToken: text('plexToken'),
    avatar: text('avatar'),
    userType: text('userType').notNull().default(UserType.PLEX),
    isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt('createdAt'),
    updatedAt: updatedAt('updatedAt'),
  },
  (table) => [index('IDX_user_email').on(table.email), index('IDX_user_plexId').on(table.plexId)]
);

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiredAt: integer('expiredAt', { mode: 'number' }).notNull(),
    json: text('json').notNull(),
  },
  (table) => [index('IDX_session_expiredAt').on(table.expiredAt)]
);

// ---------------------------------------------------------------------------
// metadataProviders
// ---------------------------------------------------------------------------
export const metadataProviders = sqliteTable(
  'metadata_provider',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    // select: false equivalent — omit from all standard queries at the call site
    apiKey: text('apiKey'),
    settings: text('settings'),
    isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt('createdAt'),
    updatedAt: updatedAt('updatedAt'),
  },
  (table) => [index('IDX_metadata_provider_type').on(table.type)]
);

// ---------------------------------------------------------------------------
// Inferred row types (for use in service return types)
// ---------------------------------------------------------------------------
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
/** User shape returned from standard read queries — plexToken intentionally excluded */
export type PublicUser = Omit<User, 'plexToken'>;

/** Raw DB-inferred type — settings is a JSON string, dates are Date instances (fromDriver converts them) */
export type RawMetadataProvider = typeof metadataProviders.$inferSelect;
export type NewMetadataProvider = typeof metadataProviders.$inferInsert;

/**
 * Parsed domain type for MetadataProvider — used in provider classes and handlers.
 * Settings is a deserialized object, timestamps are Date instances,
 * and type is narrowed to the MetadataProviderType enum.
 */
export type MetadataProvider = {
  id: number;
  type: MetadataProviderType;
  name: string;
  url: string;
  apiKey: string | null;
  settings: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// appSettings — system-wide settings, singleton row (id fixed at 1).
// ---------------------------------------------------------------------------
export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** ISO 3166-1 alpha-2 country code; null until the user sets one. */
  region: text('region'),
  /** Which media server's fields win when Plex and Jellyfin both produce a
   *  contested field — see `contestedFieldPrecedence`. */
  primaryMediaServer: text('primaryMediaServer').notNull().default('PLEX'),
});

export type AppSettingsRow = typeof appSettings.$inferSelect;
export type NewAppSettingsRow = typeof appSettings.$inferInsert;

// ---------------------------------------------------------------------------
// mediaQueries — persisted MediaQueryRecord rows
// ---------------------------------------------------------------------------
export const mediaQueries = sqliteTable('media_queries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  contentType: text('contentType').notNull().default('movie'), // 'movie' | 'series'
  createdAt: createdAt('createdAt'),
});

// ---------------------------------------------------------------------------
// mediaQueryFilterValues
// ---------------------------------------------------------------------------
export const mediaQueryFilterValues = sqliteTable(
  'media_query_filter_values',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaQueryId: integer('mediaQueryId')
      .notNull()
      .references(() => mediaQueries.id, { onDelete: 'cascade' }),
    filterKey: text('filterKey').notNull(),
    value: text('value').notNull(),
    /** Namespace qualification for provider-defined id spaces (quality profiles, tags).
     *  Null means unqualified — the native id is interpreted in each item's own instance
     *  namespace. SET NULL on provider deletion: deleting a provider must not silently
     *  change what a query matches. */
    providerId: integer('providerId').references(() => metadataProviders.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [index('IDX_mqfv_queryId').on(table.mediaQueryId)]
);

// ---------------------------------------------------------------------------
// automations
// ---------------------------------------------------------------------------
export const automations = sqliteTable(
  'automations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    providerId: integer('providerId').references(() => metadataProviders.id, {
      onDelete: 'cascade',
    }),
    taskId: text('taskId').notNull(),
    /** The single value a parameterized task declares (a provider-native id as a
     *  string — quality profile, tag, collection); null for parameterless tasks. */
    taskParameter: text('taskParameter'),
    schedule: text('schedule').notNull(), // cron expression
    status: text('status').$type<AutomationStatus>().notNull().default('active'),
    lastRunAt: text('lastRunAt'),
    lastRunItemCount: integer('lastRunItemCount'),
    lastRunStatus: text('lastRunStatus'), // 'success' | 'error'
    lastRunError: text('lastRunError'),
    kind: text('kind').notNull().default('user'), // 'user' | 'system'
    createdAt: createdAt('createdAt'),
    updatedAt: updatedAt('updatedAt'),
  },
  (table) => [index('IDX_automations_status').on(table.status)]
);

// ---------------------------------------------------------------------------
// automationQuerySources
// ---------------------------------------------------------------------------
export const automationQuerySources = sqliteTable(
  'automation_query_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    automationId: integer('automationId')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    queryId: integer('queryId')
      .notNull()
      .references(() => mediaQueries.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'include' | 'exclude'
    sortOrder: integer('sortOrder').notNull().default(0),
  },
  (table) => [index('IDX_aqsources_automationId').on(table.automationId)]
);

export type AutomationQuerySource = typeof automationQuerySources.$inferSelect;
export type NewAutomationQuerySource = typeof automationQuerySources.$inferInsert;

export type MediaQueryRow = typeof mediaQueries.$inferSelect;
export type NewMediaQueryRow = typeof mediaQueries.$inferInsert;
export type MediaQueryFilterValueRow = typeof mediaQueryFilterValues.$inferSelect;
export type NewMediaQueryFilterValueRow = typeof mediaQueryFilterValues.$inferInsert;

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;

// ---------------------------------------------------------------------------
// automationRuns
// ---------------------------------------------------------------------------
export const automationRuns = sqliteTable(
  'automation_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    automationId: integer('automationId')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    ranAt: createdAt('ranAt'),
    status: text('status').notNull(), // 'success' | 'error'
    itemCount: integer('itemCount'),
    error: text('error'),
    kind: text('kind').notNull().default('user'), // 'user' | 'system'
    createdAt: createdAt('createdAt'),
  },
  (table) => [index('IDX_automation_runs_automationId').on(table.automationId)]
);

export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;

// ---------------------------------------------------------------------------
// mediaIdentity — the logical group: one row per title, no per-source coordinate.
// ---------------------------------------------------------------------------
export const mediaIdentity = sqliteTable(
  'media_identity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** ContentType — 'movie' | 'series'. Scopes the primary-id namespace: a TMDB
     *  movie id and a TMDB tv id with the same number are different titles. */
    kind: text('kind').notNull(),
    tmdbId: integer('tmdbId'),
    imdbId: text('imdbId'),
    tvdbId: integer('tvdbId'),
    tvMazeId: integer('tvMazeId'),
    plexRatingKey: text('plexRatingKey'),
    jellyfinItemId: text('jellyfinItemId'),
    /** Fallback grouping keys for items with no primary id; also the future
     *  manual-correction layer's input. Populated on group creation. */
    title: text('title'),
    year: integer('year'),
    resolvedAt: integer('resolvedAt'),
    /** Last time EnrichmentJob resolved this identity's fields — one per identity,
     *  not per field (mirrors mediaItems.resolvedAt's precedent). */
    enrichedAt: integer('enrichedAt'),
  },
  (table) => [
    uniqueIndex('ux_media_identity_movie_tmdb')
      .on(table.tmdbId)
      .where(sql`kind = 'movie' AND tmdbId IS NOT NULL`),
    uniqueIndex('ux_media_identity_series_tvdb')
      .on(table.tvdbId)
      .where(sql`kind = 'series' AND tvdbId IS NOT NULL`),
    index('idx_media_identity_tmdb').on(table.tmdbId),
    index('idx_media_identity_tvdb').on(table.tvdbId),
    index('idx_media_identity_imdb').on(table.imdbId),
  ]
);

export type MediaIdentity = typeof mediaIdentity.$inferSelect;
export type NewMediaIdentity = typeof mediaIdentity.$inferInsert;

// ---------------------------------------------------------------------------
// mediaItems — one row per concrete source copy: the provider IS the source.
// ---------------------------------------------------------------------------
export const mediaItems = sqliteTable(
  'media_item',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    providerId: integer('providerId')
      .notNull()
      .references(() => metadataProviders.id, { onDelete: 'cascade' }),
    /** That provider's native id for the item. */
    externalId: integer('externalId').notNull(),
    mediaIdentityId: integer('mediaIdentityId')
      .notNull()
      .references(() => mediaIdentity.id, { onDelete: 'cascade' }),
    resolvedAt: integer('resolvedAt'),
    /** Soft delete: the copy left its source. Kept so run history still resolves
     *  its title; cleared when the source lists the item again. */
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    uniqueIndex('ux_media_item_provider_external').on(table.providerId, table.externalId),
    index('idx_media_item_identity').on(table.mediaIdentityId),
  ]
);

export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;

// ---------------------------------------------------------------------------
// automationRunItems — the source copies a run targeted. Titles resolve by join
// through media_item → media_identity at read time; the run's ranAt dates it.
// ---------------------------------------------------------------------------
export const automationRunItems = sqliteTable(
  'automation_run_items',
  {
    runId: integer('runId')
      .notNull()
      .references(() => automationRuns.id, { onDelete: 'cascade' }),
    mediaItemId: integer('mediaItemId')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.mediaItemId] }),
    index('idx_automation_run_items_media_item').on(table.mediaItemId),
  ]
);

export type AutomationRunItem = typeof automationRunItems.$inferSelect;

// ---------------------------------------------------------------------------
// enrichmentField — storage identity for a field key. {id, key} only: which
// provider produces a field is a compile-time fact (activeFieldSet.ts's
// fieldsByProviderType), not stored here.
// ---------------------------------------------------------------------------
export const enrichmentField = sqliteTable('enrichment_field', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
});

export type EnrichmentField = typeof enrichmentField.$inferSelect;
export type NewEnrichmentField = typeof enrichmentField.$inferInsert;

// ---------------------------------------------------------------------------
// mediaEnrichment — one row per (identity, field) fact present. A field's
// existence is a data fact (a row), not a schema fact (a column) — sparse by
// construction for an attribute set whose membership varies by configured
// provider.
// ---------------------------------------------------------------------------
export const mediaEnrichment = sqliteTable(
  'media_enrichment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaIdentityId: integer('mediaIdentityId')
      .notNull()
      .references(() => mediaIdentity.id, { onDelete: 'cascade' }),
    fieldId: integer('fieldId')
      .notNull()
      .references(() => enrichmentField.id, { onDelete: 'cascade' }),
    /** JSON-encoded: number | string | boolean. */
    value: text('value').notNull(),
  },
  (table) => [
    uniqueIndex('ux_media_enrichment_identity_field').on(table.mediaIdentityId, table.fieldId),
  ]
);

export type MediaEnrichment = typeof mediaEnrichment.$inferSelect;
export type NewMediaEnrichment = typeof mediaEnrichment.$inferInsert;
