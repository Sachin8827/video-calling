import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  AuthErrorMessage,
  HttpHeader,
  MetadataKey,
  UnsafeHttpMethod,
  LogEvent,
} from '../constants/auth.enums';
import { AppLogger } from '../../common/logger/app-logger.service';
import {
  CSRF_TOKEN_REPOSITORY,
  ICsrfTokenRepository,
} from '../../sessions/repositories/csrf-token.repository.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CSRF_TOKEN_REPOSITORY) private readonly csrfRepo: ICsrfTokenRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(CsrfGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(MetadataKey.IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();

    const method = request.method.toUpperCase();
    if (!Object.values(UnsafeHttpMethod).includes(method as UnsafeHttpMethod)) {
      return true;
    }

    const incoming = request.headers[HttpHeader.CSRF_TOKEN];
    if (!incoming || typeof incoming !== 'string') {
      this.logger.warn(LogEvent.CSRF_MISSING, { sessionId: request.user?.sid });
      throw new ForbiddenException(AuthErrorMessage.CSRF_MISSING);
    }

    const sessionId = request.user?.sid;
    if (!sessionId) {
      throw new ForbiddenException(AuthErrorMessage.NO_ACTIVE_SESSION);
    }

    const valid = await this.csrfRepo.isValid(sessionId, incoming);
    if (!valid) {
      this.logger.warn(LogEvent.CSRF_INVALID, { sessionId });
      throw new ForbiddenException(AuthErrorMessage.CSRF_INVALID);
    }

    return true;
  }
}
