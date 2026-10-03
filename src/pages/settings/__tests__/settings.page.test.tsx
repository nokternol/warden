import type { ProviderSummary } from '@app/hooks/useProviderSettings';
import type { ProviderTaskAvailability } from '@app/hooks/useProviderTasks';
import { contract } from '@contract/index';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockProcedure } from '../../../../tests/mocks/contract';
import { server } from '../../../../tests/mocks/server';
import SettingsPage from '../index.page';

// Each render gets an isolated SWR cache so handlers set per test are the only
// source of truth (no cross-test cache bleed).
const isolated = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);

function makeProvider(overrides: Partial<ProviderSummary> = {}): ProviderSummary {
  return {
    id: 1,
    type: 'RADARR',
    name: 'Radarr Main',
    url: 'http://localhost:7878/api/v3',
    apiKey: '***',
    settings: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// The test owns both endpoints the page reads — providers and their tasks — so
// the rendered conditions are explicit and predictable, never inherited.
function mockApi(providers: ProviderSummary[], availability: ProviderTaskAvailability[]): void {
  server.use(
    mockProcedure(contract.providers.list, () => providers),
    mockProcedure(contract.providers.tasks, () => availability)
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    // Predictable baseline; data-specific tests override below.
    mockApi([makeProvider()], []);
  });

  it('renders the page title', () => {
    render(<SettingsPage />, { wrapper: isolated });
    expect(screen.getByRole('heading', { name: /providers/i })).toBeInTheDocument();
  });

  it('renders an Add Provider button', () => {
    render(<SettingsPage />, { wrapper: isolated });
    expect(screen.getByRole('button', { name: /add provider/i })).toBeInTheDocument();
  });

  it('renders AppLayout with sidebar', () => {
    const { container } = render(<SettingsPage />, { wrapper: isolated });
    expect(container.querySelector('aside')).toBeInTheDocument();
  });

  it('shows provider names after loading', async () => {
    render(<SettingsPage />, { wrapper: isolated });
    await waitFor(() => {
      expect(screen.getByText(/radarr main/i)).toBeInTheDocument();
    });
  });

  it('passes each instance its own tasks — the join is keyed by provider id', async () => {
    const user = userEvent.setup();
    mockApi(
      [
        makeProvider({ id: 1, type: 'RADARR', name: 'Radarr Main' }),
        makeProvider({ id: 2, type: 'SONARR', name: 'Sonarr Main' }),
      ],
      [
        {
          providerId: 1,
          type: 'RADARR',
          tasks: [
            { id: 'unmonitorMovie', label: 'Unmonitor movie', destructive: false, enabled: true },
          ],
        },
        {
          providerId: 2,
          type: 'SONARR',
          tasks: [
            { id: 'unmonitorSeries', label: 'Unmonitor series', destructive: false, enabled: true },
          ],
        },
      ]
    );

    render(<SettingsPage />, { wrapper: isolated });
    await user.click(await screen.findByRole('button', { name: /radarr main/i }));
    await user.click(await screen.findByRole('button', { name: /sonarr main/i }));

    // Each label appears exactly once — under its own instance. A broken join
    // (e.g. both cards handed provider 1's tasks) would duplicate one label and
    // drop the other, which getByText would catch.
    expect(screen.getByText('Unmonitor movie')).toBeInTheDocument();
    expect(screen.getByText('Unmonitor series')).toBeInTheDocument();
  });
});
