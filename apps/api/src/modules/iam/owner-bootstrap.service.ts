import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import { UsersRepository } from '../../database/repositories/users.repository';
import { HashingService } from '../../infra/crypto/hashing.service';
import { ADMIN_AUDIT, AuditService } from '../audit';
import { OWNER_ROLE_ID } from './iam.constants';
import { RolesRepository } from './roles.repository';

export interface OwnerGrantResult {
  userId: string;
  alreadyOwner: boolean;
}

/**
 * Призначення власника — лише з командного рядка на сервері (`pnpm owner:grant <email>`),
 * ніколи через HTTP. Власник один; змінити його через API неможливо.
 */
@Injectable()
export class OwnerBootstrapService {
  constructor(
    @Inject(RolesRepository) private readonly roles: RolesRepository,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(HashingService) private readonly hashing: HashingService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async grantOwner(email: string): Promise<OwnerGrantResult> {
    const user = await this.users.findByEmailBlindIndex(this.hashing.blindIndex(email));
    if (user === null) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, 'User not found: sign up first');
    }
    const currentOwner = await this.roles.findOwnerUserId();
    if (currentOwner === user.id) return { userId: user.id, alreadyOwner: true };
    if (currentOwner !== null) {
      throw new AppException(
        409,
        ERROR_CODES.IAM_OWNER_EXISTS,
        'Another user is already the owner',
      );
    }

    await this.roles.assign(user.id, OWNER_ROLE_ID, null);
    await this.audit.record({
      actorId: null,
      action: ADMIN_AUDIT.OWNER_GRANT,
      target: { type: 'user', id: user.id },
    });
    return { userId: user.id, alreadyOwner: false };
  }
}
