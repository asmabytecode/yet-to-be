import {
  MEDIA_VARIANTS,
  type MediaInputType,
  type MediaRejectReason,
  type MediaVariant,
} from '@yet-to-be/shared';
import sharp from 'sharp';

/** Визначає формат за МАГІЧНИМИ байтами. Розширення й Content-Type клієнта не важать. */
export function detectImageType(head: Buffer): MediaInputType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= 8 && png.every((byte, index) => head[index] === byte)) return 'png';
  if (
    head.length >= 12 &&
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export class ImageRejectedError extends Error {
  constructor(readonly reason: MediaRejectReason) {
    super(`Image rejected: ${reason}`);
    this.name = 'ImageRejectedError';
  }
}

export interface ProcessedVariant {
  name: MediaVariant;
  data: Buffer;
  width: number;
  height: number;
}

export interface ProcessedImage {
  width: number;
  height: number;
  variants: ProcessedVariant[];
}

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

/**
 * Перекодовує зображення у webp-варіанти. Результат — нові файли, згенеровані бібліотекою:
 * метадані (EXIF/GPS, ICC, коментарі) не копіюються, а будь-який «вбудований» вміст
 * (HTML/JS у polyglot-файлі, дані після кінця зображення) не переживає перекодування.
 */
export async function processImage(input: Buffer, maxPixels: number): Promise<ProcessedImage> {
  const options = { limitInputPixels: maxPixels, failOn: 'error' as const };
  let metadata: sharp.Metadata;
  try {
    // Метадані читаються із заголовка без декодування пікселів; ліміт пікселів перевіряємо
    // нижче самі, щоб відрізнити «піксельну бомбу» від зламаного файлу.
    metadata = await sharp(input, { failOn: 'error', limitInputPixels: false }).metadata();
  } catch {
    throw new ImageRejectedError('invalid_image');
  }
  const { width, height, format } = metadata;
  if (width <= 0 || height <= 0 || !ALLOWED_FORMATS.has(format)) {
    throw new ImageRejectedError('invalid_image');
  }
  // Заголовок читається без декодування — перевіряємо розмір до важкої роботи.
  if (width * height > maxPixels) throw new ImageRejectedError('too_many_pixels');
  if ((metadata.pages ?? 1) > 1) throw new ImageRejectedError('animated');

  const variants: ProcessedVariant[] = [];
  for (const [name, targetWidth] of Object.entries(MEDIA_VARIANTS) as [MediaVariant, number][]) {
    try {
      const { data, info } = await sharp(input, options)
        .rotate() // орієнтація з EXIF застосовується до пікселів, сам EXIF не копіюється
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      variants.push({ name, data, width: info.width, height: info.height });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      throw new ImageRejectedError(
        /pixel limit/i.test(message) ? 'too_many_pixels' : 'invalid_image',
      );
    }
  }
  return { width, height, variants };
}
