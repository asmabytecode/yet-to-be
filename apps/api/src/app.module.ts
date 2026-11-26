import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';

/** Кореневий модуль. Feature-модулі (auth, users, health) додаються на наступних етапах. */
@Module({
  imports: [AppConfigModule, DatabaseModule],
})
export class AppModule {}
