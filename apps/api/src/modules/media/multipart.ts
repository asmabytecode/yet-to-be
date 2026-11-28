import busboy from 'busboy';
import type { Request } from 'express';

export type UploadErrorKind = 'too_large' | 'no_file' | 'malformed';

export class UploadError extends Error {
  constructor(readonly kind: UploadErrorKind) {
    super(`Upload rejected: ${kind}`);
    this.name = 'UploadError';
  }
}

/** Ім'я єдиного дозволеного поля форми. */
export const UPLOAD_FIELD = 'file';

/**
 * Читає РІВНО один файл з multipart/form-data у пам'ять з жорстким лімітом розміру: будь-яке
 * інше поле чи другий файл — відмова. Ім'я файлу клієнта ігнорується (не зберігається й не
 * логується). Результат повертається лише коли і парсер, і потік файлу завершились.
 */
export function readSingleFile(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: maxBytes } });
    } catch {
      reject(new UploadError('malformed'));
      return;
    }

    let settled = false;
    let file: Promise<Buffer> | null = null;
    const fail = (kind: UploadErrorKind): void => {
      if (settled) return;
      settled = true;
      req.unpipe(parser);
      req.resume();
      reject(new UploadError(kind));
    };

    parser.on('file', (name, stream) => {
      if (name !== UPLOAD_FIELD || file !== null) {
        stream.resume();
        fail('malformed');
        return;
      }
      file = new Promise<Buffer>((done, broken) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('limit', () => {
          fail('too_large');
        });
        stream.on('error', broken);
        stream.on('end', () => {
          done(Buffer.concat(chunks));
        });
      });
    });
    parser.on('field', () => {
      fail('malformed');
    });
    parser.on('filesLimit', () => {
      fail('malformed');
    });
    parser.on('error', () => {
      fail('malformed');
    });
    parser.on('close', () => {
      if (settled) return;
      if (file === null) {
        fail('no_file');
        return;
      }
      file.then(
        (data) => {
          if (settled) return;
          if (data.length === 0) {
            fail('no_file');
            return;
          }
          settled = true;
          resolve(data);
        },
        () => {
          fail('malformed');
        },
      );
    });
    req.pipe(parser);
  });
}
