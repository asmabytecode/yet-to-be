import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../infra/crypto/crypto.module';
import { UsersModule } from '../users/users.module';
import { AuthCookies } from './auth-cookies';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/** Guards (Throttler → CSRF → JWT) підключаються глобально в AppModule, щоб зафіксувати порядок. */
@Module({
  imports: [DatabaseModule, CryptoModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AuthCookies, TokenService],
  exports: [AuthCookies, TokenService],
})
export class AuthModule {}
