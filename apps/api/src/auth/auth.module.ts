import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../infra/crypto/crypto.module';
import { UsersModule } from '../users/users.module';
import { AuthCookies } from './auth-cookies';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthProvider } from './oauth/google-oauth.provider';
import { OAUTH_PROVIDER } from './oauth/oauth-provider';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { TokenService } from './token.service';

/** Guards (Throttler → CSRF → JWT) підключаються глобально в AppModule, щоб зафіксувати порядок. */
@Module({
  imports: [DatabaseModule, CryptoModule, UsersModule],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    AuthCookies,
    TokenService,
    OAuthService,
    { provide: OAUTH_PROVIDER, useClass: GoogleOAuthProvider },
  ],
  exports: [AuthCookies, TokenService],
})
export class AuthModule {}
