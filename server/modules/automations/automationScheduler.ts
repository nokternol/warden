import { Cron } from 'croner';
import { getChildLogger } from '../../kernel/logger';
import type { RunTrigger } from './automationExecutor';

const log = getChildLogger('AutomationScheduler');

interface Executor {
  execute(automationId: number, run: RunTrigger): Promise<void>;
}

interface SchedulerDeps {
  automationExecutor: Executor;
}

export class AutomationScheduler {
  private readonly jobs = new Map<number, Cron>();
  private readonly executor: Executor;

  constructor(deps: SchedulerDeps) {
    if (!deps?.automationExecutor) {
      throw new Error('AutomationScheduler requires an executor');
    }
    this.executor = deps.automationExecutor;
  }

  schedule(automation: { id: number; name: string; schedule: string }): void {
    this.unschedule(automation.id);
    try {
      const job = new Cron(automation.schedule, { protect: true }, () => {
        this.executor.execute(automation.id, { trigger: 'schedule' }).catch((err) => {
          log.error('Automation execution error', { id: automation.id, err });
        });
      });
      this.jobs.set(automation.id, job);
      log.debug('Automation scheduled', {
        id: automation.id,
        name: automation.name,
        schedule: automation.schedule,
        nextRun: job.nextRun()?.toISOString(),
      });
    } catch (err) {
      log.error('Failed to schedule automation', { id: automation.id, err });
    }
  }

  async trigger(id: number): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      await job.trigger();
    }
  }

  unschedule(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
      log.debug('Automation unscheduled', { id });
    }
  }

  stopAll(): void {
    for (const [id, job] of this.jobs) {
      job.stop();
      log.debug('Automation stopped on shutdown', { id });
    }
    this.jobs.clear();
  }

  get count(): number {
    return this.jobs.size;
  }
}
