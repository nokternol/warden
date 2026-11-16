import { apiUrlOf } from '@contract/providerUrl';
import type { MetadataProvider, MetadataProviderType } from '@server/database/schema';
import { HTTPError } from 'ky';
import winston from 'winston';
import { PROVIDER_CATALOGUE } from './providerCatalogue';
import type { IProviderFactory } from './providerFactory';

/**
 * The logger a tested connection writes to. A failed test is answered to the owner through
 * `describeFailure`, and the connection's own failure log would carry the request URL, which can
 * carry the key, so a test logs nothing.
 */
const SILENT = winston.createLogger({ silent: true });

/**
 * Tests the address and key the owner entered, through the connection runs use: the factory builds
 * it at the host plus the type's API path, and the connection's own `testConnection` makes the call
 * with its own authentication and timeout. Testing a saved provider builds the connection from the
 * saved provider's type, name and settings, with its stored key unless a key was typed. Resolves
 * when the provider accepts them, rejects with a message for the owner otherwise.
 */
export async function probeConnection(
  factory: IProviderFactory,
  request: { type: MetadataProviderType; url: string; apiKey?: string },
  saved?: MetadataProvider
): Promise<void> {
  const type = saved?.type ?? request.type;
  const { label, apiPath, apiKeyRequired } = PROVIDER_CATALOGUE[type];
  const apiKey =
    request.apiKey ?? (saved === undefined ? '' : (storedKeyFor(saved, request.url) ?? ''));
  if (apiKeyRequired && apiKey === '') {
    throw new Error('Enter the API key to test this connection');
  }
  const connection = factory.create(
    {
      type,
      name: saved?.name ?? label,
      url: apiUrlOf(request.url, apiPath),
      apiKey,
      settings: saved?.settings ?? null,
    },
    SILENT
  );
  try {
    await connection.testConnection();
  } catch (err) {
    throw new Error(describeFailure(err, label));
  }
}

/** One status answers both questions: a refused key means the address already worked. */
function describeFailure(err: unknown, label: string): string {
  if (!(err instanceof HTTPError)) return `Couldn't reach ${label} at this address`;
  const { status } = err.response;
  if (status === 401 || status === 403) return `${label} refused this API key`;
  return `${label} answered with an error (${status})`;
}

/**
 * A stored key, for probing the address it was saved with. The client never holds this key, so
 * sending it to another host would hand it to whoever runs that host: a changed address needs the
 * key entered again.
 */
function storedKeyFor(stored: { url: string; apiKey: string | null }, url: string): string | null {
  if (new URL(url).origin !== new URL(stored.url).origin) {
    throw new Error('Enter the API key to test a different address');
  }
  return stored.apiKey;
}
