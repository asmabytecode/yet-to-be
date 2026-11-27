import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { HashingService } from './hashing.service';
import { PasswordService } from './password.service';

@Module({
  providers: [PasswordService, EncryptionService, HashingService],
  exports: [PasswordService, EncryptionService, HashingService],
})
export class CryptoModule {}
