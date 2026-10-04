import type { Filter } from '@app/hooks/useMediaQueries';
import { contract } from '@contract/index';
import '@testing-library/jest-dom/vitest';
import { render, screen, setupUser, waitFor } from '@tests/helpers/component';
import { mockProcedure } from '@tests/mocks/contract';
import { MOCK_RULES } from '@tests/mocks/handlers/media';
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

  it('browses an instance-scoped value only in its scoped form, even when the rules load late', async () => {
    const browsed: Filter[][] = [];
    let rulesServed = false;
    server.use(
      mockProcedure(contract.media.rules, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        rulesServed = true;
        return MOCK_RULES;
      }),
      mockProcedure(contract.media.browse.movie, ({ request }) => {
        const filters = new URL(request.url).searchParams.get('filters');
        browsed.push(filters === null ? [] : (JSON.parse(filters) as Filter[]));
        return EMPTY_PAGE;
      })
    );
    render(<MediaPage />, { wrapper: Wrapper });

    await waitFor(() => expect(rulesServed).toBe(true), { timeout: 3000 });
    await waitFor(() =>
      expect(browsed.at(-1)).toContainEqual({
        ruleKey: 'tagIds',
        value: { providerId: 1, ids: [1, 2] },
      })
    );
    const tagEntries = browsed.flat().filter((f) => f.ruleKey === 'tagIds');
    for (const entry of tagEntries) {
      expect(entry.value).toEqual({ providerId: 1, ids: [1, 2] });
    }
  });
});
