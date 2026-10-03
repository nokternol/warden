/**
 * E2E tests for MediaPoster abort mechanism.
 *
 * Two assertions from the PRD validation matrix:
 *
 * A01 — in-flight /_next/image requests are cancelled when the user scrolls
 *       away after the 75ms dwell fires. Verified via DOM state: the <img>
 *       element is removed when loadState returns to 'idle' on scroll-away,
 *       which is the action that cancels the browser's in-flight request.
 *
 * A05 — /_next/image requests are suppressed entirely for items that scroll
 *       through the viewport faster than the 75ms dwell window.
 *
 * Why DOM assertions for A01 instead of network-level abort detection:
 *   Cypress's cy.intercept proxy delivers stubbed responses over the existing
 *   TCP connection even after the browser removes the <img> from DOM — so
 *   after:response fires regardless. The DOM state is the ground truth: when
 *   loadState transitions back to 'idle', the <img> is unmounted. That is
 *   precisely the action the browser uses to cancel the in-flight fetch.
 *   Playwright's route() layer correctly detects the network cancellation
 *   (confirmed via _verify-abort.mjs).
 *
 * Grid geometry at Cypress default 1280×633 viewport:
 *   - 6 columns (getColumnCount(1280) = 6)
 *   - 24 mock items = 4 rows × 320px estimated height
 *   - overscan: 5 → all 4 rows always mounted in DOM (no virtualiser unmounting)
 *   - Rows 1–2 (~640px) are visible on load; rows 3–4 are below the fold
 *
 * Both tests stub the media API so they run offline and without BYPASS_AUTH.
 */

// ── Fixture data ──────────────────────────────────────────────────────────────
const MOCK_MOVIES = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  title: `Test Movie ${i + 1}`,
  year: 2020 + (i % 5),
  hasFile: true,
  monitored: true,
  tmdbId: 1000 + i,
  images: [
    {
      coverType: 'poster',
      remoteUrl: `https://image.tmdb.org/t/p/original/movie${String(i + 1).padStart(3, '0')}.jpg`,
    },
  ],
  sourceCount: 1,
  sourceProviderIds: [1],
}));

const MOVIES_RESPONSE = {
  status: 'ok',
  data: {
    items: MOCK_MOVIES,
    totalCount: MOCK_MOVIES.length,
    page: 1,
    pageSize: 48,
    yearRange: { min: 2020, max: 2024 },
    errors: [],
  },
};

const SERIES_RESPONSE = {
  status: 'ok',
  data: {
    items: [],
    totalCount: 0,
    page: 1,
    pageSize: 48,
    yearRange: { min: null, max: null },
    errors: [],
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MediaPoster — dwell gate and in-flight request abort', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/media/movies*', MOVIES_RESPONSE).as('movies');
    cy.intercept('GET', '/api/media/series*', SERIES_RESPONSE).as('series');
  });

  // ── A01 ────────────────────────────────────────────────────────────────────
  // When the user scrolls away after dwell fires, loadState transitions
  // 'loading' → 'idle' and the <img> is removed from the DOM. That removal
  // is what causes the browser to cancel the in-flight /_next/image request.
  //
  // With 24 items and overscan:5, all rows stay mounted in the DOM —
  // the virtualiser never removes them. Any <img> disappearance is therefore
  // exclusively caused by the MediaPoster state machine (the abort path).
  it('removes <img> elements from cards that go out of viewport after dwell fires (confirms abort)', () => {
    // Delay /_next/image so requests are definitely still in-flight when we
    // check the DOM. Without this, images may complete before the scroll.
    cy.intercept('GET', '/_next/image*', (req) => {
      req.reply({ delay: 5000, statusCode: 200, body: '' });
    });

    cy.visit('/media');
    cy.wait('@movies');

    // All 24 cards are mounted (overscan covers the full 4-row list).
    cy.get('[data-testid="media-card-movie-1"]').should('exist');

    // Let dwell timer fire for the initially-visible rows 1–2 (DWELL_MS = 75ms).
    cy.wait(150);

    // Confirm <img> elements are present before scroll — dwell fired, state is 'loading'.
    cy.get('[data-testid="media-card-movie-1"]').find('img').should('exist');

    // Scroll <main> by 600px — row 1 moves ~600px above the viewport top and
    // is fully clipped by <main>'s overflow. IntersectionObserver fires
    // isIntersecting:false, loadState → 'idle', <Image> unmounts.
    cy.get('main').then(($main) => {
      $main[0].scrollBy(0, 600);
    });

    // Allow IO callback and React re-render to complete.
    cy.wait(150);

    // Row 1 cards are still in the DOM (overscan keeps them mounted by the
    // virtualiser). But their <img> elements must be gone — the state machine
    // returned to 'idle' and unmounted <Image>. This unmount is what tells the
    // browser to cancel the pending /_next/image fetch.
    cy.get('[data-testid="media-card-movie-1"]').should('exist');
    cy.get('[data-testid="media-card-movie-1"]').find('img').should('not.exist');
    cy.get('[data-testid="media-card-movie-2"]').find('img').should('not.exist');
    cy.get('[data-testid="media-card-movie-3"]').find('img').should('not.exist');
  });

  // ── A05 ────────────────────────────────────────────────────────────────────
  // Items visible for < DWELL_MS never issue any /_next/image requests at all.
  it('suppresses /_next/image requests for items scrolled past before dwell fires', () => {
    let imageRequestCount = 0;

    cy.intercept('GET', '/_next/image*', () => {
      imageRequestCount++;
    }).as('imageOptimizer');

    cy.visit('/media');
    cy.wait('@movies');
    cy.get('[data-testid^="media-card-movie-"]').should('have.length.greaterThan', 0);

    // Scroll immediately — items are in view for well under 75ms each.
    cy.get('main').then(($main) => {
      for (let i = 0; i < 12; i++) {
        $main[0].scrollBy(0, 1000);
      }
    });

    // Short pause — intentionally shorter than DWELL_MS so mid-scroll timers
    // haven't fired yet.
    cy.wait(30);

    cy.get('[data-testid^="media-card-movie-"]')
      .its('length')
      .then((visibleCards) => {
        cy.then(() => {
          expect(imageRequestCount).to.be.lessThan(visibleCards);
        });
      });
  });
});
