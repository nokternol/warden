import { contract } from '@contract/index';
import type { ProviderTypeDescriptor } from '@contract/providers';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { describe, expect, it, vi } from 'vitest';
import AddProviderForm from '../index';

const TYPES: ProviderTypeDescriptor[] = [
  {
    type: 'PLEX',
    label: 'Plex',
    apiPath: '',
    filterData: [],
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:32400',
  },
  {
    type: 'RADARR',
    label: 'Radarr',
    apiPath: '/api/v3',
    filterData: [],
    apiKeyRequired: true,
    hostPlaceholder: 'http://localhost:7878',
  },
  { type: 'TVMAZE', label: 'TVmaze', apiPath: '', defaultUrl: 'https://t', filterData: [] },
];

const fill = async (user: ReturnType<typeof userEvent.setup>, key = 'secret') => {
  await user.type(screen.getByLabelText('Name'), 'Mine');
  await user.type(screen.getByLabelText('Host URL'), 'http://localhost:7878');
  if (key) await user.type(screen.getByLabelText(/^API key/), key);
};

describe('AddProviderForm per type', () => {
  it('uses placeholders for the selected type', async () => {
    const user = userEvent.setup();
    render(<AddProviderForm types={TYPES} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'My Plex');
    expect(screen.getByLabelText('Host URL')).toHaveAttribute(
      'placeholder',
      'http://localhost:32400'
    );
    await user.selectOptions(screen.getByLabelText('Type'), 'RADARR');
    expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'My Radarr');
    expect(screen.getByLabelText('Host URL')).toHaveAttribute(
      'placeholder',
      'http://localhost:7878'
    );
  });

  it('requires an API key where the type needs one', async () => {
    const user = userEvent.setup();
    render(<AddProviderForm types={TYPES} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await fill(user, '');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText(/^API key/), 'k');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('tests on demand, and keeps the host field name whatever the result', async () => {
    server.use(mockProcedure(contract.providers.test, () => ({ ok: false, error: 'Refused' })));
    const user = userEvent.setup();
    render(<AddProviderForm types={TYPES} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/connection failed.*refused/i);
    expect(screen.getByLabelText('Host URL')).toBeInTheDocument();
  });

  it('shows a failed save inline and keeps what was entered', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Duplicate name'));
    render(<AddProviderForm types={TYPES} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Duplicate name');
    expect(screen.getByLabelText('Name')).toHaveValue('Mine');
  });
});
