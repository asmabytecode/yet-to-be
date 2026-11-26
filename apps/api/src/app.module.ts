import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';

/** Кореневий модуль. Feature-модулі (auth, users, health) додаються на наступних етапах. */
@Module({
  imports: [AppConfigModule],
})
export class AppModule {}
