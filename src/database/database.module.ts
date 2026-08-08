import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { LogEvent } from '../auth/constants/auth.enums';

export const DATABASE_POOL = 'DATABASE_POOL';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const pool = new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          ssl: isProd ? { rejectUnauthorized: false } : undefined,
          min: config.get<number>('DATABASE_POOL_MIN', 2),
          max: config.get<number>('DATABASE_POOL_MAX', 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });

        pool.on('error', (err) => {
          // Structured log — pick up by SIEM
          console.error(
            JSON.stringify({
              level: 'ERROR',
              event: LogEvent.DB_POOL_ERROR,
              timestamp: new Date().toISOString(),
              message: err.message,
            }),
          );
        });

        return pool;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
