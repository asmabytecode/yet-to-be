import { Delete, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ERROR_CODES,
  type ListResponse,
  type MediaAssetDto,
  type MediaQuery,
  mediaQuerySchema,
} from '@yet-to-be/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { AppException } from '../../common/app-exception';
import type { AccessSnapshot } from '../../common/request-context';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AppConfigService } from '../../config/app-config.service';
import { AdminController } from '../../platform/admin-controller';
import { CurrentAccess, RequirePermission } from '../../platform/require-permission';
import { MediaService } from './media.service';
import { readSingleFile, UploadError } from './multipart';

const idSchema = z.uuid();
const UPLOAD_LIMIT = { default: { limit: 30, ttl: 60_000 } };
/** Запас на заголовки multipart поверх розміру файлу. */
const MULTIPART_OVERHEAD = 64 * 1024;

@AdminController('media')
export class AdminMediaController {
  constructor(
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /** multipart/form-data з одним полем `file`. Відповідь — 201 зі статусом processing. */
  @Post()
  @RequirePermission('media:write')
  @Throttle(UPLOAD_LIMIT)
  async upload(
    @CurrentAccess() access: AccessSnapshot,
    @Req() req: Request,
  ): Promise<MediaAssetDto> {
    const { maxBytes } = this.config.media;
    const declared = Number(req.headers['content-length'] ?? 0);
    if (!Number.isFinite(declared) || declared > maxBytes + MULTIPART_OVERHEAD) {
      throw new AppException(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'File is too large');
    }
    let data: Buffer;
    try {
      data = await readSingleFile(req, maxBytes);
    } catch (error) {
      if (error instanceof UploadError && error.kind === 'too_large') {
        throw new AppException(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'File is too large');
      }
      const kind = error instanceof UploadError ? error.kind : 'malformed';
      // Тип відмови (no_file/malformed) без подробиць запиту — щоб клієнт знав, що виправити.
      throw new AppException(
        400,
        ERROR_CODES.VALIDATION_FAILED,
        `Send exactly one file in the "file" field (${kind})`,
      );
    }
    return this.media.upload(access.userId, data, req.ip ?? null);
  }

  @Get()
  @RequirePermission('media:write')
  list(
    @Query(new ZodValidationPipe(mediaQuerySchema)) query: MediaQuery,
  ): Promise<ListResponse<MediaAssetDto>> {
    return this.media.list(query);
  }

  @Get(':id')
  @RequirePermission('media:write')
  get(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<MediaAssetDto> {
    return this.media.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('media:delete')
  async remove(
    @CurrentAccess() access: AccessSnapshot,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.media.delete(access.userId, id, req.ip ?? null);
  }
}
