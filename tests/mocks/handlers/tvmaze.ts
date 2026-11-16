import { http, HttpResponse } from 'msw';

/** TVmaze knows no show by default, so a catalog refresh in a test never reaches the real API. */
export const tvMazeHandlers = [
  http.get('https://api.tvmaze.com/lookup/shows', () => new HttpResponse(null, { status: 404 })),
];
