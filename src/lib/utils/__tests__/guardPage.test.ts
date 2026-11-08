import { guardPage } from '@app/lib/utils/guardPage';
import { scope } from '@contract/scope';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DEFERRED_PAGES: [string, () => Promise<{ getServerSideProps: GetServerSideProps }>][] = [
  ['/dashboard', () => import('@app/pages/dashboard/index.page')],
  ['/search', () => import('@app/pages/search/index.page')],
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
    const { getServerSideProps } = await import('@app/pages/dashboard/index.page');

    expect(await getServerSideProps(requestFor('/dashboard?tab=recent'))).toEqual({
      notFound: true,
    });
  });
});

describe('an un-deferred page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers once it has no entry in the declaration', async () => {
    vi.stubEnv('BYPASS_AUTH', 'true');
    const declared = {
      deferred: {
        ...scope.deferred,
        pages: scope.deferred.pages.filter((page) => page !== '/dashboard'),
      },
    };

    expect(await guardPage(requestFor('/dashboard'), declared)).toBeNull();
    expect(await guardPage(requestFor('/search'), declared)).toEqual({ notFound: true });
  });
});
