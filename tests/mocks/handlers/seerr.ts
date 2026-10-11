import { http, HttpResponse } from 'msw';

// Request and issue payloads served identically by an Overseerr server (port 5055) and a
// Seerr server (port 5056): Seerr is API-compatible with Overseerr.
const mockRequests = [
  {
    id: 1,
    status: 2,
    type: 'movie',
    requestedBy: { id: 1, displayName: 'testuser', email: 'test@example.com' },
    media: { tmdbId: 603, title: 'The Matrix' },
    createdAt: new Date().toISOString(),
  },
];

const mockIssues = [
  { id: 1, status: 1, media: { tmdbId: 603 } },
  { id: 2, status: 1, media: { tmdbId: 704 } },
];

export const seerrHandlers = [
  // Overseerr server
  http.get('http://localhost:5055/api/v1/request', () => {
    return HttpResponse.json({
      results: mockRequests,
      pageInfo: { pages: 1, pageSize: 20, results: 1, page: 1 },
    });
  }),

  http.get('http://localhost:5055/api/v1/issue', () => {
    return HttpResponse.json({ results: mockIssues });
  }),

  // Seerr server
  http.get('http://localhost:5056/api/v1/request', () => {
    return HttpResponse.json({
      results: mockRequests,
      pageInfo: { pages: 1, pageSize: 20, results: 1, page: 1 },
    });
  }),

  http.get('http://localhost:5056/api/v1/issue', () => {
    return HttpResponse.json({ results: mockIssues });
  }),
];
