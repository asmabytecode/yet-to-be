import { Inject, Injectable } from '@nestjs/common';
import type { MediaRejectReason, MediaStatus } from '@yet-to-be/shared';
import { PrismaService } from '../../database/prisma.service';
import type { MediaAsset } from '../../generated/prisma/client';

@Injectable()
export class MediaRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(data: {
    id: string;
    uploadedById: string;
    originalSha256: string;
    originalSize: number;
  }): Promise<MediaAsset> {
    return this.prisma.mediaAsset.create({ data });
  }

  find(id: string): Promise<MediaAsset | null> {
    return this.prisma.mediaAsset.findFirst({ where: { id, deletedAt: null } });
  }

  /** Готові (ready) й не видалені файли за списком id — для публічних сторінок. */
  findReady(ids: readonly string[]): Promise<MediaAsset[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.mediaAsset.findMany({
      where: { id: { in: [...new Set(ids)] }, status: 'ready', deletedAt: null },
    });
  }

  list(
    filter: { status?: MediaStatus },
    page: { take: number; cursor?: { id: string }; skip?: number },
  ): Promise<MediaAsset[]> {
    return this.prisma.mediaAsset.findMany({
      ...page,
      where: { deletedAt: null, ...(filter.status === undefined ? {} : { status: filter.status }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** Кількість і обсяг завантажень користувача з певного моменту (квоти). */
  async usageSince(userId: string, since: Date): Promise<{ count: number; bytes: number }> {
    const result = await this.prisma.mediaAsset.aggregate({
      where: { uploadedById: userId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { originalSize: true },
    });
    return { count: result._count._all, bytes: result._sum.originalSize ?? 0 };
  }

  async markReady(
    id: string,
    data: { width: number; height: number; variants: Record<string, string> },
  ): Promise<void> {
    await this.prisma.mediaAsset.updateMany({
      where: { id, status: 'processing' },
      data: {
        status: 'ready',
        width: data.width,
        height: data.height,
        variants: JSON.stringify(data.variants),
      },
    });
  }

  async markRejected(id: string, reason: MediaRejectReason): Promise<void> {
    await this.prisma.mediaAsset.updateMany({
      where: { id, status: 'processing' },
      data: { status: 'rejected', rejectReason: reason },
    });
  }

  async softDelete(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.mediaAsset.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: now },
    });
    return count === 1;
  }
}
