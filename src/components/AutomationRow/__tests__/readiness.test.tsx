import type { AutomationDto } from '@app/hooks/useAutomations';
import type { AutomationReadiness } from '@contract/automations';
import { contract } from '@contract/index';
import type { ReadinessFinding } from '@contract/readiness';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { delay } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import ReadinessBlocks from '../ReadinessBlocks';
import RunCheck from '../RunCheck';
import AutomationRow from '../index';

const finding = (
  kind: ReadinessFinding['kind'],
  id: string,
  message: string
): ReadinessFinding => ({
  id,
  kind,
  providerIds: [],
  message,
  clears: `Clears: ${message}`,
});

const readiness = (over: Partial<AutomationReadiness>): AutomationReadiness => ({
  schedule: 'runs',
  runNow: 'runs',
  blocks: { needsFix: [], awaitingSignOff: [], signedOff: [] },
  problems: [],
  count: 214,
  contentType: 'movie',
  ...over,
});

describe('ReadinessBlocks', () => {
  it('lists each finding awaiting sign-off with an Accept that signs that finding off', async () => {
    const onSignOff = vi.fn();
    render(
      <ReadinessBlocks
        readiness={readiness({
          blocks: {
            needsFix: [],
            awaitingSignOff: [finding('no-data', 'f1', 'Seerr request status filter has no data')],
            signedOff: [],
          },
        })}
        onSignOff={onSignOff}
      />
    );

    const item = screen.getByText(/Seerr request status filter has no data/).closest('li');
    await userEvent
      .setup()
      .click(within(item as HTMLElement).getByRole('button', { name: 'Accept' }));
    expect(onSignOff).toHaveBeenCalledWith('f1');
  });

  it('says what clears a finding that needs a fix, and keeps signed-off findings visible', () => {
    render(
      <ReadinessBlocks
        readiness={readiness({
          problems: ["Radarr instance 1, this automation's provider, is not an active provider"],
          blocks: {
            needsFix: [
              finding('data-incomplete', 'f2', "Watched filter's data has not finished loading"),
            ],
            awaitingSignOff: [],
            signedOff: [finding('no-data', 'f3', 'Seerr has issue filter has no data')],
          },
        })}
      />
    );

    const needsFix = screen.getByRole('region', { name: 'Needs fix' });
    expect(needsFix).toHaveTextContent("this automation's provider, is not an active provider");
    expect(needsFix).toHaveTextContent("Clears: Watched filter's data has not finished loading");
    expect(screen.getByRole('region', { name: 'Signed off' })).toHaveTextContent(
      'Seerr has issue filter has no data'
    );
  });
});

describe('RunCheck', () => {
  const props = {
    taskLabel: 'Delete movie + files',
    destructive: true,
    onCancel: () => {},
    onRetry: () => {},
  };

  it('asks before running past a finding awaiting sign-off, and proceeds with consent to it', async () => {
    const onConfirm = vi.fn();
    render(
      <RunCheck
        {...props}
        onConfirm={onConfirm}
        readiness={readiness({
          schedule: 'blocked',
          runNow: 'asks',
          blocks: {
            needsFix: [],
            awaitingSignOff: [finding('no-data', 'f1', 'Seerr request status filter has no data')],
            signedOff: [],
          },
        })}
      />
    );

    expect(screen.getByText(/There appears to be no data/)).toBeInTheDocument();
    expect(screen.getByText(/Seerr request status filter has no data/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Proceed' }));
    expect(onConfirm).toHaveBeenCalledWith(['f1']);
  });

  it('says the run will be skipped, and why, when something needs a fix', () => {
    render(
      <RunCheck
        {...props}
        onConfirm={() => {}}
        readiness={readiness({
          schedule: 'blocked',
          runNow: 'stops',
          blocks: {
            needsFix: [
              finding('data-incomplete', 'f2', "Watched filter's data has not finished loading"),
            ],
            awaitingSignOff: [],
            signedOff: [],
          },
        })}
      />
    );
    expect(screen.getByText(/This run will be skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Watched filter's data has not finished loading/)).toBeInTheDocument();
  });

  it('states how many items a destructive task will affect', () => {
    render(<RunCheck {...props} onConfirm={() => {}} readiness={readiness({})} />);
    expect(screen.getByText('Delete movie + files will affect 214 movies.')).toBeInTheDocument();
  });

  it('says a failed count and offers a retry, without stopping the run being started', async () => {
    const onConfirm = vi.fn();
    const onRetry = vi.fn();
    render(
      <RunCheck
        {...props}
        onConfirm={onConfirm}
        onRetry={onRetry}
        readiness={readiness({ count: null, countError: 'Radarr could not be reached' })}
      />
    );
    expect(screen.getByText(/Couldn't count the affected items/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry count' }));
    expect(onRetry).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Run now' }));
    expect(onConfirm).toHaveBeenCalledWith([]);
  });
});

describe('Run Now on an automation row', () => {
  const automation = (id: number): AutomationDto => ({
    id,
    name: `Delete stale ${id}`,
    kind: 'user',
    query: { id: 1, name: 'Stale Movies', contentType: 'movie' },
    queries: [{ queryId: 1, role: 'include', sortOrder: 0 }],
    provider: { id: 1, name: 'Radarr', type: 'RADARR' },
    taskId: 'deleteMovieWithFiles',
    schedule: '0 2 * * *',
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  });

  /** Answers the row's checks in turn: the first is the read at mount, the rest follow it. */
  function answerChecks(...answers: Array<'fail' | { count: number; wait?: number }>) {
    let call = 0;
    server.use(
      mockProcedure(contract.providers.tasks, () => [
        {
          providerId: 1,
          type: 'RADARR',
          tasks: [
            { id: 'deleteMovieWithFiles', label: 'Delete movie', destructive: true, enabled: true },
          ],
        },
      ])
    );
    server.use(
      mockProcedure(contract.automations.readiness, async () => {
        const answer = answers[Math.min(call++, answers.length - 1)];
        if (answer === 'fail') throw new Error('unreachable');
        if (answer.wait) await delay(answer.wait);
        return readiness({ count: answer.count });
      })
    );
    return () => call;
  }

  async function openRunNow(id: number, checksMade: () => number) {
    const user = userEvent.setup();
    render(<AutomationRow automation={automation(id)} onRun={vi.fn(async () => {})} />);
    const button = screen.getByRole('button', { name: `Run Delete stale ${id} now` });
    await waitFor(() => expect(button).toBeEnabled());
    await waitFor(() => expect(checksMade()).toBe(1));
    await user.click(button);
  }

  it('counts again when opened: nothing is confirmable until that count answers', async () => {
    const checksMade = answerChecks({ count: 100 }, { count: 214, wait: 200 });
    await openRunNow(101, checksMade);

    expect(screen.queryByText(/will affect 100 movies/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();

    expect(await screen.findByText('Delete movie will affect 214 movies.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled();
  });

  it('shows no earlier count when the count started at open fails, and offers a retry', async () => {
    const checksMade = answerChecks({ count: 100 }, 'fail');
    await openRunNow(102, checksMade);

    expect(await screen.findByText("Couldn't check this automation.")).toBeInTheDocument();
    expect(screen.queryByText(/will affect 100 movies/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
  });
});
