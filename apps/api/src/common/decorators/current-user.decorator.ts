import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { RequestUser } from '../types/request-user';

/**
 * Injects the authenticated user resolved by `JwtAuthGuard`.
 *
 * This is the only source of `organizationId` in the whole application: a
 * client-supplied organization id is never trusted.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new Error('CurrentUser used on a route that is not behind JwtAuthGuard');
    }
    return request.user;
  },
);
