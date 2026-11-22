import type { MetadataProviderType } from '@server/database/schema';
import { REPORTED_FACT_PRECEDENCE } from '@server/modules/providers/facts';
import {
  PROVIDER_CATALOGUE,
  providerKindOf,
  reportersOf,
} from '@server/modules/providers/providerCatalogue';
import { describe, expect, it } from 'vitest';

describe('REPORTED_FACT_PRECEDENCE', () => {
  it('orders every kind that reports a fact more than one kind reports, over every declaration', () => {
    const facts = new Set(
      Object.values(PROVIDER_CATALOGUE).flatMap(
        ({ capabilities }) => capabilities.facts?.reports ?? []
      )
    );
    const uncovered = [...facts].flatMap((fact) => {
      const kinds = new Set(
        reportersOf(fact).map((type: MetadataProviderType) => providerKindOf(type))
      );
      if (kinds.size < 2) return [];
      const order = REPORTED_FACT_PRECEDENCE[fact] ?? [];
      return [...kinds]
        .filter((kind) => !kind || !order.includes(kind))
        .map((kind) => ({ fact, kind }));
    });

    expect(uncovered).toEqual([]);
  });
});
