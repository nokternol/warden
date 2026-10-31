import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DEFERRED_PAGES: [string, () => Promise<{ getServerSideProps: GetServerSideProps }>][] = [
  ['/dashboard', () => import('@app/pages/dashboard/index.page')],
  ['/search', () => import('@app/pages/search/index.page')],
  ['/ratings', () => import('@app/pages/ratings/index.page')],
];

function requestFor(resolvedUrl: string) {
  return { resolvedUrl, req: { headers: {} } } as unknown as GetServerSidePropsContext;
}

describe('a deferred page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(DEFERRED_PAGES)('%s answers 404 to a signed-out caller', async (url, load) => {
    const { getServerSideProps } = await load();

    expect(await getServerSideProps(requestFor(url))).toEqual({ notFound: true });
  });

  it.each(DEFERRED_PAGES)('%s answers 404 under the auth bypass', async (url, load) => {
    vi.stubEnv('BYPASS_AUTH', 'true');
    const { getServerSideProps } = await load();

    expect(await getServerSideProps(requestFor(url))).toEqual({ notFound: true });
  });

  it('answers 404 whatever the query string', async () => {
    const { getServerSideProps } = await import('@app/pages/ratings/index.page');

    expect(await getServerSideProps(requestFor('/ratings?title=Heat'))).toEqual({
      notFound: true,
    });
  });
});
