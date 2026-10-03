import { api } from '@app/lib/api/client';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../../tests/mocks/server';

describe('api client', () => {
  it("rejects a failed call with the server's error type, message and status", async () => {
    server.use(
      http.post('/api/automations/:id/run', () =>
        HttpResponse.json(
          { status: 'error', error: { type: 'NOT_FOUND', message: 'Automation 9 not found' } },
          { status: 404 }
        )
      )
    );

    await expect(api.automations.run({ id: 9 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Automation 9 not found',
    });
  });

  it('rejects a failure that carries no error envelope with its HTTP status', async () => {
    server.use(
      http.post('/api/automations/:id/run', () =>
        HttpResponse.text('<html>Bad Gateway</html>', { status: 502 })
      )
    );

    await expect(api.automations.run({ id: 9 })).rejects.toMatchObject({ status: 502 });
  });

  it("rejects a response that doesn't match the procedure's contract output", async () => {
    server.use(
      http.get('/api/automations', () =>
        HttpResponse.json({ status: 'ok', data: [{ id: 'not-a-number' }] })
      )
    );

    await expect(api.automations.list({})).rejects.toThrow();
  });
});
