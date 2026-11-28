import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ERROR_CODES,
  type ListResponse,
  MEDIA_REJECT_REASONS,
  type MediaAssetDto,
  type MediaQuery,
  type MediaRejectReason,
  type MediaVariant,
  mediaStatusSchema,
  type PublicImage,
} from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import { AppConfigService } from '../../config/app-config.service';
import type { MediaAsset } from '../../generated/prisma/client';
import { CLOCK, type Clock } from '../../platform/clock';
import { JobQueue } from '../../platform/job-queue';
import { MediaUsageRegistry } from '../../platform/media-usage';
import { pageArgs, toPage } from '../../platform/pagination';
import { ADMIN_AUDIT, AuditService } from '../audit';
import { detectImageType, ImageRejectedError, processImage } from './image-processor';
import { MALWARE_SCANNER, type MalwareScanner } from './malware-scanner';
import { MediaRepository } from './media.repository';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';

/** Квоти на користувача за добу: захист від заповнення сховища й DoS. */
export const MEDIA_DAILY_COUNT = 100;
export const MEDIA_DAILY_BYTES = 500 * 1024 * 1024;
const DAY_MS = 86_400_000;
const PROCESS_JOB = 'media.process';
const PURGE_JOB = 'media.purge';
const IMMUTABLE = 'public, max-age=31536000, immutable';

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

function parseVariants(raw: string | null): Partial<Record<MediaVariant, string>> {
  if (raw === null) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object') return {};
    const result: Partial<Record<MediaVariant, string>> = {};
    for (const name of ['thumb', 'md', 'lg'] as const) {
      const key = (value as Record<string, unknown>)[name];
      if (typeof key === 'string') result[name] = key;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Медіа-пайплайн: прийом → карантин → антивірус → перекодування → публічний bucket.
 * Оригінал ніколи не віддається; у bucket media потрапляють лише згенеровані webp.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  constructor(
    @Inject(MediaRepository) private readonly repository: MediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(MediaUsageRegistry) private readonly usage: MediaUsageRegistry,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.jobs.register(PROCESS_JOB, (payload) => this.process(payload.assetId ?? ''));
    this.jobs.register(PURGE_JOB, (payload) => this.purge(payload.keys ?? '[]'));
  }

  async upload(actorId: string, data: Buffer, ip: string | null): Promise<MediaAssetDto> {
    const type = detectImageType(data.subarray(0, 16));
    if (type === null) {
      throw new AppException(
        415,
        ERROR_CODES.MEDIA_UNSUPPORTED_TYPE,
        'Only JPEG, PNG and WebP are allowed',
      );
    }
    const usage = await this.repository.usageSince(
      actorId,
      new Date(this.clock.now().getTime() - DAY_MS),
    );
    if (usage.count >= MEDIA_DAILY_COUNT || usage.bytes + data.length > MEDIA_DAILY_BYTES) {
      throw new AppException(429, ERROR_CODES.MEDIA_QUOTA_EXCEEDED, 'Daily upload quota exceeded');
    }

    const id = randomUUID();
    const { quarantine } = this.config.media.buckets;
    // Ключ — лише id: жодних імен файлів від клієнта (path traversal неможливий).
    await this.storage.put(quarantine, id, data, { contentType: 'application/octet-stream' });
    const asset = await this.repository.create({
      id,
      uploadedById: actorId,
      originalSha256: sha256(data),
      originalSize: data.length,
    });
    await this.audit.record({
      actorId,
      action: ADMIN_AUDIT.MEDIA_UPLOAD,
      target: { type: 'media', id },
      metadata: { size: data.length, type },
      ip,
    });
    this.jobs.enqueue(PROCESS_JOB, { assetId: id }, { retries: 0 });
    return this.toDto(asset);
  }

  /** Обробка з карантину. Будь-яка помилка → rejected (fail closed), карантин чиститься завжди. */
  async process(assetId: string): Promise<void> {
    const asset = await this.repository.find(assetId);
    if (asset === null || asset.status !== 'processing') return;
    const { media, quarantine } = this.config.media.buckets;
    try {
      const original = await this.storage.get(quarantine, assetId, this.config.media.maxBytes);
      const scan = await this.scanner.scan(original);
      if (!scan.clean) {
        await this.reject(asset, 'malware', { signature: scan.signature ?? 'unknown' });
        return;
      }
      const image = await processImage(original, this.config.media.maxPixels);
      const keys: Record<string, string> = {};
      for (const variant of image.variants) {
        const key = `${assetId}/${variant.name}-${sha256(variant.data).slice(0, 12)}.webp`;
        await this.storage.put(media, key, variant.data, {
          contentType: 'image/webp',
          cacheControl: IMMUTABLE,
        });
        keys[variant.name] = key;
      }
      await this.repository.markReady(assetId, {
        width: image.width,
        height: image.height,
        variants: keys,
      });
    } catch (error) {
      await this.reject(
        asset,
        error instanceof ImageRejectedError ? error.reason : 'processing_failed',
      );
    } finally {
      await this.storage.delete(quarantine, assetId).catch(() => undefined);
    }
  }

  async get(id: string): Promise<MediaAssetDto> {
    const asset = await this.repository.find(id);
    if (asset === null) throw new AppException(404, ERROR_CODES.NOT_FOUND, 'Media not found');
    return this.toDto(asset);
  }

  async list(query: MediaQuery): Promise<ListResponse<MediaAssetDto>> {
    const rows = await this.repository.list(
      query.status === undefined ? {} : { status: query.status },
      pageArgs(query),
    );
    return toPage(rows, query.limit, (row) => this.toDto(row));
  }

  /**
   * Для публічних сторінок: URL варіантів лише готових файлів. Відхилений, видалений чи ще не
   * оброблений файл просто відсутній у результаті (сторінка покаже подію без зображення).
   */
  async publicImages(ids: readonly string[]): Promise<Map<string, PublicImage>> {
    const rows = await this.repository.findReady(ids);
    const result = new Map<string, PublicImage>();
    for (const row of rows) {
      const dto = this.toDto(row);
      if (dto.variants === null) continue;
      result.set(row.id, { ...dto.variants, width: dto.width, height: dto.height });
    }
    return result;
  }

  /** Для інших модулів: посилатися можна лише на готовий файл. */
  async assertReady(id: string): Promise<void> {
    const asset = await this.repository.find(id);
    if (asset?.status !== 'ready') {
      throw new AppException(409, ERROR_CODES.MEDIA_NOT_READY, 'Media is not ready');
    }
  }

  async delete(actorId: string, id: string, ip: string | null): Promise<void> {
    const asset = await this.repository.find(id);
    if (asset === null) throw new AppException(404, ERROR_CODES.NOT_FOUND, 'Media not found');
    if (await this.usage.isInUse(id)) {
      throw new AppException(409, ERROR_CODES.MEDIA_IN_USE, 'Media is used by other content');
    }
    if (!(await this.repository.softDelete(id, this.clock.now()))) return;
    await this.audit.record({
      actorId,
      action: ADMIN_AUDIT.MEDIA_DELETE,
      target: { type: 'media', id },
      ip,
    });
    // Запис лишається для журналу; файли видаляються у фоні.
    this.jobs.enqueue(PURGE_JOB, {
      keys: JSON.stringify(Object.values(parseVariants(asset.variants))),
    });
  }

  private async purge(rawKeys: string): Promise<void> {
    const parsed: unknown = JSON.parse(rawKeys);
    if (!Array.isArray(parsed)) return;
    for (const key of parsed) {
      if (typeof key === 'string') await this.storage.delete(this.config.media.buckets.media, key);
    }
  }

  private async reject(
    asset: MediaAsset,
    reason: MediaRejectReason,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.repository.markRejected(asset.id, reason);
    await this.audit.record({
      actorId: asset.uploadedById,
      action: ADMIN_AUDIT.MEDIA_REJECTED,
      target: { type: 'media', id: asset.id },
      metadata: { reason, ...metadata },
    });
  }

  private toDto(asset: MediaAsset): MediaAssetDto {
    const base = this.config.media.publicBaseUrl.replace(/\/$/, '');
    const status = mediaStatusSchema.catch('rejected').parse(asset.status);
    const variants = parseVariants(asset.variants);
    const reason = MEDIA_REJECT_REASONS.find((value) => value === asset.rejectReason) ?? null;
    return {
      id: asset.id,
      status,
      rejectReason: status === 'rejected' ? (reason ?? 'processing_failed') : null,
      width: asset.width,
      height: asset.height,
      variants:
        status === 'ready'
          ? Object.fromEntries(
              Object.entries(variants).map(([name, key]) => [name, `${base}/${key}`]),
            )
          : null,
      createdAt: asset.createdAt.toISOString(),
    };
  }
}
