import { BaseProviderConnection } from './baseProviderConnection';

export interface TmdbMovieDetails {
  id: number;
  title: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  release_date: string;
  runtime: number;
  genres: Array<{ id: number; name: string }>;
  imdb_id: string;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  first_air_date: string;
  number_of_seasons: number;
  genres: Array<{ id: number; name: string }>;
}

export interface TmdbMovieEnriched extends TmdbMovieDetails {
  certification?: string;
  keywords?: string[];
  collectionId?: number;
  collectionName?: string;
  spokenLanguages?: string[];
  originCountry?: string[];
}

export interface TmdbTvEnriched extends TmdbTvDetails {
  certification?: string;
  keywords?: string[];
  spokenLanguages?: string[];
  originCountry?: string[];
}

/** Normalised streaming flags for a single region */
export interface TmdbStreamingServices {
  netflix: boolean;
  prime: boolean;
  disney: boolean;
  hulu: boolean;
  apple: boolean;
  hbo: boolean;
  paramount: boolean;
  peacock: boolean;
}

interface TmdbRawReleaseDates {
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{ certification: string; type: number }>;
  }>;
}

interface TmdbRawContentRatings {
  results: Array<{ iso_3166_1: string; rating: string }>;
}

interface TmdbRawMovieEnriched extends TmdbMovieDetails {
  release_dates?: TmdbRawReleaseDates;
  keywords?: { keywords: Array<{ id: number; name: string }> };
  belongs_to_collection?: { id: number; name: string } | null;
  spoken_languages?: Array<{ english_name: string }>;
  origin_country?: string[];
}

interface TmdbRawTvEnriched extends TmdbTvDetails {
  content_ratings?: TmdbRawContentRatings;
  keywords?: { results: Array<{ id: number; name: string }> };
  spoken_languages?: Array<{ english_name: string }>;
  origin_country?: string[];
}

const PROVIDER_ID_TO_FLAG: Record<number, keyof TmdbStreamingServices> = {
  8: 'netflix',
  9: 'prime',
  119: 'prime',
  337: 'disney',
  15: 'hulu',
  2: 'apple',
  384: 'hbo',
  1899: 'hbo',
  531: 'paramount',
  386: 'peacock',
};

function parseWatchProviders(
  results: Record<string, { flatrate?: Array<{ provider_id: number }> }> | undefined,
  region: string
): TmdbStreamingServices {
  const services: TmdbStreamingServices = {
    netflix: false,
    prime: false,
    disney: false,
    hulu: false,
    apple: false,
    hbo: false,
    paramount: false,
    peacock: false,
  };

  const regionData = results?.[region];
  if (!regionData) {
    return services;
  }

  for (const entry of regionData.flatrate ?? []) {
    const flag = PROVIDER_ID_TO_FLAG[entry.provider_id];
    if (flag) {
      services[flag] = true;
    }
  }

  return services;
}

function extractMovieCertification(
  releaseDates: TmdbRawReleaseDates | undefined
): string | undefined {
  if (!releaseDates || releaseDates.results.length === 0) {
    return undefined;
  }

  const usEntry = releaseDates.results.find((r) => r.iso_3166_1 === 'US');
  const searchIn = usEntry ? [usEntry] : releaseDates.results;

  for (const entry of searchIn) {
    const theatrical = entry.release_dates.find((rd) => rd.type === 3 && rd.certification !== '');
    if (theatrical) {
      return theatrical.certification;
    }
  }

  for (const entry of searchIn) {
    const first = entry.release_dates.find((rd) => rd.certification !== '');
    if (first) {
      return first.certification;
    }
  }

  return undefined;
}

function extractTvCertification(
  contentRatings: TmdbRawContentRatings | undefined
): string | undefined {
  if (!contentRatings || contentRatings.results.length === 0) {
    return undefined;
  }

  const usEntry = contentRatings.results.find((r) => r.iso_3166_1 === 'US');
  if (usEntry && usEntry.rating !== '') {
    return usEntry.rating;
  }

  const first = contentRatings.results.find((r) => r.rating !== '');
  return first?.rating;
}

export class TmdbProvider extends BaseProviderConnection {
  private get apiParams() {
    return { api_key: this.provider.apiKey || '' };
  }

  /** The release/airing status TMDB reports for an id, trying movie then tv. */
  public async getStatus(tmdbId: number): Promise<string | undefined> {
    for (const kind of ['movie', 'tv'] as const) {
      try {
        const data = await this.client
          .get(`${kind}/${tmdbId}`, { searchParams: this.apiParams })
          .json<{ status?: string }>();
        if (data.status) return data.status;
      } catch {
        // wrong media kind for this id — try the next endpoint
      }
    }
    return undefined;
  }

  public async getMovieDetailsEnriched(tmdbId: number): Promise<TmdbMovieEnriched> {
    const raw = await this.client
      .get(`movie/${tmdbId}`, {
        searchParams: {
          ...this.apiParams,
          append_to_response: 'keywords,release_dates',
        },
      })
      .json<TmdbRawMovieEnriched>();

    const certification = extractMovieCertification(raw.release_dates);
    const keywords = raw.keywords?.keywords.map((k) => k.name) ?? [];
    const collectionId = raw.belongs_to_collection?.id;
    const collectionName = raw.belongs_to_collection?.name;
    const spokenLanguages = raw.spoken_languages?.map((l) => l.english_name) ?? [];
    const originCountry = raw.origin_country ?? [];

    return {
      id: raw.id,
      title: raw.title,
      vote_average: raw.vote_average,
      vote_count: raw.vote_count,
      popularity: raw.popularity,
      release_date: raw.release_date,
      runtime: raw.runtime,
      genres: raw.genres,
      imdb_id: raw.imdb_id,
      certification,
      keywords,
      collectionId,
      collectionName,
      spokenLanguages,
      originCountry,
    };
  }

  public async getTvDetailsEnriched(tmdbId: number): Promise<TmdbTvEnriched> {
    const raw = await this.client
      .get(`tv/${tmdbId}`, {
        searchParams: {
          ...this.apiParams,
          append_to_response: 'keywords,content_ratings',
        },
      })
      .json<TmdbRawTvEnriched>();

    const certification = extractTvCertification(raw.content_ratings);
    const keywords = raw.keywords?.results.map((k) => k.name) ?? [];
    const spokenLanguages = raw.spoken_languages?.map((l) => l.english_name) ?? [];
    const originCountry = raw.origin_country ?? [];

    return {
      id: raw.id,
      name: raw.name,
      vote_average: raw.vote_average,
      vote_count: raw.vote_count,
      popularity: raw.popularity,
      first_air_date: raw.first_air_date,
      number_of_seasons: raw.number_of_seasons,
      genres: raw.genres,
      certification,
      keywords,
      spokenLanguages,
      originCountry,
    };
  }

  public async getMovieWatchProviders(
    tmdbId: number,
    region: string
  ): Promise<TmdbStreamingServices> {
    const data = await this.client
      .get(`movie/${tmdbId}/watch/providers`, { searchParams: this.apiParams })
      .json<{ results: Record<string, { flatrate?: Array<{ provider_id: number }> }> }>();
    return parseWatchProviders(data.results, region);
  }

  public async getTvWatchProviders(tmdbId: number, region: string): Promise<TmdbStreamingServices> {
    const data = await this.client
      .get(`tv/${tmdbId}/watch/providers`, { searchParams: this.apiParams })
      .json<{ results: Record<string, { flatrate?: Array<{ provider_id: number }> }> }>();
    return parseWatchProviders(data.results, region);
  }
}
