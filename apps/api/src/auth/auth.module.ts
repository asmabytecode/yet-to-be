import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../infra/crypto/crypto.module';
import { IamModule } from '../modules/iam';
import { UsersModule } from '../users/users.module';
import { AuthCookies } from './auth-cookies';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthProvider } from './oauth/google-oauth.provider';
import { MOCK_CONSENT_PATH, MockOAuthProvider } from './oauth/mock-oauth.provider';
import { OAUTH_PROVIDER, type OAuthProvider } from './oauth/oauth-provider';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { TokenService } from './token.service';

/** Guards (Throttler → CSRF → JWT) підключаються глобально в AppModule, щоб зафіксувати порядок. */
@Module({
  imports: [DatabaseModule, CryptoModule, UsersModule, IamModule],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    AuthCookies,
    TokenService,
    OAuthService,
    GoogleOAuthProvider,
    {
      // OAUTH_MOCK=true (лише test/development) підміняє Google локальним mock для E2E.
      provide: OAUTH_PROVIDER,
      inject: [AppConfigService, GoogleOAuthProvider],
      useFactory: (config: AppConfigService, google: GoogleOAuthProvider): OAuthProvider =>
        config.google.mock
          ? new MockOAuthProvider(
              new URL(
                `/${config.app.apiPrefix}/v1/${MOCK_CONSENT_PATH}`,
                config.app.appUrl,
              ).toString(),
            )
          : google,
    },
  ],
  exports: [AuthCookies, TokenService],
})
export class AuthModule {}
