import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Shared Redis client factory used by matchmaking and (optionally) the
 * Socket.IO Redis adapter for horizontal scaling.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });
    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.client.quit().then(() => undefined);
  }

  getClient(): Redis {
    return this.client;
  }

  /** Create a duplicate connection (required for pub/sub). */
  duplicate(): Redis {
    return this.client.duplicate();
  }
}
