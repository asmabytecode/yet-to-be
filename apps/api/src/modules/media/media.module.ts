import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit';
import { AdminMediaController } from './admin-media.controller';
import {
  ClamAvScanner,
  FakeMalwareScanner,
  MALWARE_SCANNER,
  type MalwareScanner,
} from './malware-scanner';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { InMemoryObjectStorage, OBJECT_STORAGE, type ObjectStorage } from './object-storage';
import { S3ObjectStorage } from './s3-object-storage';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AdminMediaController],
  providers: [
    MediaRepository,
    MediaService,
    {
      provide: OBJECT_STORAGE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): ObjectStorage =>
        config.media.storageDriver === 's3'
          ? new S3ObjectStorage(config.media.s3)
          : new InMemoryObjectStorage(),
    },
    {
      provide: MALWARE_SCANNER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): MalwareScanner =>
        config.media.scanner === 'clamav'
          ? new ClamAvScanner(config.media.clamav)
          : new FakeMalwareScanner(),
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
