import { sortMedia } from '@server/modules/media/media.sort';
import { describe, expect, it } from 'vitest';

interface Row {
  title: string;
  year?: number;
  hasFile: boolean;
}

const rows: Row[] = [
  { title: 'Bravo', year: 2001, hasFile: true },
  { title: 'Alpha', year: 2010, hasFile: false },
  { title: 'Charlie', year: 1995, hasFile: true },
];

const statusOf = (r: Row) => r.hasFile;
const titles = (rs: Row[]) => rs.map((r) => r.title);

describe('sortMedia', () => {
  it('defaults to ascending title order', () => {
    expect(titles(sortMedia(rows, 'title_asc', statusOf))).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it("orders titles by the provider's sort title, so quotes and leading articles do not decide", () => {
    const real = [
      { title: '“Wuthering Heights”', sortTitle: 'wuthering heights', hasFile: true },
      { title: 'The Matrix', sortTitle: 'matrix', hasFile: true },
      { title: '10 Cloverfield Lane', sortTitle: '10 cloverfield lane', hasFile: true },
      { title: 'Alien', hasFile: true },
    ];
    expect(sortMedia(real, 'title_asc', (r) => r.hasFile).map((r) => r.title)).toEqual([
      '10 Cloverfield Lane',
      'Alien',
      'The Matrix',
      '“Wuthering Heights”',
    ]);
  });

  it('reverses on title_desc', () => {
    expect(titles(sortMedia(rows, 'title_desc', statusOf))).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by year ascending and descending', () => {
    expect(titles(sortMedia(rows, 'year_asc', statusOf))).toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(titles(sortMedia(rows, 'year_desc', statusOf))).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by the injected status key — false first on ascending', () => {
    expect(titles(sortMedia(rows, 'status_asc', statusOf))[0]).toBe('Alpha'); // hasFile false
    expect(titles(sortMedia(rows, 'status_desc', statusOf))[0]).not.toBe('Alpha');
  });

  it('does not mutate the input array', () => {
    const original = titles(rows);
    sortMedia(rows, 'year_desc', statusOf);
    expect(titles(rows)).toEqual(original);
  });
});
