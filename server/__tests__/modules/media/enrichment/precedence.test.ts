import { MetadataProviderType } from '@server/database/schema';
import { fieldsByProviderType } from '@server/modules/media/activeFieldSet';
import { contestedFieldPrecedence } from '@server/modules/media/enrichment/precedence';
import type { ReportedFacts } from '@server/modules/providers';
import { describe, expect, it } from 'vitest';

describe('contestedFieldPrecedence', () => {
  it('orders playCount and lastWatchedAt Tautulli > Plex > Jellyfin', () => {
    expect(contestedFieldPrecedence.playCount).toEqual([
      MetadataProviderType.TAUTULLI,
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
    ]);
    expect(contestedFieldPrecedence.lastWatchedAt).toEqual([
      MetadataProviderType.TAUTULLI,
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
    ]);
  });

  it('orders every fact more than one enricher type declares, covering each of them', () => {
    const declarers = new Map<keyof ReportedFacts, MetadataProviderType[]>();
    for (const [type, fields] of Object.entries(fieldsByProviderType)) {
      for (const field of fields) {
        declarers.set(field, [...(declarers.get(field) ?? []), type as MetadataProviderType]);
      }
    }
    const contested = [...declarers.entries()].filter(([, types]) => types.length > 1);

    for (const [field, types] of contested) {
      const order: readonly MetadataProviderType[] =
        contestedFieldPrecedence[field as keyof typeof contestedFieldPrecedence] ?? [];
      expect({ field, missing: types.filter((t) => !order.includes(t)) }).toEqual({
        field,
        missing: [],
      });
    }
    expect(contestedFieldPrecedence.studio).toEqual([
      MetadataProviderType.PLEX,
      MetadataProviderType.JELLYFIN,
    ]);
  });
});
