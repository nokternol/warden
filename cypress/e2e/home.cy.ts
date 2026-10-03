describe('Providers Page', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('redirects to providers and displays page title', () => {
    cy.url().should('include', '/providers');
    cy.contains('h1', 'Provider Metadata').should('be.visible');
  });

  it('displays the application name in the sidebar', () => {
    cy.contains('Warden').should('be.visible');
  });

  it('displays all provider panels', () => {
    cy.contains('Plex').should('be.visible');
    cy.contains('Jellyfin').should('be.visible');
    cy.contains('Sonarr').should('be.visible');
    cy.contains('Radarr').should('be.visible');
    cy.contains('Tautulli').should('be.visible');
    cy.contains('Overseerr').should('be.visible');
  });

  it('shows sidebar navigation', () => {
    cy.contains('Providers').should('be.visible');
    cy.contains('Dashboard').should('be.visible');
    cy.contains('Ratings').should('be.visible');
  });
});
