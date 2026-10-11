import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: { pull_request?: unknown; push?: { branches?: string[]; tags?: string[] } };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const workflow = parse(
  readFileSync(path.join(__dirname, '../../../.github/workflows/quality-gate.yml'), 'utf8')
) as Workflow;

const SMOKE_SCRIPT = 'scripts/container-smoke.sh';

/** The shell commands of a job's steps that invoke the smoke script. */
function smokeRuns(job: Job): string[] {
  return job.steps.map((s) => s.run ?? '').filter((run) => run.includes(SMOKE_SCRIPT));
}

describe('quality gate workflow: container smoke', () => {
  it('runs the container smoke script on every pull request', () => {
    expect(workflow.on).toHaveProperty('pull_request');
    expect(smokeRuns(workflow.jobs.container ?? { steps: [] })).not.toHaveLength(0);
  });

  it('smokes the compose file as well, against the image already built rather than rebuilding it', () => {
    const container = workflow.jobs.container;
    const runs = smokeRuns(container);
    const builds = container.steps.filter((s) => /docker build/.test(s.run ?? ''));

    expect(runs.some((run) => run.includes('--compose'))).toBe(true);
    expect(builds).toHaveLength(1);
    for (const run of runs) expect(run).toMatch(/SMOKE_SKIP_BUILD=1/);
  });
});
