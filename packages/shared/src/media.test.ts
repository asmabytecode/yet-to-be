import { describe, expect, it } from 'vitest';
import { mediaAssetDtoSchema, mediaQuerySchema } from './media';

describe('media schemas', () => {
  it('describes a ready asset with partial variants', () => {
    const dto = {
      id: 'a',
      status: 'ready',
      rejectReason: null,
      width: 10,
      height: 10,
      variants: { thumb: '/media/a/thumb-0123456789ab.webp' },
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    expect(mediaAssetDtoSchema.parse(dto)).toEqual(dto);
    expect(mediaAssetDtoSchema.safeParse({ ...dto, variants: { original: 'x' } }).success).toBe(
      false,
    );
  });

  it('filters by status only', () => {
    expect(mediaQuerySchema.parse({ status: 'rejected' })).toEqual({
      status: 'rejected',
      limit: 20,
    });
    expect(mediaQuerySchema.safeParse({ uploadedBy: 'x' }).success).toBe(false);
  });
});
