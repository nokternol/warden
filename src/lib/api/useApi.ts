import useSWR, { type SWRConfiguration } from 'swr';

/** The SWR cache key for one procedure called with one input. */
export function apiKey<TInput>(procedure: (input: TInput) => Promise<unknown>, input: TInput) {
  return [procedure, input] as const;
}

/**
 * Fetches a contract procedure through SWR, keyed by the procedure and its
 * input. A `null` input defers the fetch.
 */
export function useApi<TInput, TOutput>(
  procedure: (input: TInput) => Promise<TOutput>,
  input: TInput | null,
  config?: SWRConfiguration<TOutput, Error>
) {
  return useSWR<TOutput, Error>(
    input === null ? null : apiKey(procedure, input),
    () => procedure(input as TInput),
    config
  );
}
