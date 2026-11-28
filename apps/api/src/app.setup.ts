import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { bodyParserErrorHandler } from './common/body-parser-error';
import { requestIdMiddleware } from './common/request-id';
import { requestScopeMiddleware } from './platform/request-scope';
import type { AppConfigService } from './config/app-config.service';

export const BODY_LIMIT = '100kb';

export interface SetupOptions {
  /** Swagger UI: лише для локальної розробки. */
  swagger: boolean;
}

/** Відповіді API не кешуються ні браузером, ні проміжними проксі. */
function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

/**
 * Спільне налаштування для main.ts і тестів. Застосунок має бути створений з
 * `bodyParser: false` — розбір JSON підключається тут із жорстким лімітом.
 */
export function configureApp(
  app: NestExpressApplication,
  config: AppConfigService,
  options: SetupOptions = { swagger: false },
): void {
  const { app: appConfig, isProd } = config;

  app.disable('x-powered-by');
  app.set('trust proxy', appConfig.trustProxy ? 1 : false);
  app.useLogger(app.get(Logger));

  app.use(requestIdMiddleware);
  app.use(requestScopeMiddleware);
  app.use(
    helmet({
      // API віддає лише JSON: усе заборонено, окрім самого API.
      contentSecurityPolicy: options.swagger
        ? false
        : {
            directives: {
              defaultSrc: ["'none'"],
              baseUri: ["'none'"],
              formAction: ["'none'"],
              frameAncestors: ["'none'"],
            },
          },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(noStore);
  app.use(json({ limit: BODY_LIMIT }));
  app.use(bodyParserErrorHandler);
  // Підписані cookies (потік OAuth) перевіряються через COOKIE_SECRET.
  app.use(cookieParser(config.auth.cookieSecret));

  // CORS навмисно не вмикається: фронтенд ходить на API через той самий origin (проксі).
  app.setGlobalPrefix(`${appConfig.apiPrefix}/v1`);

  if (options.swagger) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('YET TO BE API').setVersion('1').build(),
    );
    SwaggerModule.setup(`${appConfig.apiPrefix}/docs`, app, document);
  }
}
