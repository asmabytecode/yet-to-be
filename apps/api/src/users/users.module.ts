import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CryptoModule } from '../infra/crypto/crypto.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule, CryptoModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
