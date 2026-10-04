import type { ContentType, FilterSchema } from '@contract/schemas';
import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import type { z } from 'zod';

/**
 * Test helper for making authenticated API requests
 */
export function createApiClient(app: Express) {
  return {
    /**
     * GET request with common test setup
     */
    get: (url: string, options?: { headers?: Record<string, string> }) =>
      request(app)
        .get(url)
        .set(options?.headers || {}),

    /**
     * POST request with common test setup
     */
    post: (url: string, body?: object, options?: { headers?: Record<string, string> }) =>
      request(app)
        .post(url)
        .send(body)
        .set(options?.headers || {}),

    /**
     * PUT request with common test setup
     */
    put: (url: string, body?: object, options?: { headers?: Record<string, string> }) =>
      request(app)
        .put(url)
        .send(body)
        .set(options?.headers || {}),

    /**
     * PATCH request with common test setup
     */
    patch: (url: string, body?: object, options?: { headers?: Record<string, string> }) =>
      request(app)
        .patch(url)
        .send(body)
        .set(options?.headers || {}),

    /**
     * DELETE request with common test setup
     */
    delete: (url: string, options?: { headers?: Record<string, string> }) =>
      request(app)
        .delete(url)
        .set(options?.headers || {}),
  };
}

/**
 * Helper to assert successful API responses
 */
export function expectSuccessResponse(response: request.Response, expectedData?: unknown) {
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('status', 'ok');
  expect(response.body).toHaveProperty('data');

  if (expectedData !== undefined) {
    expect(response.body.data).toEqual(expectedData);
  }

  return response.body.data;
}

/**
 * Helper to assert error API responses
 */
export function expectErrorResponse(
  response: request.Response,
  expectedStatus: number,
  expectedType?: string
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('status', 'error');
  expect(response.body).toHaveProperty('error');
  expect(response.body.error).toHaveProperty('message');
  expect(response.body.error).toHaveProperty('type');

  if (expectedType) {
    expect(response.body.error.type).toBe(expectedType);
  }

  return response.body.error;
}

/**
 * Helper to assert validation error responses
 */
export function expectValidationError(
  response: request.Response,
  expectedErrors?: Record<string, string[]>
) {
  const error = expectErrorResponse(response, 400, 'VALIDATION_ERROR');
  expect(error).toHaveProperty('errors');

  if (expectedErrors) {
    expect(error.errors).toEqual(expectedErrors);
  }

  return error.errors;
}

type Filter = z.infer<typeof FilterSchema>;

/**
 * The browse URL for a content type: the saved-query `Filter` entries as the
 * JSON `filters` param, plus any sort and page params.
 */
export function browsePath(
  contentType: ContentType,
  filters: Filter[] = [],
  view: { sort?: string; page?: number; pageSize?: number } = {}
): string {
  const query = new URLSearchParams();
  if (filters.length > 0) query.set('filters', JSON.stringify(filters));
  for (const [key, value] of Object.entries(view)) query.set(key, String(value));
  const search = query.toString();
  return `/api/media/${contentType}${search ? `?${search}` : ''}`;
}
