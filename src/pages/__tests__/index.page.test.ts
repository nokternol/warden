import type { GetServerSidePropsContext } from 'next';
import { describe, expect, it } from 'vitest';
import { getServerSideProps } from '../index.page';

describe('index page', () => {
  it('redirects the root to Automations', async () => {
    const result = await getServerSideProps({} as GetServerSidePropsContext);

    expect(result).toEqual({ redirect: { destination: '/automations', permanent: false } });
  });
});
