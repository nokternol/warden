import { contract } from '@contract/index';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockProcedure } from '../../../../tests/mocks/contract';
import { server } from '../../../../tests/mocks/server';
import AddProviderForm from '../index';

describe('AddProviderForm', () => {
  it('renders the Add provider heading', () => {
    render(<AddProviderForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Add provider')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<AddProviderForm onSubmit={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit with provider params when form is submitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    // Blurring the URL field fires a connection test; the test owns that endpoint
    // so the request is handled rather than falling through as unhandled.
    server.use(mockProcedure(contract.providers.test, () => ({ ok: true })));

    render(<AddProviderForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Type'), 'RADARR');
    await user.type(screen.getByLabelText('Name'), 'My Radarr');
    await user.type(screen.getByLabelText(/host url/i), 'http://localhost:7878');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RADARR',
        name: 'My Radarr',
      })
    );
  });
});
