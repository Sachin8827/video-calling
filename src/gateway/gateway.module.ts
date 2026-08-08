import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SignalingGateway } from './signaling.gateway';
import { CallsModule } from '../calls/calls.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { ContactsModule } from '../contacts/contacts.module';
import { SfuModule } from '../sfu/sfu.module';
import { JwtAlgorithm } from '../auth/constants/auth.enums';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    CallsModule,
    MatchmakingModule,
    ContactsModule,
    SfuModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: JwtAlgorithm.HS256 },
      }),
    }),
  ],
  providers: [SignalingGateway],
})
export class GatewayModule {}
