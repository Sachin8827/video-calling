import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CSRF_TOKEN_REPOSITORY } from '../sessions/repositories/csrf-token.repository.interface';
import { CsrfTokenRepository } from '../sessions/repositories/csrf-token.repository';
import { JwtAlgorithm } from './constants/auth.enums';

@Module({
  imports: [
    UsersModule,
    SessionsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRY', '15m'),
          algorithm: JwtAlgorithm.HS256,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    CsrfGuard,
    // CsrfGuard needs direct access to the repo — provide it here too
    { provide: CSRF_TOKEN_REPOSITORY, useClass: CsrfTokenRepository },
  ],
  exports: [AuthService, JwtAuthGuard, CsrfGuard],
})
export class AuthModule {}
