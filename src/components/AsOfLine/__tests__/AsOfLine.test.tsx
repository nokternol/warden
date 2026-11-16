import { render, screen } from '@tests/helpers/component';
import { describe, expect, it } from 'vitest';
import AsOfLine from '../index';

describe('AsOfLine', () => {
  it('says when the copy was refreshed', () => {
    render(<AsOfLine freshness={{ asOf: 1_794_000_000, stale: [] }} />);
    expect(screen.getByRole('status', { name: 'How current this is' }).textContent).toMatch(
      /^As of /
    );
  });

  it('names each provider that failed or never refreshed', () => {
    render(
      <AsOfLine
        freshness={{
          asOf: 1_794_000_000,
          stale: [
            { provider: 'Radarr B', kind: 'catalog', failed: true },
            { provider: 'Tautulli', kind: 'facts', failed: false },
          ],
        }}
      />
    );
    const line = screen.getByRole('status').textContent;
    expect(line).toContain("Radarr B's library failed to refresh");
    expect(line).toContain("Tautulli's data not refreshed yet");
  });

  it('says not refreshed yet when nothing has refreshed', () => {
    render(
      <AsOfLine
        freshness={{ asOf: null, stale: [{ provider: 'Radarr', kind: 'catalog', failed: false }] }}
      />
    );
    expect(screen.getByRole('status').textContent).toMatch(/^Not refreshed yet/);
  });
});
