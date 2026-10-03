import useSWR, { type SWRConfiguration } from 'swr';

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
    input === null ? null : [procedure, input],
    () => procedure(input as TInput),
    config
  );
}
