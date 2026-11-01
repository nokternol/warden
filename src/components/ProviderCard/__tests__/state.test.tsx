import type { ProviderSummary } from '@app/hooks/useProviderSettings';
import { contract } from '@contract/index';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { describe, expect, it, vi } from 'vitest';
import ProviderCard from '../index';

const provider: ProviderSummary = {
  id: 4,
  type: 'RADARR',
  name: 'Radarr Main',
  url: 'http://radarr.local:7878/api/v3',
  apiKey: '***',
  settings: null,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const renderCard = (props: Partial<React.ComponentProps<typeof ProviderCard>> = {}) =>
  render(
    <ProviderCard provider={provider} tasks={[]} onUpdate={vi.fn()} onDelete={vi.fn()} {...props} />
  );

describe('ProviderCard state', () => {
  it('does not claim to be connected before anything has tested it', () => {
    renderCard();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.getByText('Not tested')).toBeInTheDocument();
  });

  it('says Connected once a test with the stored key has passed', async () => {
    let requested = '';
    server.use(
      mockProcedure(contract.providers.test, ({ request }) => {
        requested = new URL(request.url).search;
        return { ok: true };
      })
    );
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(requested).toContain('id=4');
  });

  it('a failed removal is shown inline and the confirmation stays', async () => {
    const user = userEvent.setup();
    renderCard({ onDelete: vi.fn().mockRejectedValue(new Error('In use')) });
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    await user.click(screen.getByRole('button', { name: 'Delete provider' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('In use');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('a failed edit is shown inline and the form stays open', async () => {
    const user = userEvent.setup();
    renderCard({ onUpdate: vi.fn().mockRejectedValue(new Error('Bad URL')) });
    await user.click(screen.getByRole('button', { name: /radarr main/i }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad URL');
    expect(screen.getByLabelText('Name')).toHaveValue('Radarr Main');
  });
});
