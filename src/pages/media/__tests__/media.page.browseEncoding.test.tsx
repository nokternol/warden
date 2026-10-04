import type { Filter } from '@app/hooks/useMediaQueries';
import { contract } from '@contract/index';
import '@testing-library/jest-dom/vitest';
import { render, screen, setupUser, waitFor } from '@tests/helpers/component';
import { mockProcedure } from '@tests/mocks/contract';
import { server } from '@tests/mocks/server';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import MediaPage from '../index.page';

/** The page URL a shared filter link carries: title, a boolean, a range and qualified tag ids. */
const PAGE_QUERY = {
  title: 'Movie',
  hasFile: 'true',
  yearMin: '2001',
  movieTagIds: '1,2',
  movieTagIdsProviderId: '1',
};

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: PAGE_QUERY,
    pathname: '/media',
    replace: vi.fn().mockResolvedValue(true),
    basePath: '',
    route: '/',
    asPath: '/',
    isReady: true,
  }),
}));

const EMPTY_PAGE = {
  items: [],
  totalCount: 0,
  page: 1,
  pageSize: 48,
  yearRange: { min: null, max: null },
  errors: [],
};

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('MediaPage browse encoding', () => {
  it('browses movies with exactly the filter entries it saves', async () => {
    const browsed: Filter[][] = [];
    let saved: Filter[] | undefined;
    server.use(
      mockProcedure(contract.media.browse.movie, ({ request }) => {
        const filters = new URL(request.url).searchParams.get('filters');
        browsed.push(filters === null ? [] : (JSON.parse(filters) as Filter[]));
        return EMPTY_PAGE;
      }),
      mockProcedure(contract.mediaQueries.create, async ({ request }) => {
        const body = (await request.json()) as { name: string; filters: Filter[] };
        saved = body.filters;
        return {
          id: 1,
          name: body.name,
          contentType: 'movie' as const,
          filters: body.filters,
          health: { status: 'healthy' as const, providerStatus: [], qualificationIssues: [] },
          createdAt: new Date().toISOString(),
        };
      })
    );
    const user = setupUser();
    render(<MediaPage />, { wrapper: Wrapper });

    await user.click(await screen.findByRole('button', { name: /save as query/i }));
    await user.type(screen.getByLabelText(/query name/i), 'Shared link');
    await user.click(screen.getByRole('button', { name: /save query/i }));

    await waitFor(() => expect(saved).toBeDefined());
    await waitFor(() => expect(browsed.at(-1)).toEqual(saved));
  });
});
