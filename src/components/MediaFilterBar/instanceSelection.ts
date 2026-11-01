export interface InstanceOption {
  id: number;
  displayName: string;
  providerId: number;
  providerName: string;
}

/** An option's identity: instances mint their own ids, so an id alone can name two options. */
export function optionKey(option: Pick<InstanceOption, 'id' | 'providerId'>): string {
  return `${option.providerId}:${option.id}`;
}

/** The options a stored value selects: its ids, in the instance it names if it names one. */
export function selectedKeys(
  options: InstanceOption[],
  ids: number[],
  providerId: number | undefined
): string[] {
  return options
    .filter((o) => ids.includes(o.id) && (providerId === undefined || o.providerId === providerId))
    .map(optionKey);
}

/**
 * The stored value for a selection. One instance qualifies the ids. Across instances they are
 * unqualified and each item is matched in its own instance's id space, which is only faithful if
 * every option sharing a selected id is selected too. A selection that cannot be stored faithfully
 * narrows to the instance of the option just changed, so a filter never matches an unchosen option.
 */
export function storedSelection(
  options: InstanceOption[],
  previous: string[],
  next: string[]
): { ids: number[]; providerId: number | undefined } {
  let chosen = options.filter((o) => next.includes(optionKey(o)));
  const ids = new Set(chosen.map((o) => o.id));
  const unfaithful = options.some((o) => ids.has(o.id) && !next.includes(optionKey(o)));
  if (unfaithful && new Set(chosen.map((o) => o.providerId)).size > 1) {
    const changed =
      chosen.find((o) => !previous.includes(optionKey(o))) ??
      options.find((o) => previous.includes(optionKey(o)) && !next.includes(optionKey(o)));
    if (changed) chosen = chosen.filter((o) => o.providerId === changed.providerId);
  }
  const providers = new Set(chosen.map((o) => o.providerId));
  return {
    ids: chosen.map((o) => o.id),
    providerId: providers.size === 1 ? chosen[0]?.providerId : undefined,
  };
}
