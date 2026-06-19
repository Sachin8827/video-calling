export interface RefreshTokenRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  familyId: string;
  isUsed: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateRefreshTokenDto {
  sessionId: string;
  tokenHash: string;
  familyId: string;
}

export interface RotateRefreshTokenResult {
  newRawToken: string;
  sessionId: string;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('IRefreshTokenRepository');

export interface IRefreshTokenRepository {
  create(dto: CreateRefreshTokenDto): Promise<RefreshTokenRecord>;

  /**
   * Atomically marks the old token as used and inserts a new one.
   * If the token is already used (reuse detected), revokes the entire
   * family and the parent session before throwing.
   */
  rotate(rawToken: string): Promise<RotateRefreshTokenResult>;
}
