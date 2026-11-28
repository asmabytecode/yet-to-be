import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { type ObjectStorage, ObjectTooLargeError, type PutOptions } from './object-storage';

export interface S3Settings {
  endpoint: string | undefined;
  region: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  forcePathStyle: boolean;
}

/** S3-сумісне сховище (MinIO локально, будь-який S3 у production). */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(settings: S3Settings) {
    if (settings.accessKeyId === undefined || settings.secretAccessKey === undefined) {
      throw new Error('S3 credentials are required');
    }
    this.client = new S3Client({
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
      ...(settings.endpoint === undefined ? {} : { endpoint: settings.endpoint }),
    });
  }

  async put(bucket: string, key: string, body: Buffer, options: PutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: options.contentType,
        ...(options.cacheControl === undefined ? {} : { CacheControl: options.cacheControl }),
      }),
    );
  }

  async get(bucket: string, key: string, maxBytes: number): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if ((response.ContentLength ?? 0) > maxBytes) throw new ObjectTooLargeError();
    const bytes = await response.Body?.transformToByteArray();
    if (bytes === undefined) throw new Error('Empty object body');
    if (bytes.length > maxBytes) throw new ObjectTooLargeError();
    return Buffer.from(bytes);
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}
