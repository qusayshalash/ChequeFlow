import type { Permission } from '@cheque-flow/shared-types';

/** The authenticated principal attached to every guarded request. */
export interface RequestUser {
  id: string;
  organizationId: string;
  branchId: string | null;
  email: string;
  name: string;
  roles: string[];
  permissions: Permission[];
  /**
   * The organization's time zone, e.g. `Asia/Hebron` — what "today" means for
   * this user's books. Resolved with the session so that no query has to ask
   * for it, and never trusted from the client.
   */
  timeZone: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `JwtAuthGuard` on every non-public route. */
      user?: RequestUser;
      /** Set by `RequestIdMiddleware` on every request. */
      requestId?: string;
    }
  }
}
