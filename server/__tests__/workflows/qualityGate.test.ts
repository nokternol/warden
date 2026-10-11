import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  id?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
}
interface Job {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  steps: Step[];
}
interface Workflow {
  on: { pull_request?: unknown; push?: { branches?: string[]; tags?: string[] } };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const workflowText = readFileSync(
  path.join(__dirname, '../../../.github/workflows/quality-gate.yml'),
  'utf8'
);
const workflow = parse(workflowText) as Workflow;

/** A missing job reads as one with no steps, so assertions fail rather than throw. */
const NO_JOB: Job = { steps: [] };
const container = workflow.jobs.container ?? NO_JOB;
const publish = workflow.jobs.publish ?? NO_JOB;

const SMOKE_SCRIPT = 'scripts/container-smoke.sh';

/** The shell commands of a job's steps that invoke the smoke script. */
function smokeRuns(job: Job): string[] {
  return job.steps.map((s) => s.run ?? '').filter((run) => run.includes(SMOKE_SCRIPT));
}

describe('quality gate workflow: container smoke', () => {
  it('runs the container smoke script on every pull request', () => {
    expect(workflow.on).toHaveProperty('pull_request');
    expect(smokeRuns(container)).not.toHaveLength(0);
  });

  it('smokes the compose file as well, against the image already built rather than rebuilding it', () => {
    const runs = smokeRuns(container);
    const builds = container.steps.filter((s) => /docker build/.test(s.run ?? ''));

    expect(runs.some((run) => run.includes('--compose'))).toBe(true);
    expect(builds).toHaveLength(1);
    for (const run of runs) expect(run).toMatch(/SMOKE_SKIP_BUILD=1/);
  });
});

describe('quality gate workflow: triggers', () => {
  it('runs on pushes to main and on v* tags', () => {
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(workflow.on.push?.tags).toEqual(['v*']);
  });
});

describe('quality gate workflow: publish', () => {
  it('publishes only on pushes, and only after the checks and the container smoke pass', () => {
    expect(publish.if).toBe("github.event_name == 'push'");
    expect([publish.needs].flat().sort()).toEqual(['checks', 'container']);
  });

  it('grants packages: write to the publish job alone, leaving the workflow read-only', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(publish.permissions).toEqual({ contents: 'read', packages: 'write' });
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (name !== 'publish') expect(job.permissions).toBeUndefined();
    }
  });

  it('runs publishes for one ref in order, never cancelling a pending one', () => {
    expect(publish.concurrency).toEqual({
      group: 'publish-${{ github.ref }}',
      'cancel-in-progress': false,
    });
  });

  it("tags the image with the commit sha from main, latest while main's head, and semver from v* tags", () => {
    const meta = publish.steps.find((s) => s.uses?.startsWith('docker/metadata-action@'));
    const rules = (meta?.with?.tags ?? '').split('\n').filter(Boolean);

    expect(meta?.with?.images).toBe('ghcr.io/nokternol/warden');
    expect(rules).toEqual([
      'type=sha,enable={{is_default_branch}}',
      'type=raw,value=latest,enable=${{ steps.head.outputs.is_main_head }}',
      'type=semver,pattern={{version}}',
      'type=semver,pattern={{major}}.{{minor}}',
    ]);
  });

  it('moves latest only when the published commit is still the head of main', () => {
    const head = publish.steps.find((s) => s.id === 'head');

    expect(head?.run).toContain('repos/$GITHUB_REPOSITORY/commits/main');
    expect(head?.run).toContain('$GITHUB_SHA');
  });

  it('pushes the very image the smoke ran, handed over as an artifact, and never rebuilds it', () => {
    const uses = (job: Job, action: string) => job.steps.some((s) => s.uses?.startsWith(action));
    const commands = publish.steps.map((s) => s.run ?? '').join('\n');

    expect(uses(container, 'actions/upload-artifact@')).toBe(true);
    expect(uses(publish, 'actions/download-artifact@')).toBe(true);
    expect(commands).toContain('docker load');
    expect(commands).toContain('docker push --all-tags ghcr.io/nokternol/warden');
    expect(commands).not.toContain('docker build');
    expect(uses(publish, 'docker/build-push-action@')).toBe(false);
  });
});

describe('quality gate workflow: supply chain', () => {
  it('pins every action by full commit sha with a version comment', () => {
    const lines = workflowText.split('\n').filter((line) => /\buses:/.test(line));

    expect(lines).not.toHaveLength(0);
    for (const line of lines) expect(line).toMatch(/uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
  });
});
