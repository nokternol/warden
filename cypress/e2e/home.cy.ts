describe('Home', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('redirects to Automations', () => {
    cy.url().should('include', '/automations');
    cy.contains('h1', 'Automations').should('be.visible');
  });

  it('shows the navigation for what Warden offers', () => {
    for (const name of ['Media', 'Automations', 'Runs', 'Providers', 'System']) {
      cy.contains('nav a', name).should('be.visible');
    }
  });
});
