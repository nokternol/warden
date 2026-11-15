import { http, HttpResponse } from 'msw';

/**
 * Empty setup lists for any Radarr or Sonarr instance a test configures without mocking them, so
 * the catalog refresh's list reads answer at once. Listed last: a test's own or a host's default
 * list handlers win.
 */
export const arrListFallbacks = ['tag', 'qualityprofile', 'rootfolder', 'languageprofile'].map(
  (list) => http.get(`*/api/v3/${list}`, () => HttpResponse.json([]))
);
