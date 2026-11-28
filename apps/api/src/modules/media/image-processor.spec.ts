import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectImageType, ImageRejectedError, processImage } from './image-processor';

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } });
}

async function reasonOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ImageRejectedError ? error.reason : 'unexpected';
  }
}

describe('detectImageType (magic bytes)', () => {
  it('recognizes JPEG, PNG and WebP by content, not by name', async () => {
    expect(detectImageType(await solid(4, 4).jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageType(await solid(4, 4).png().toBuffer())).toBe('png');
    expect(detectImageType(await solid(4, 4).webp().toBuffer())).toBe('webp');
  });

  it.each([
    ['HTML', '<!doctype html><script>alert(1)</script>'],
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
    ['GIF', 'GIF89a\u0001\u0000\u0001\u0000'],
    ['PDF', '%PDF-1.7'],
    ['ZIP', 'PK\u0003\u0004'],
    ['empty', ''],
  ])('rejects %s', (_name, content) => {
    expect(detectImageType(Buffer.from(content, 'latin1'))).toBeNull();
  });
});

describe('processImage', () => {
  it('produces three webp variants without enlarging small images', async () => {
    const result = await processImage(await solid(3000, 1500).jpeg().toBuffer(), 40_000_000);
    expect(result).toMatchObject({ width: 3000, height: 1500 });
    expect(result.variants.map((v) => [v.name, v.width])).toEqual([
      ['thumb', 320],
      ['md', 1280],
      ['lg', 2048],
    ]);
    for (const variant of result.variants) {
      expect((await sharp(variant.data).metadata()).format).toBe('webp');
    }
    const small = await processImage(await solid(100, 50).png().toBuffer(), 40_000_000);
    expect(small.variants.every((v) => v.width === 100)).toBe(true);
  });

  it('strips EXIF (including GPS) from the output', async () => {
    const withExif = await solid(64, 64)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-owner' }, IFD3: { GPSLatitudeRef: 'N' } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const { variants } = await processImage(withExif, 40_000_000);
    for (const variant of variants) {
      const meta = await sharp(variant.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(variant.data.includes('secret-owner')).toBe(false);
    }
  });

  it('drops content smuggled after the image (polyglot)', async () => {
    const polyglot = Buffer.concat([
      await solid(32, 32).png().toBuffer(),
      Buffer.from('<html><script>alert(document.cookie)</script></html>'),
    ]);
    const { variants } = await processImage(polyglot, 40_000_000);
    for (const variant of variants) {
      expect(variant.data.includes('<script>')).toBe(false);
    }
  });

  it('rejects pixel bombs, corrupt and animated images', async () => {
    expect(await reasonOf(processImage(await solid(1200, 1000).png().toBuffer(), 1_000_000))).toBe(
      'too_many_pixels',
    );
    const png = await solid(32, 32).png().toBuffer();
    expect(await reasonOf(processImage(png.subarray(0, 40), 40_000_000))).toBe('invalid_image');
    // Два РІЗНІ кадри: однакові libvips зливає в один, і анімації не виходить.
    const frames = await Promise.all(
      ['#ff0000', '#0000ff'].map((background) =>
        sharp({ create: { width: 8, height: 8, channels: 3, background } })
          .png()
          .toBuffer(),
      ),
    );
    const animated = await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(await reasonOf(processImage(animated, 40_000_000))).toBe('animated');
  });
});
