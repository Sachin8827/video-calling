export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  mfaEnabled: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  passwordHash: string;
}

export const USER_REPOSITORY = Symbol('IUserRepository');

export interface IUserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(dto: CreateUserDto): Promise<UserRecord>;
  incrementFailedAttempts(userId: string): Promise<number>;
  resetFailedAttempts(userId: string): Promise<void>;
}
