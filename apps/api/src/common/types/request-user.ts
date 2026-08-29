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
