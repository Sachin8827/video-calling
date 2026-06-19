export interface CsrfTokenRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
}

export const CSRF_TOKEN_REPOSITORY = Symbol('ICsrfTokenRepository');

export interface ICsrfTokenRepository {
  /**
   * Creates or replaces the CSRF token for the given session.
   * Returns the raw (unhashed) token — caller sends it to the client.
   */
  upsert(sessionId: string): Promise<string>;

  /**
   * Validates that the hash of the incoming raw token matches the stored
   * hash for the session and that the token has not expired.
   */
  isValid(sessionId: string, rawToken: string): Promise<boolean>;
}
