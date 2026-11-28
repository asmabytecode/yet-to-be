/** Порт сховища файлів. Реалізації: S3 (MinIO/AWS) і в пам'яті (тести, розробка). */
export interface ObjectStorage {
  put(bucket: string, key: string, body: Buffer, options: PutOptions): Promise<void>;
  /** Читає об'єкт повністю, але не більше maxBytes (інакше помилка). */
  get(bucket: string, key: string, maxBytes: number): Promise<Buffer>;
  delete(bucket: string, key: string): Promise<void>;
}

export interface PutOptions {
  contentType: string;
  cacheControl?: string;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export class ObjectTooLargeError extends Error {
  constructor() {
    super('Stored object exceeds the allowed size');
    this.name = 'ObjectTooLargeError';
  }
}

/** Сховище в пам'яті. У production заборонене валідацією env (STORAGE_DRIVER). */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; options: PutOptions }>();

  put(bucket: string, key: string, body: Buffer, options: PutOptions): Promise<void> {
    this.objects.set(`${bucket}/${key}`, { body: Buffer.from(body), options });
    return Promise.resolve();
  }

  get(bucket: string, key: string, maxBytes: number): Promise<Buffer> {
    const entry = this.objects.get(`${bucket}/${key}`);
    if (entry === undefined) return Promise.reject(new Error('Object not found'));
    if (entry.body.length > maxBytes) return Promise.reject(new ObjectTooLargeError());
    return Promise.resolve(Buffer.from(entry.body));
  }

  delete(bucket: string, key: string): Promise<void> {
    this.objects.delete(`${bucket}/${key}`);
    return Promise.resolve();
  }
}
