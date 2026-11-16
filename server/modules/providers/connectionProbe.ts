import { apiUrlOf } from '@contract/providerUrl';
import type { MetadataProviderType } from '@server/database/schema';
import { HTTPError } from 'ky';
import type { Logger } from 'winston';
import { PROVIDER_CATALOGUE } from './providerCatalogue';
import type { IProviderFactory } from './providerFactory';

/**
 * Tests the address and key the owner entered, through the connection runs use: the factory builds
 * it at the host plus the type's API path, and the connection's own `testConnection` makes the call
 * with its own authentication and timeout. Resolves when the provider accepts them, rejects with a
 * message for the owner otherwise.
 */
export async function probeConnection(
  factory: IProviderFactory,
  request: { type: MetadataProviderType; url: string; apiKey?: string },
  logger: Logger
): Promise<void> {
  const { label, apiPath, apiKeyRequired } = PROVIDER_CATALOGUE[request.type];
  const apiKey = request.apiKey ?? '';
  if (apiKeyRequired && apiKey === '') {
    throw new Error('Enter the API key to test this connection');
  }
  const connection = factory.create(
    {
      type: request.type,
      name: label,
      url: apiUrlOf(request.url, apiPath),
      apiKey,
      settings: null,
    },
    logger
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
