import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthErrorMessage } from '../../auth/constants/auth.enums';

interface ErrorResponse {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const isServerError = status >= 500;

    if (isServerError) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} → ${status}`);
    }

    // 5xx: never expose internals — use enum constant
    const clientMessage = isServerError
      ? AuthErrorMessage.UNEXPECTED_ERROR
      : this.extractMessage(exception);

    const body: ErrorResponse = {
      statusCode: status,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private extractMessage(exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      return AuthErrorMessage.UNEXPECTED_ERROR;
    }
    const res = exception.getResponse();
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res !== null && 'message' in res) {
      const msg = (res as Record<string, unknown>).message;
      return Array.isArray(msg) ? (msg[0] as string) : String(msg);
    }
    return exception.message;
  }
}
