import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Порт тимчасово хардкодом; з Етапу 2 береться з AppConfigService.
  await app.listen(3000, '0.0.0.0');
}

void bootstrap();
