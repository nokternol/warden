import { MetadataProviderType } from '@server/database/schema';
import { fieldsByProviderType } from '@server/modules/media/activeFieldSet';
import {
  assertContestedFieldsCovered,
  contestedFieldPrecedence,
} from '@server/modules/media/enrichment/precedence';
import { describe, expect, it } from 'vitest';

describe('assertContestedFieldsCovered', () => {
  it('throws when an active field producer is missing from its contested field precedence order', () => {
    const fieldsByType = {
      [MetadataProviderType.TAUTULLI]: ['playCount'] as const,
      [MetadataProviderType.PLEX]: ['playCount'] as const,
    };
    const precedence = {
      playCount: [MetadataProviderType.TAUTULLI] as const,
    };

    expect(() =>
      assertContestedFieldsCovered(
        new Set([MetadataProviderType.TAUTULLI, MetadataProviderType.PLEX]),
        precedence,
        fieldsByType
      )
    ).toThrow(/playCount/);
  });

  it('does not throw when every active producer of a contested field is covered', () => {
    const fieldsByType = {
      [MetadataProviderType.TAUTULLI]: ['playCount'] as const,
      [MetadataProviderType.PLEX]: ['playCount'] as const,
    };
    const precedence = {
      playCount: [MetadataProviderType.TAUTULLI, MetadataProviderType.PLEX] as const,
    };

    expect(() =>
      assertContestedFieldsCovered(
        new Set([MetadataProviderType.TAUTULLI, MetadataProviderType.PLEX]),
        precedence,
        fieldsByType
      )
    ).not.toThrow();
  });

  it('throws for a fact two active producers declare that has no precedence order at all', () => {
    const fieldsByType = {
      [MetadataProviderType.PLEX]: ['studio'] as const,
      [MetadataProviderType.JELLYFIN]: ['studio'] as const,
    };

    expect(() =>
      assertContestedFieldsCovered(
        new Set([MetadataProviderType.PLEX, MetadataProviderType.JELLYFIN]),
        {},
        fieldsByType
      )
    ).toThrow(/studio/);
  });

  it('lets Sonarr activate while Radarr is active', () => {
    expect(() =>
      assertContestedFieldsCovered(
        new Set([MetadataProviderType.RADARR, MetadataProviderType.SONARR]),
        contestedFieldPrecedence,
        fieldsByProviderType
      )
    ).not.toThrow();
  });

  it('accepts every offered enricher active together', () => {
    expect(() =>
      assertContestedFieldsCovered(
        new Set([
          MetadataProviderType.RADARR,
          MetadataProviderType.SONARR,
          MetadataProviderType.TAUTULLI,
          MetadataProviderType.PLEX,
          MetadataProviderType.JELLYFIN,
          MetadataProviderType.SEERR,
        ]),
        contestedFieldPrecedence,
        fieldsByProviderType
      )
    ).not.toThrow();
  });
});
