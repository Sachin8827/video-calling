export interface SessionRecord {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  isRevoked: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateSessionDto {
  userId: string;
  ipAddress: string;
  userAgent: string;
}

export const SESSION_REPOSITORY = Symbol('ISessionRepository');

export interface ISessionRepository {
  create(dto: CreateSessionDto): Promise<SessionRecord>;
  findActiveById(sessionId: string): Promise<SessionRecord | null>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
