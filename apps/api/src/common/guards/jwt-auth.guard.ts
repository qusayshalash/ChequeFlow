import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { ApiErrorCode } from '@cheque-flow/shared-types';

import { AppConfigService } from '../../config/app-config.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppError } from '../errors/app-error';
import { SessionService } from '../../modules/auth/session.service';

/** Claims carried by an access token. */
export interface AccessTokenPayload {
  sub: string;
  org: string;
  branch: string | null;
  email: string;
  name: string;
  /** Session id, so a revoked session invalidates its access tokens too. */
  sid: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Missing bearer token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
      });
    } catch {
      // Never echo the token or the underlying JWT error to the client.
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Invalid or expired access token');
    }

    // Permissions are resolved per request so that a role change takes effect
    // immediately instead of waiting for the access token to expire.
    const user = await this.sessions.resolveRequestUser(payload);
    request.user = user;
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.header('authorization');
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
