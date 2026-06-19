import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Wraps every successful response in a consistent envelope.
 * Null / void responses (e.g. 204 No Content) are passed through unchanged.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | null> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | null> {
    return next.handle().pipe(
      map((data) => {
        if (data === undefined || data === null) return null;
        return { success: true, data };
      }),
    );
  }
}
