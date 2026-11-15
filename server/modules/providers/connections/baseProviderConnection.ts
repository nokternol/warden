import ky, { HTTPError, type KyInstance } from 'ky';
import type { Logger } from 'winston';

export interface ProviderConfig {
  name: string;
  url: string;
  apiKey: string | null;
  settings: Record<string, unknown> | null;
}

/**
 * Shared HTTP-client + config base for every provider. It owns connection
 * concerns (prefix URL, timeout, error logging) — not a metadata or role
 * contract. Role membership is declared by the role interfaces a subclass
 * `implements`, not by extending this class.
 */
export abstract class BaseProviderConnection {
  protected provider: ProviderConfig;
  protected log: Logger;
  protected client: KyInstance;

  constructor(provider: ProviderConfig, logger: Logger) {
    this.provider = provider;
    this.log = logger;

    const urlBaseSetting = this.provider.settings?.urlBase;
    const urlBase =
      typeof urlBaseSetting === 'string' ? urlBaseSetting.replace(/^\/+|\/+$/g, '') : '';
    const base = this.provider.url.replace(/\/+$/, '');
    const prefixUrl = urlBase ? `${base}/${urlBase}/` : `${base}/`;

    this.client = ky.create({
      prefixUrl,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
      },
      hooks: {
        beforeError: [
          (error) => {
            this.log.error(`[${this.provider.name}] HTTP Request Failed`, {
              url: error.request.url,
              method: error.request.method,
              errorMessage: error.message,
              responseStatus: error.response?.status,
            });
            return error;
          },
        ],
      },
    });

    this.log.debug(`Initialized ${this.constructor.name} for ${this.provider.name}`, {
      prefixUrl,
    });
  }

  /**
   * Runs one delete, counting an answer of 404 as done: a run plans against the library copy, so
   * the item may already be gone from the service, which is what the delete was for.
   */
  protected async deleteAlreadyGoneIsDone(remove: () => Promise<unknown>): Promise<void> {
    try {
      await remove();
    } catch (err) {
      if (err instanceof HTTPError && err.response.status === 404) return;
      throw err;
    }
  }
}
