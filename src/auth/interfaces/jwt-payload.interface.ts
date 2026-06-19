export interface JwtPayload {
  /** Subject — user UUID */
  sub: string;
  /** Session UUID — used for server-side validation */
  sid: string;
  /** Issued at (epoch seconds) */
  iat: number;
  /** Expiry (epoch seconds) */
  exp: number;
}
