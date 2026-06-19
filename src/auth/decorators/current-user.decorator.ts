import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Extracts the authenticated user payload from the request.
 *
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
