import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ApiErrorCode, type AuthTokens } from '@cheque-flow/shared-types';

import { AppConfigService } from '../../config/app-config.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';

export interface IssueTokensInput {
  userId: string;
  organizationId: string;
  branchId: string | null;
  email: string;
  name: string;
  /** Existing rotation family, or a new one for a fresh login. */
  familyId?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Issues access tokens and rotating refresh tokens.
 *
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored.
 * Every refresh rotates the token, and re-using a consumed token revokes the
 * whole family — the standard defence against stolen refresh tokens.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issue(input: IssueTokensInput): Promise<AuthTokens> {
    const { accessSecret, accessTtl, refreshTtl, issuer, audience } = this.config.jwt;
    const familyId = input.familyId ?? randomUUID();

    const payload: AccessTokenPayload = {
      sub: input.userId,
      org: input.organizationId,
      branch: input.branchId,
      email: input.email,
      name: input.name,
      sid: familyId,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: accessSecret,
      expiresIn: accessTtl,
      issuer,
      audience,
    });

    // Opaque refresh token: no claims, nothing to leak if it is logged.
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.db.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: TokenService.hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl, tokenType: 'Bearer' };
  }

  /**
   * Validates a refresh token and rotates it.
   *
   * Presenting an already-rotated or revoked token is treated as theft: the
   * entire family is revoked and the caller must log in again.
   */
  async rotate(
    refreshToken: string,
    meta: { userAgent?: string | null; ipAddress?: string | null },
  ): Promise<{ tokens: AuthTokens; userId: string; organizationId: string }> {
    const tokenHash = TokenService.hashToken(refreshToken);
    const stored = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            organizationId: true,
            branchId: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!stored) {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Unknown refresh token');
    }

    if (stored.revokedAt !== null) {
      this.logger.warn(
        `Refresh token re-use detected for user ${stored.userId}; revoking family ${stored.familyId}`,
      );
      await this.revokeFamily(stored.familyId);
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Refresh token re-use detected');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'Refresh token expired');
    }

    if (stored.user.status !== 'ACTIVE') {
      await this.revokeFamily(stored.familyId);
      throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'User is not active');
    }

    const tokens = await this.issue({
      userId: stored.user.id,
      organizationId: stored.user.organizationId,
      branchId: stored.user.branchId,
      email: stored.user.email,
      name: stored.user.name,
      familyId: stored.familyId,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    });

    await this.prisma.db.refreshToken.update({
      where: { tokenHash },
      data: {
        revokedAt: new Date(),
        replacedByHash: TokenService.hashToken(tokens.refreshToken),
      },
    });

    return { tokens, userId: stored.user.id, organizationId: stored.user.organizationId };
  }

  async revokeToken(refreshToken: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { tokenHash: TokenService.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
