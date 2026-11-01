import { BaseProviderConnection } from './baseProviderConnection';

export interface SeerrRequestedBy {
  id: number;
  displayName: string;
  email: string;
}

export interface SeerrMedia {
  tmdbId: number;
  title: string;
}

export interface SeerrRequest {
  id: number;
  status: number;
  type: string;
  requestedBy: SeerrRequestedBy;
  media: SeerrMedia;
  createdAt: string;
}

export interface SeerrIssue {
  id: number;
  status: number;
  media: { tmdbId: number };
}

export interface SeerrSearchResult {
  id: number;
  mediaType: string;
  title?: string;
  name?: string;
  overview?: string;
  mediaInfo?: unknown;
}

interface SeerrSearchResponse {
  results: SeerrSearchResult[];
  page: number;
  totalPages: number;
  totalResults: number;
}

const SEERR_PAGE_SIZE = 100;

export class SeerrProvider extends BaseProviderConnection {
  private get authHeader() {
    return { 'X-Api-Key': this.provider.apiKey ?? '' };
  }

  public async getRequests(): Promise<SeerrRequest[]> {
    return this.allPages<SeerrRequest>('api/v1/request');
  }

  public async getIssues(): Promise<SeerrIssue[]> {
    return this.allPages<SeerrIssue>('api/v1/issue');
  }

  /** Every result of a paged list. Seerr answers with 10 unless asked for more. */
  private async allPages<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    for (let skip = 0; ; skip += SEERR_PAGE_SIZE) {
      const page = await this.client
        .get(path, { headers: this.authHeader, searchParams: { take: SEERR_PAGE_SIZE, skip } })
        .json<{ results: T[] }>();
      results.push(...page.results);
      if (page.results.length < SEERR_PAGE_SIZE) return results;
    }
  }

  public async search(query: string): Promise<SeerrSearchResult[]> {
    // Seerr rejects + and expects %20
    const encodedQuery = encodeURIComponent(query);
    const resp = await this.client
      .get(`api/v1/search?query=${encodedQuery}`, {
        headers: this.authHeader,
      })
      .json<SeerrSearchResponse>();
    return resp.results;
  }
}
