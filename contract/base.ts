import { oc } from '@orpc/contract';

/** Per-procedure metadata the server's implementer root reads. */
export interface ApiMeta {
  /** Answers without a signed-in user. Every other procedure requires one. */
  public?: boolean;
}

/** The builder every contract procedure starts from. */
export const base = oc.$meta<ApiMeta>({});
