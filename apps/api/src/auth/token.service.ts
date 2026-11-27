import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { AppConfigService } from '../config/app-config.service';
import { ttlToSeconds } from './ttl';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

/** Короткоживучі access-токени JWT (лише HS256; алгоритм зафіксований при перевірці). */
@Injectable()
export class TokenService {
  private readonly secret: string;
  private readonly ttlSeconds: number;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(@Inject(AppConfigService) config: Pick<AppConfigService, 'auth'>) {
    this.secret = config.auth.jwtAccessSecret;
    this.ttlSeconds = ttlToSeconds(config.auth.jwtAccessTtl);
    this.issuer = config.auth.jwtIssuer;
    this.audience = config.auth.jwtAudience;
  }

  get accessTtlSeconds(): number {
    return this.ttlSeconds;
  }

  signAccess(claims: AccessClaims): string {
    return jwt.sign({ sid: claims.sessionId }, this.secret, {
      algorithm: 'HS256',
      subject: claims.userId,
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.ttlSeconds,
    });
  }

  /** Повертає claims або null для будь-якого невалідного/простроченого токена. */
  verifyAccess(token: string): AccessClaims | null {
    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      });
      if (typeof payload === 'string') return null;
      const sessionId: unknown = payload['sid'];
      if (typeof payload.sub !== 'string' || typeof sessionId !== 'string') return null;
      return { userId: payload.sub, sessionId };
    } catch {
      return null;
    }
  }
}
