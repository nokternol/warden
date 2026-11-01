import { describe, expect, it } from 'vitest';
import { type InstanceOption, selectedKeys, storedSelection } from '../instanceSelection';

const option = (providerId: number, id: number): InstanceOption => ({
  id,
  displayName: `tag ${id}`,
  providerId,
  providerName: `Radarr ${providerId}`,
});

// Both instances minted id 1.
const OPTIONS = [option(1, 1), option(1, 2), option(2, 1), option(2, 3)];

describe('instance selection', () => {
  it('selects one option when two instances reuse an id', () => {
    expect(storedSelection(OPTIONS, [], ['2:1'])).toEqual({ ids: [1], providerId: 2 });
    expect(selectedKeys(OPTIONS, [1], 2)).toEqual(['2:1']);
  });

  it('stores a selection across instances unqualified when no id is shared', () => {
    expect(storedSelection(OPTIONS, ['1:2'], ['1:2', '2:3'])).toEqual({
      ids: [2, 3],
      providerId: undefined,
    });
  });

  it('narrows to the added option when an unqualified value would also match an unchosen one', () => {
    expect(storedSelection(OPTIONS, ['1:2'], ['1:2', '2:1'])).toEqual({ ids: [1], providerId: 2 });
  });

  it('narrows on a removal too, so a removed option cannot still match', () => {
    expect(storedSelection(OPTIONS, ['1:1', '2:1', '2:3'], ['1:1', '2:3'])).toEqual({
      ids: [3],
      providerId: 2,
    });
  });

  it('stores both when every option sharing an id is chosen', () => {
    expect(storedSelection(OPTIONS, ['1:1'], ['1:1', '2:1'])).toEqual({
      ids: [1, 1],
      providerId: undefined,
    });
  });
});
