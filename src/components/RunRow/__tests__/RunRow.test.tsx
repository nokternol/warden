import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import { render, screen, setupUser, within } from '@tests/helpers/component';
import { describe, expect, it } from 'vitest';
import RunRow from '../index';

const run: AutomationRunDto = {
  id: 1,
  automationId: 1,
  automationName: 'Nightly Cleanup',
  ranAt: '2026-06-04T02:00:00.000Z',
  status: 'success',
  itemCount: 5,
  error: null,
  createdAt: '2026-06-04T02:00:00.000Z',
};

function renderRow(row: AutomationRunDto) {
  return render(
    <table>
      <tbody>
        <RunRow run={row} />
      </tbody>
    </table>
  );
}

describe('RunRow', () => {
  it('expands to the titles the run targeted', async () => {
    const user = setupUser();
    renderRow(run);

    await user.click(screen.getByRole('button', { name: /show items/i }));

    expect(await screen.findByText('Alien')).toBeInTheDocument();
    expect(screen.getByText('Ronin')).toBeInTheDocument();
  });

  it('marks a title that has since left its source as removed', async () => {
    const user = setupUser();
    renderRow(run);

    await user.click(screen.getByRole('button', { name: /show items/i }));

    const heat = (await screen.findByText('Heat')).closest('li') as HTMLElement;
    expect(within(heat).getByText(/removed/i)).toBeInTheDocument();
    const alien = screen.getByText('Alien').closest('li') as HTMLElement;
    expect(within(alien).queryByText(/removed/i)).not.toBeInTheDocument();
  });

  it('offers no expansion for a run that targeted nothing', () => {
    renderRow({ ...run, id: 2, status: 'error', itemCount: 0, error: 'Connection refused' });

    expect(screen.queryByRole('button', { name: /show items/i })).not.toBeInTheDocument();
  });

  it('says so when an expanded run recorded no items', async () => {
    const user = setupUser();
    renderRow({ ...run, id: 2, automationName: 'system:identity-resolution', itemCount: 3 });

    await user.click(screen.getByRole('button', { name: /show items/i }));

    expect(await screen.findByText(/no items recorded/i)).toBeInTheDocument();
  });
});
