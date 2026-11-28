import { Get, Inject, Query } from '@nestjs/common';
import {
  type AuditEntryDto,
  type AuditQuery,
  auditQuerySchema,
  type ListResponse,
} from '@yet-to-be/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminController } from '../../platform/admin-controller';
import { RequirePermission } from '../../platform/require-permission';
import { AuditService } from './audit.service';

/** Журнал лише для читання: змінити чи видалити запис через API неможливо. */
@AdminController('audit')
export class AdminAuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  list(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery,
  ): Promise<ListResponse<AuditEntryDto>> {
    return this.audit.search(query);
  }
}
