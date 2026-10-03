import { ContentTypeSchema, MediaQueryRecordSchema } from '@contract/schemas';
import { describe, expect, it } from 'vitest';

describe('content type', () => {
  it('accepts movie and series', () => {
    expect(ContentTypeSchema.parse('movie')).toBe('movie');
    expect(ContentTypeSchema.parse('series')).toBe('series');
  });

  it('rejects anything else, including the retired show', () => {
    expect(ContentTypeSchema.safeParse('show').success).toBe(false);
    expect(ContentTypeSchema.safeParse('tv').success).toBe(false);
  });

  it('is the content type a media query carries', () => {
    expect(MediaQueryRecordSchema.shape.contentType).toBe(ContentTypeSchema);
  });
});
