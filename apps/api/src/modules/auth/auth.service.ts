import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

import { ApiErrorCode, type AuthTokens } from '@cheque-flow/shared-types';
import type { LoginInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { TokenService } from './token.service';

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Argon2id parameters. Deliberately explicit rather than relying on library
 * defaults, so a dependency bump cannot silently weaken password hashing.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP minimum recommendation
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthTokens> {
    const user = await this.prisma.db.user.findFirst({
      where: { email: input.email },
      select: {
        id: true,
        organizationId: true,
        branchId: true,
        email: true,
        name: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user) {
      // Verify against a dummy hash so a missing account and a wrong password
      // take the same time — no user enumeration through response timing.
      await argon2.verify(await AuthService.dummyHash(), input.password).catch(() => false);
      throw new AppError(ApiErrorCode.INVALID_CREDENTIALS, 'No user with that email');
    }

    const passwordMatches = await argon2
      .verify(user.passwordHash, input.password)
      .catch(() => false);

    if (!passwordMatches || user.status !== 'ACTIVE') {
      await this.audit.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        after: { reason: passwordMatches ? `status:${user.status}` : 'invalid_password' },
        ipAddress: meta.ipAddress,
        deviceInfo: meta.userAgent,
      });
      throw new AppError(ApiErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');
    }

    const tokens = await this.tokens.issue({
      userId: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      email: user.email,
      name: user.name,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      entityType: 'user',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      deviceInfo: meta.userAgent,
    });

    return tokens;
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const { tokens, userId, organizationId } = await this.tokens.rotate(refreshToken, {
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.audit.record({
      organizationId,
      userId,
      action: AuditAction.TOKEN_REFRESH,
      entityType: 'session',
      entityId: userId,
      ipAddress: meta.ipAddress,
      deviceInfo: meta.userAgent,
    });

    return tokens;
  }

  async logout(
    user: RequestUser,
    options: { refreshToken?: string; allDevices: boolean },
    meta: RequestMeta,
  ): Promise<void> {
    if (options.allDevices) {
      await this.tokens.revokeAllForUser(user.id);
    } else if (options.refreshToken) {
      await this.tokens.revokeToken(options.refreshToken);
    }

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.LOGOUT,
      entityType: 'session',
      entityId: user.id,
      after: { allDevices: options.allDevices },
      ipAddress: meta.ipAddress,
      deviceInfo: meta.userAgent,
    });
  }

  /** Returns the caller's profile with their live permission set. */
  me(user: RequestUser): RequestUser {
    return user;
  }

  private static dummyHashCache: string | null = null;

  private static async dummyHash(): Promise<string> {
    AuthService.dummyHashCache ??= await argon2.hash(
      'invalid-password-placeholder',
      ARGON2_OPTIONS,
    );
    return AuthService.dummyHashCache;
  }
}
