describe('Login page', () => {
  beforeEach(() => {
    // Intercept Plex PIN creation — return a fake PIN
    cy.intercept('POST', 'https://plex.tv/api/v2/pins*', {
      statusCode: 201,
      body: { id: 99999, code: 'TESTCODE', authToken: null },
    }).as('createPin');

    // Intercept Plex PIN poll — return an auth token immediately
    cy.intercept('GET', 'https://plex.tv/api/v2/pins/99999*', {
      statusCode: 200,
      body: { id: 99999, code: 'TESTCODE', authToken: 'FAKE-TOKEN-12345' },
    }).as('pollPin');

    // Intercept our backend auth endpoint — simulate successful login
    cy.intercept('POST', '/api/auth/plex', {
      statusCode: 200,
      body: {
        status: 'ok',
        data: {
          id: 1,
          email: 'owner@example.com',
          plexUsername: 'owner',
          plexId: 4242,
          avatar: null,
          userType: 'plex',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    }).as('plexAuth');

    cy.visit('/login');
  });

  it('redirects to /login from root when unauthenticated', () => {
    cy.visit('/');
    cy.url().should('include', '/login');
  });

  it('renders the sign in button', () => {
    cy.contains('button', 'Sign in with Plex').should('be.visible');
  });

  it('opens popup to about:blank then navigates to Plex auth URL', () => {
    cy.window().then((win) => {
      const fakePopup = {
        closed: false,
        close: cy.stub().as('popupClose'),
        location: { href: 'about:blank' },
      };
      cy.stub(win, 'open').as('windowOpen').returns(fakePopup);
    });

    cy.contains('button', 'Sign in with Plex').click();

    // preparePopup() opens about:blank first (user gesture, same-origin proxy)
    cy.get('@windowOpen').should('have.been.calledWith', 'about:blank', 'Plex-Auth');

    // openPopup() then navigates via location.href (not a second window.open)
    cy.get('@windowOpen').should('have.been.calledOnce');
  });

  it('completes full auth flow: creates PIN, polls for token, posts to backend, navigates to /dashboard', () => {
    cy.window().then((win) => {
      const fakePopup = {
        closed: false,
        close: cy.stub().as('popupClose'),
        location: { href: 'about:blank' },
      };
      cy.stub(win, 'open').returns(fakePopup);
    });

    cy.contains('button', 'Sign in with Plex').click();

    cy.wait('@createPin');
    cy.wait('@pollPin');
    cy.wait('@plexAuth');

    cy.url().should('include', '/dashboard');
    cy.get('@popupClose').should('have.been.called');
  });
});
