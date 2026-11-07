/**
 * The one wording of every filter readiness finding, shared by the server and the client.
 *
 * Run: vitest run --project server
 */
import { type FindingDescription, describeFinding } from '@contract/readiness';
import { describe, expect, it } from 'vitest';

describe('describeFinding', () => {
  const cases: [FindingDescription, string, RegExp][] = [
    [
      { kind: 'no-library', contentType: 'movie', sourceLabel: 'Radarr' },
      'There is no movie library: no Radarr provider is active',
      /Activate a Radarr provider/,
    ],
    [
      {
        kind: 'no-provider',
        ruleLabel: 'Watched',
        producerLabels: ['Plex', 'Jellyfin', 'Tautulli'],
        offered: true,
      },
      'Watched filter needs a Plex, Jellyfin or Tautulli provider, and none is active',
      /Activate a Plex, Jellyfin or Tautulli provider/,
    ],
    [
      { kind: 'no-provider', ruleLabel: 'TMDB status', producerLabels: ['TMDB'], offered: false },
      'TMDB status filter needs a TMDB provider, which Warden does not offer',
      /without this filter/,
    ],
    [
      { kind: 'unknown-rule', ruleKey: 'retiredRule' },
      'A filter names a rule that no longer exists: retiredRule',
      /without this filter/,
    ],
    [
      {
        kind: 'inactive-instance',
        ruleLabel: 'Tags',
        instance: { id: 3, typeLabel: 'Radarr' },
      },
      'Tags filter names Radarr instance 3, which is not an active provider',
      /Activate Radarr instance 3/,
    ],
    [
      { kind: 'inactive-instance', ruleLabel: 'Tags', instance: { id: 9 } },
      'Tags filter names Provider instance 9, which is not an active provider',
      /without this filter/,
    ],
    [
      {
        kind: 'inactive-instance',
        ruleLabel: 'Tags',
        instance: { id: 2, typeLabel: 'Sonarr' },
        expectedLabel: 'Radarr',
      },
      'Tags filter names Sonarr instance 2, which is not a Radarr provider',
      /naming a Radarr instance/,
    ],
    [
      {
        kind: 'other-instance',
        ruleLabel: 'Tags',
        instance: { id: 2, typeLabel: 'Radarr' },
        automationProvider: { id: 1, typeLabel: 'Radarr' },
      },
      "Tags filter names Radarr instance 2, which is not this automation's provider (Radarr instance 1)",
      /Radarr instance 1/,
    ],
    [
      { kind: 'data-incomplete', ruleLabel: 'Watched' },
      "Watched filter's data has not finished loading",
      /enrichment run next succeeds/,
    ],
    [
      { kind: 'no-data', ruleLabel: 'Seerr request status', contentType: 'movie' },
      'Seerr request status filter has no data: no movie holds a value for it',
      /sign it off/,
    ],
  ];

  it.each(cases)('words %o', (description, message, clears) => {
    const worded = describeFinding(description);
    expect(worded.message).toBe(message);
    expect(worded.clears).toMatch(clears);
  });
});
