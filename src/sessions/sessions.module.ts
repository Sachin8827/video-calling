import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionRepository } from './repositories/session.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { CsrfTokenRepository } from './repositories/csrf-token.repository';
import { SESSION_REPOSITORY } from './repositories/session.repository.interface';
import { REFRESH_TOKEN_REPOSITORY } from './repositories/refresh-token.repository.interface';
import { CSRF_TOKEN_REPOSITORY } from './repositories/csrf-token.repository.interface';

@Module({
  providers: [
    SessionsService,
    { provide: SESSION_REPOSITORY, useClass: SessionRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: RefreshTokenRepository },
    { provide: CSRF_TOKEN_REPOSITORY, useClass: CsrfTokenRepository },
  ],
  exports: [
    SessionsService,
    // Export repository tokens so guards can inject them directly
    { provide: CSRF_TOKEN_REPOSITORY, useClass: CsrfTokenRepository },
  ],
})
export class SessionsModule {}
