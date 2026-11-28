import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminUserDetailDto,
  type AdminUserDto,
  type AdminUserQuery,
  ERROR_CODES,
  type ListResponse,
  type UserStatus,
  userStatusSchema,
} from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import { EncryptionService } from '../../infra/crypto/encryption.service';
import { HashingService } from '../../infra/crypto/hashing.service';
import { CLOCK, type Clock } from '../../platform/clock';
import { DomainEventBus } from '../../platform/domain-events';
import { pageArgs, toPage } from '../../platform/pagination';
import { UsersService } from '../../users/users.service';
import { ADMIN_AUDIT, AuditService } from '../audit';
import type { Access } from './access';
import { IamService } from './iam.service';
import { covers } from './iam.policy';
import { isFreshStepUp, MfaService } from './mfa.service';
import { UserAdminRepository, type UserListRecord } from './user-admin.repository';

export interface ActorContext {
  access: Access;
  sessionId: string;
  ip: string | null;
}

function statusOf(value: string): UserStatus {
  const parsed = userStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : 'active';
}

function toListDto(row: UserListRecord): AdminUserDto {
  return {
    id: row.id,
    displayName: row.displayName,
    status: statusOf(row.status),
    roles: row.roles.map(({ role }) => role.key).sort(),
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    blockedAt: row.blockedAt?.toISOString() ?? null,
  };
}

const notFound = () => new AppException(404, ERROR_CODES.NOT_FOUND, 'User not found');

/**
 * Керування користувачами з адмінки: пошук, картка, блокування. Правила:
 *  - себе й owner'а заблокувати не можна;
 *  - користувача з ролями блокує лише той, хто має всі його права, і лише після step-up.
 */
@Injectable()
export class UserAdminService {
  constructor(
    @Inject(UserAdminRepository) private readonly repository: UserAdminRepository,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
    @Inject(HashingService) private readonly hashing: HashingService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventBus) private readonly events: DomainEventBus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: AdminUserQuery): Promise<ListResponse<AdminUserDto>> {
    const rows = await this.repository.list(
      {
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.role === undefined ? {} : { roleKey: query.role }),
        ...(query.q === undefined ? {} : { displayNamePrefix: query.q }),
        ...(query.email === undefined
          ? {}
          : { emailBlindIndex: this.hashing.blindIndex(query.email) }),
      },
      pageArgs(query),
    );
    return toPage(rows, query.limit, toListDto);
  }

  async detail(actor: ActorContext, userId: string): Promise<AdminUserDetailDto> {
    const user = await this.repository.findById(userId);
    if (user === null) throw notFound();
    const canReadPii = covers(actor.access, ['users:read_pii']);
    if (canReadPii) {
      await this.audit.record({
        actorId: actor.access.userId,
        action: ADMIN_AUDIT.USER_VIEW_PII,
        target: { type: 'user', id: userId },
        metadata: { fields: ['email'] },
        ip: actor.ip,
      });
    }
    return {
      id: user.id,
      displayName: user.displayName,
      status: statusOf(user.status),
      roles: user.roles.map(({ role }) => role.key).sort(),
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      blockedAt: user.blockedAt?.toISOString() ?? null,
      email: canReadPii
        ? this.encryption.decrypt(user.emailEncrypted, this.users.emailAad(user.id))
        : null,
      blockReason: user.blockReason,
      mfaEnabled: await this.repository.hasMfa(user.id),
    };
  }

  async block(actor: ActorContext, userId: string, reason: string): Promise<void> {
    await this.assertCanModerate(actor, userId);
    const now = this.clock.now();
    const changed = await this.repository.block(
      userId,
      { actorId: actor.access.userId, reason, now },
      (tx) =>
        this.audit.record(
          {
            actorId: actor.access.userId,
            action: ADMIN_AUDIT.USER_BLOCK,
            target: { type: 'user', id: userId },
            // Причину пише адмін; маскування PII спрацює і тут.
            metadata: { reason },
            ip: actor.ip,
          },
          tx,
        ),
    );
    if (changed)
      await this.events.publish('user.blocked', { userId, actorId: actor.access.userId });
  }

  async unblock(actor: ActorContext, userId: string): Promise<void> {
    await this.assertCanModerate(actor, userId);
    const changed = await this.repository.unblock(userId, (tx) =>
      this.audit.record(
        {
          actorId: actor.access.userId,
          action: ADMIN_AUDIT.USER_UNBLOCK,
          target: { type: 'user', id: userId },
          ip: actor.ip,
        },
        tx,
      ),
    );
    if (changed) {
      await this.events.publish('user.unblocked', { userId, actorId: actor.access.userId });
    }
  }

  private async assertCanModerate(actor: ActorContext, userId: string): Promise<void> {
    const user = await this.repository.findById(userId);
    if (user === null) throw notFound();
    if (actor.access.userId === userId) {
      throw new AppException(403, ERROR_CODES.IAM_SELF_MODIFICATION, 'You cannot block yourself');
    }
    const target = await this.iam.getAccess(userId);
    if (target.isOwner) {
      throw new AppException(403, ERROR_CODES.IAM_SYSTEM_ROLE, 'The owner cannot be blocked');
    }
    if (target.roleKeys.length === 0) return;

    // Член команди адмінки: потрібні всі його права і свіже повторне підтвердження.
    if (!covers(actor.access, target.permissions)) {
      throw new AppException(403, ERROR_CODES.IAM_ESCALATION, 'Target has permissions you lack');
    }
    const state = await this.mfa.sessionState(actor.access.userId, actor.sessionId);
    if (!isFreshStepUp(state.stepUpAt, this.clock.now())) {
      throw new AppException(403, ERROR_CODES.REAUTH_REQUIRED, 'Confirm this action again');
    }
  }
}
