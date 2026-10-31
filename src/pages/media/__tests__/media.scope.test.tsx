import { render, screen, waitFor, within } from '@tests/helpers/component';
import { SWRConfig } from 'swr';
import { describe, expect, it } from 'vitest';
import MediaPage from '../index.page';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

describe('MediaPage under the scope declaration', () => {
  it('leaves deferred pages out of the mobile bar', async () => {
    render(<MediaPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('Movie 1')).toBeInTheDocument());

    const mobileBar = screen
      .getAllByRole('navigation')
      .find((nav) => within(nav).queryByText('Media') && !nav.closest('aside'));

    expect(
      within(mobileBar as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Media', 'Automations', 'Runs']);
  });
});
