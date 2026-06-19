export interface AuthTokens {
  /** Short-lived JWT. Store in memory — never in localStorage. */
  accessToken: string;
  /** Raw refresh token. Sent via HttpOnly cookie by the controller. */
  refreshToken: string;
  /** Raw CSRF token. Sent via non-HttpOnly cookie for JS to read. */
  csrfToken: string;
  /** Access token expiry in seconds from now */
  expiresIn: number;
}
