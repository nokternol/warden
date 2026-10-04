import { contract } from '@contract/index';
import { type AnyContractProcedure, isContractProcedure } from '@orpc/contract';
import { buildContainer } from '@server/container';
import type { AppConfig } from '@server/kernel/config';
import { closeDatabase, initializeDatabase } from '@server/kernel/db';
import { requestIdMiddleware } from '@server/kernel/middleware/requestId';
import { createApiRouter } from '@server/modules';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The procedures that answer without a signed-in user. Every other one is refused. */
const PUBLIC_ALLOWLIST = ['auth.logout', 'auth.plexLogin', 'media.backdrops', 'system.health'];

const testConfig: AppConfig = {
  NODE_ENV: 'test',
  PORT: 5094,
  COMMIT_TAG: 'test',
  LOG_LEVEL: 'error',
  LOG_DIR: './config/logs',
  DB_PATH: ':memory:',
  DB_LOGGING: false,
  TRUST_PROXY: false,
  BYPASS_AUTH: false,
  TMDB_API_KEY: '',
  SESSION_SECRET: 'test-secret',
};

interface ContractEntry {
  name: string;
  procedure: AnyContractProcedure;
}

/** Every procedure in the contract with its dotted name, e.g. `automations.list`. */
function contractEntries(node: object, prefix: string[] = []): ContractEntry[] {
  return Object.entries(node).flatMap(([key, child]) =>
    isContractProcedure(child)
      ? [{ name: [...prefix, key].join('.'), procedure: child }]
      : contractEntries(child as object, [...prefix, key])
  );
}

/** Calls a procedure at its contract method and path, with every path parameter set to `1`. */
function callAnonymously(app: Express, { procedure }: ContractEntry) {
  const { method = 'POST', path = '/' } = procedure['~orpc'].route;
  const url = path.replace(/\{[^}]+\}/g, '1');
  return request(app)[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](url);
}

/** True when the response is the default-deny guard's refusal. */
function isRefusedUnauthenticated(res: request.Response) {
  return res.status === 401 && res.body?.error?.type === 'UNAUTHORIZED';
}

/** The names of the procedures that an unauthenticated call refuses. */
async function refusedAnonymously(app: Express, entries: ContractEntry[]) {
  const refused: string[] = [];
  for (const entry of entries) {
    if (isRefusedUnauthenticated(await callAnonymously(app, entry))) refused.push(entry.name);
  }
  return refused;
}

const isAllowlisted = ({ name }: ContractEntry) => PUBLIC_ALLOWLIST.includes(name);

describe('default-deny API auth', () => {
  let app: Express;

  beforeAll(async () => {
    const db = await initializeDatabase(testConfig);
    const container = buildContainer({ config: testConfig, db });
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use('/api', createApiRouter(container.cradle));
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('refuses an unauthenticated call to every contract procedure outside the public allowlist with 401', async () => {
    const guarded = contractEntries(contract).filter((entry) => !isAllowlisted(entry));

    expect(guarded.length).toBeGreaterThan(0);
    expect(await refusedAnonymously(app, guarded)).toEqual(guarded.map(({ name }) => name));
  });

  it('answers an unauthenticated call to every procedure on the public allowlist', async () => {
    const allowlisted = contractEntries(contract).filter(isAllowlisted);

    expect(allowlisted.map(({ name }) => name).sort()).toEqual(PUBLIC_ALLOWLIST);
    expect(await refusedAnonymously(app, allowlisted)).toEqual([]);
  });
});
