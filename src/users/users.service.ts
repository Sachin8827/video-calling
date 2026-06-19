import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PgErrorCode, LogEvent } from '../auth/constants/auth.enums';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  USER_REPOSITORY,
  IUserRepository,
  UserRecord,
} from './repositories/user.repository.interface';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.userRepo.findByEmail(email);
  }

  async findByIdOrThrow(id: string): Promise<UserRecord> {
    const user = await this.userRepo.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async create(email: string, passwordHash: string): Promise<UserRecord> {
    try {
      const user = await this.userRepo.create({ email, passwordHash });
      this.logger.event(LogEvent.REGISTER_SUCCESS, { userId: user.id });
      return user;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === PgErrorCode.UNIQUE_VIOLATION) {
        this.logger.warn(LogEvent.REGISTER_DUPLICATE, { email });
        throw new ConflictException('duplicate');
      }
      throw err;
    }
  }

  async incrementFailedAttempts(userId: string, ip: string): Promise<number> {
    const count = await this.userRepo.incrementFailedAttempts(userId);
    this.logger.warn(LogEvent.FAILED_ATTEMPT_INC, { userId, ip, count });
    if (count >= 5) {
      this.logger.warn(LogEvent.ACCOUNT_LOCKED, { userId, ip, count });
    }
    return count;
  }

  async resetFailedAttempts(userId: string): Promise<void> {
    await this.userRepo.resetFailedAttempts(userId);
    this.logger.event(LogEvent.ACCOUNT_LOCK_CLEARED, { userId });
  }

  isLocked(user: UserRecord): boolean {
    return user.lockedUntil !== null && user.lockedUntil > new Date();
  }
}
