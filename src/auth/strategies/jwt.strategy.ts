import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SessionsService } from '../../sessions/sessions.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { JwtAlgorithm, LogEvent, AuthErrorMessage } from '../constants/auth.enums';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly sessionsService: SessionsService,
    private readonly logger: AppLogger,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: [JwtAlgorithm.HS256],
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
    this.logger.setContext(JwtStrategy.name);
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const session = await this.sessionsService.findActiveSession(payload.sid);
    if (!session) {
      this.logger.warn(LogEvent.SESSION_INVALID, { sessionId: payload.sid, userId: payload.sub });
      throw new UnauthorizedException(AuthErrorMessage.SESSION_INVALID);
    }
    return payload;
  }
}
