import { createApiClient } from '@app/lib/api/client';
import { type Scope, isOfferedPage, scope } from '@contract/scope';
import type { GetServerSidePropsContext } from 'next';

type PageRefusal = { notFound: true } | { redirect: { destination: string; permanent: false } };

/**
 * What every signed-in page's `getServerSideProps` asks first: why this request
 * may not have the page, or null when it may. A page the scope declaration
 * defers answers 404 before any auth outcome, so it looks absent to every caller
 * and under `BYPASS_AUTH` too. Any other page requires a signed-in user.
 */
export async function guardPage(
  ctx: GetServerSidePropsContext,
  declared: Scope = scope
): Promise<PageRefusal | null> {
  const [page] = ctx.resolvedUrl.split('?');
  if (!isOfferedPage(declared, page)) return { notFound: true };

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
