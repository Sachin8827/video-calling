import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger.service';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { LogEvent, NodeEnv, HttpHeader } from './auth/constants/auth.enums';

async function bootstrap(): Promise<void> {
  const isProd = process.env.NODE_ENV === NodeEnv.PRODUCTION;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isProd ? ['warn', 'error'] : ['log', 'warn', 'error', 'debug'],
    bufferLogs: true,
  });

  // Use our structured logger as the NestJS application logger
  const logger = await app.resolve(AppLogger);
  app.useLogger(logger);

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: {
        maxAge: 63_072_000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', HttpHeader.CSRF_TOKEN],
  });

  app.useGlobalPipes(globalValidationPipe);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.setGlobalPrefix('api/v1');

  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('Nexus Comms API')
      .setDescription('Scalable Real-Time Video & Voice Calling platform API spec.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Cache-Control: no-store on all auth endpoint responses
  app.use(
    '/api/v1/auth',
    (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
      res.setHeader(
        HttpHeader.CACHE_CONTROL,
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      res.setHeader(HttpHeader.PRAGMA, 'no-cache');
      res.setHeader(HttpHeader.EXPIRES, '0');
      next();
    },
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.event(LogEvent.STARTUP, {
    port: Number(port),
    env: process.env.NODE_ENV ?? NodeEnv.DEVELOPMENT,
    prefix: '/api/v1',
  });
}

bootstrap().catch((err: unknown) => {
  console.error(
    JSON.stringify({
      level: 'ERROR',
      event: LogEvent.STARTUP,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
