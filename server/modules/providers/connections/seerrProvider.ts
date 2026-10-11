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

interface SeerrRequestsResponse {
  results: SeerrRequest[];
  pageInfo: {
    pages: number;
    pageSize: number;
    results: number;
    page: number;
  };
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

export class SeerrProvider extends BaseProviderConnection {
  private get authHeader() {
    return { 'X-Api-Key': this.provider.apiKey ?? '' };
  }

  public async getRequests(): Promise<SeerrRequest[]> {
    const resp = await this.client
      .get('api/v1/request', { headers: this.authHeader })
      .json<SeerrRequestsResponse>();
    return resp.results;
  }

  public async getIssues(): Promise<SeerrIssue[]> {
    const resp = await this.client
      .get('api/v1/issue', { headers: this.authHeader })
      .json<{ results: SeerrIssue[] }>();
    return resp.results;
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
