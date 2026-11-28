import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type MfaCodeInput,
  mfaCodeInputSchema,
  type MfaEnableResponse,
  type MfaSetupResponse,
  type MfaStatus,
  type MfaVerifyInput,
  mfaVerifySchema,
  type StepUpInput,
  stepUpSchema,
} from '@yet-to-be/shared';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/request-context';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { MfaService } from './mfa.service';

/** Підбір коду: 5 спроб на 15 хвилин (6 цифр × вікно ±1 крок). */
const CODE_LIMIT = { default: { limit: 5, ttl: 15 * 60_000 } };

/** MFA для будь-якого користувача; для ролей з requiresMfa — обов'язкова в адмінці. */
@Controller('auth')
export class MfaController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Get('mfa')
  status(@CurrentUser() user: AuthUser): Promise<MfaStatus> {
    return this.mfa.status(user.id, user.sessionId);
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @Throttle(CODE_LIMIT)
  setup(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<MfaSetupResponse> {
    return this.mfa.setup(user.id, req.ip ?? null);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  @Throttle(CODE_LIMIT)
  enable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mfaCodeInputSchema)) input: MfaCodeInput,
    @Req() req: Request,
  ): Promise<MfaEnableResponse> {
    return this.mfa.enable(user.id, user.sessionId, input.code, req.ip ?? null);
  }

  @Post('mfa/verify')
  @HttpCode(204)
  @Throttle(CODE_LIMIT)
  async verify(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mfaVerifySchema)) input: MfaVerifyInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.mfa.verify(user.id, user.sessionId, input, req.ip ?? null);
  }

  @Post('mfa/disable')
  @HttpCode(204)
  @Throttle(CODE_LIMIT)
  async disable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mfaCodeInputSchema)) input: MfaCodeInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.mfa.disable(user.id, user.sessionId, input.code, req.ip ?? null);
  }

  @Post('step-up')
  @HttpCode(204)
  @Throttle(CODE_LIMIT)
  async stepUp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(stepUpSchema)) input: StepUpInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.mfa.stepUpWithPassword(user.id, user.sessionId, input.password, req.ip ?? null);
  }
}
