import { Controller, Get, Inject } from '@nestjs/common';
import { ERROR_CODES } from '@yet-to-be/shared';
import { AppException } from '../common/app-exception';
import { Public } from '../common/decorators';
import { PrismaService } from '../database/prisma.service';

/** Liveness (процес живий) і readiness (залежності доступні). Без деталей — публічні. */
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException(503, ERROR_CODES.NOT_READY, 'Service not ready');
    }
    return { status: 'ok' };
  }
}
