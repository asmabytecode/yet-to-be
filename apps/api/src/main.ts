import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-class-instance-assignment -- літерал опцій Nest
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(AppConfigService);
  configureApp(app, config, { swagger: config.app.nodeEnv === 'development' });
  app.enableShutdownHooks();
  await app.listen(config.app.port, '0.0.0.0');
}

void bootstrap();
