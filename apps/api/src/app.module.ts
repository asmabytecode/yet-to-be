import { Module } from '@nestjs/common';

/** Кореневий модуль. Feature-модулі (auth, users, health) додаються на наступних етапах. */
@Module({})
export class AppModule {}
