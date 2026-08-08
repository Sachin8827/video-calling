import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './common/logger/logger.module';
import * as Joi from 'joi';
import { authConfig } from './config/auth.config';
import { AuditModule } from './audit/audit.module';
import { RedisModule } from './redis/redis.module';
import { CallsModule } from './calls/calls.module';
import { ContactsModule } from './contacts/contacts.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { SfuModule } from './sfu/sfu.module';
import { GatewayModule } from './gateway/gateway.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig],
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
        ALLOWED_ORIGIN: Joi.string().default('*'),
        TURN_SERVER_URL: Joi.string().optional(),
        TURN_USERNAME: Joi.string().optional(),
        TURN_CREDENTIAL: Joi.string().optional(),
        MEDIASOUP_LISTEN_IP: Joi.string().default('0.0.0.0'),
        MEDIASOUP_ANNOUNCED_IP: Joi.string().optional(),
        MEDIASOUP_MIN_PORT: Joi.number().default(40000),
        MEDIASOUP_MAX_PORT: Joi.number().default(49999),
        AUDIT_RETENTION_DAYS: Joi.number().default(90),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 900_000, // 15 min in ms — global default
        limit: 100,
      },
    ]),
    // Core infrastructure
    LoggerModule,
    DatabaseModule,
    RedisModule, // @Global — Redis client available everywhere
    AuditModule, // @Global — AuditService available everywhere

    // Feature modules
    AuthModule,
    CallsModule,
    ContactsModule,
    MatchmakingModule,
    SfuModule,
    GatewayModule, // WebSocket signaling (registers SignalingGateway)
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
