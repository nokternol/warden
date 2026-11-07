import { type ReadinessFinding, describeFinding } from '@contract/readiness';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReadinessNotice from '../index';

const finding = (kind: ReadinessFinding['kind'], message: string): ReadinessFinding => ({
  id: `${kind}:${message}`,
  kind,
  providerIds: [],
  message,
  clears: '',
});

describe('ReadinessNotice', () => {
  it("states each finding's message", () => {
    render(
      <ReadinessNotice
        findings={[
          finding(
            'inactive-instance',
            'Tags filter names Radarr instance 3, which is not an active provider'
          ),
          finding('data-incomplete', "Watched filter's data has not finished loading"),
        ]}
      />
    );
    const notice = screen.getByRole('status', { name: 'Filter warnings' });
    expect(notice).toHaveTextContent(
      'Tags filter names Radarr instance 3, which is not an active provider'
    );
    expect(notice).toHaveTextContent("Watched filter's data has not finished loading");
  });

  it('renders nothing when there is no finding', () => {
    const { container } = render(<ReadinessNotice findings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says what clears each finding, which for missing data includes signing it off', () => {
    const worded = describeFinding({
      kind: 'no-data',
      ruleLabel: 'Seerr request status',
      contentType: 'movie',
    });
    render(
      <ReadinessNotice findings={[{ id: 'a', kind: 'no-data', providerIds: [], ...worded }]} />
    );
    expect(screen.getByRole('status', { name: 'Filter warnings' })).toHaveTextContent(
      /an automation relying on this filter needs it signed off on the Automations page/i
    );
  });
});
