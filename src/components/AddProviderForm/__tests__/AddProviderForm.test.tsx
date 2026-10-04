import { contract } from '@contract/index';
import type { ProviderTypeDescriptor } from '@contract/providers';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockProcedure } from '../../../../tests/mocks/contract';
import { server } from '../../../../tests/mocks/server';
import AddProviderForm from '../index';

const types: ProviderTypeDescriptor[] = [
  { type: 'RADARR', label: 'Radarr', apiPath: '/api/v3', capabilities: ['Movie library'] },
  { type: 'OVERSEERR', label: 'Overseerr', apiPath: '', capabilities: ['Request queue'] },
];

describe('AddProviderForm', () => {
  it('offers exactly the served provider types, by their labels', () => {
    render(<AddProviderForm types={types} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => [o.value, o.textContent])).toEqual([
      ['RADARR', 'Radarr'],
      ['OVERSEERR', 'Overseerr'],
    ]);
  });

  it('renders the Add provider heading', () => {
    render(<AddProviderForm types={types} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Add provider')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<AddProviderForm types={types} onSubmit={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit with provider params when form is submitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    // Blurring the URL field fires a connection test; the test owns that endpoint
    // so the request is handled rather than falling through as unhandled.
    server.use(mockProcedure(contract.providers.test, () => ({ ok: true })));

    render(<AddProviderForm types={types} onSubmit={onSubmit} onCancel={vi.fn()} />);

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

  it("appends the chosen type's served API path to the host", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    server.use(mockProcedure(contract.providers.test, () => ({ ok: true })));
    const served: ProviderTypeDescriptor[] = [
      { type: 'RADARR', label: 'Radarr', apiPath: '/api/v4', capabilities: [] },
    ];

    render(<AddProviderForm types={served} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText('Name'), 'My Radarr');
    await user.type(screen.getByLabelText(/host url/i), 'http://localhost:7878/');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost:7878/api/v4' })
    );
  });
});
