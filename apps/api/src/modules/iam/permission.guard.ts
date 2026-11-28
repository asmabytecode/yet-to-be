import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type Permission } from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import type { AppRequest } from '../../common/request-context';
import { ADMIN_ROUTE_KEY } from '../../platform/admin-controller';
import { CLOCK, type Clock } from '../../platform/clock';
import { PERMISSIONS_KEY, STEP_UP_KEY } from '../../platform/require-permission';
import { ADMIN_AUDIT, AuditService } from '../audit';
import { hasPermissions } from './iam.policy';
import { IamService } from './iam.service';
import { isFreshStepUp, MfaService } from './mfa.service';

const forbidden = () => new AppException(403, ERROR_CODES.FORBIDDEN, 'Forbidden');

/**
 * Глобальний guard після JwtAuthGuard:
 *   1) права з БД (deny-by-default для адмін-контролерів);
 *   2) MFA, якщо хоч одна роль користувача її вимагає;
 *   3) свіжий step-up для маршрутів з @RequireStepUp.
 * Маршрути без @RequirePermission (поза адмінкою) пропускає без змін.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const isAdminRoute =
      this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_ROUTE_KEY, targets) === true;

    if (required === undefined) {
      if (isAdminRoute) throw forbidden();
      return true;
    }

    const req = context.switchToHttp().getRequest<AppRequest>();
    const user = req.user;
    // @Public() разом із @RequirePermission — помилка конфігурації: закриваємо.
    if (user === undefined) throw forbidden();

    const access = await this.iam.getAccess(user.id);
    req.access = access;
    if (!hasPermissions(access, required)) {
      await this.audit.record({
        actorId: user.id,
        action: ADMIN_AUDIT.ACCESS_DENIED,
        metadata: { required, method: req.method, path: req.path.slice(0, 200) },
        ip: req.ip ?? null,
      });
      throw forbidden();
    }

    const needsStepUp =
      this.reflector.getAllAndOverride<boolean | undefined>(STEP_UP_KEY, targets) === true;
    if (!access.requiresMfa && !needsStepUp) return true;

    const state = await this.mfa.sessionState(user.id, user.sessionId);
    if (access.requiresMfa) {
      if (!state.enabled) {
        throw new AppException(403, ERROR_CODES.MFA_SETUP_REQUIRED, 'Set up MFA to continue');
      }
      if (state.mfaVerifiedAt === null) {
        throw new AppException(403, ERROR_CODES.MFA_REQUIRED, 'Confirm with your MFA code');
      }
    }
    if (needsStepUp && !isFreshStepUp(state.stepUpAt, this.clock.now())) {
      throw new AppException(403, ERROR_CODES.REAUTH_REQUIRED, 'Confirm this action again');
    }
    return true;
  }
}
