import { createApiClient } from '@app/lib/api/client';
import type { GetServerSidePropsContext } from 'next';

type AuthRedirect = { redirect: { destination: string; permanent: false } };

export async function requireAuth(ctx: GetServerSidePropsContext): Promise<AuthRedirect | null> {
  if (process.env.BYPASS_AUTH === 'true') return null;

  const port = process.env.PORT ?? 5057;
  try {
    const server = createApiClient({
      url: `http://localhost:${port}`,
      headers: { cookie: ctx.req.headers.cookie ?? '' },
    });
    await server.auth.me();
    return null;
  } catch {
    // Not signed in, or the server is unavailable — redirect to login
  }

  return { redirect: { destination: '/login', permanent: false } };
}
