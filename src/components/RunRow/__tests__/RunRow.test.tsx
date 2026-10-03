import type { AutomationRunDto } from '@app/hooks/useAutomationRuns';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    const user = userEvent.setup();
    renderRow(run);

    await user.click(screen.getByRole('button', { name: /show items/i }));

    expect(await screen.findByText('Alien')).toBeInTheDocument();
    expect(screen.getByText('Ronin')).toBeInTheDocument();
  });
});
