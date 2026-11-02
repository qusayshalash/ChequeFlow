import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

import { ApiErrorCode, type AuthTokens } from '@cheque-flow/shared-types';
import type { ChangePasswordInput, LoginInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { AppConfigService } from '../../config/app-config.service';
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
    private readonly config: AppConfigService,
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
        failedLoginCount: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      // Verify against a dummy hash so a missing account and a wrong password
      // take the same time — no user enumeration through response timing.
      await argon2.verify(await AuthService.dummyHash(), input.password).catch(() => false);
      throw new AppError(ApiErrorCode.INVALID_CREDENTIALS, 'No user with that email');
    }

    // While the account is locked the password is not checked at all. Checking
    // it would let someone guessing during the lock tell a right guess from a
    // wrong one by the answer, which is the one thing the lock must not do.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.audit.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        after: { reason: 'locked' },
        ipAddress: meta.ipAddress,
        deviceInfo: meta.userAgent,
      });
      throw AuthService.locked(user.lockedUntil);
    }

    const passwordMatches = await argon2
      .verify(user.passwordHash, input.password)
      .catch(() => false);

    if (!passwordMatches) {
      await this.countFailure(user.id, user.organizationId, meta);
    }

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
      // A success ends the run of failures: the next lock needs a fresh run.
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
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

  /**
   * Changing your own password.
   *
   * There was no way to do this at all. An administrator could reset someone
   * else's password through the API, though no screen offered it; nobody could
   * change their own. So an accountant kept whatever password they were handed
   * for as long as they had the job, and the owner's account stayed on the one
   * the seed script set — which that script itself says must never be deployed.
   *
   * Every other session is ended. A password changes because it may be known
   * to someone else, and a session that person already holds would otherwise
   * outlive the change. This one is ended too and replaced, so the person who
   * just proved they know both passwords stays signed in where they are.
   */
  async changePassword(
    user: RequestUser,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const stored = await this.prisma.db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!stored) throw new AppError(ApiErrorCode.UNAUTHENTICATED, 'User no longer exists');

    const matches = await argon2
      .verify(stored.passwordHash, input.currentPassword)
      .catch(() => false);

    if (!matches) {
      // Recorded, because repeated failures here mean someone is guessing at
      // an account they already have a session for.
      await this.audit.record({
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.PASSWORD_CHANGE_FAILED,
        entityType: 'user',
        entityId: user.id,
        ipAddress: meta.ipAddress,
        deviceInfo: meta.userAgent,
      });
      // A field error rather than INVALID_CREDENTIALS: the screen puts it
      // under the field that is wrong instead of signing the person out.
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'Current password is incorrect', {
        fieldErrors: [{ path: 'currentPassword', message: 'validation.password.currentIncorrect' }],
      });
    }

    const passwordHash = await AuthService.hashPassword(input.newPassword);
    await this.prisma.db.$transaction([
      this.prisma.db.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.db.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: user.id,
      // Never the password, old or new — only that it happened.
      after: { otherSessionsEnded: true },
      ipAddress: meta.ipAddress,
      deviceInfo: meta.userAgent,
    });

    return this.tokens.issue({
      userId: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      email: user.email,
      name: user.name,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  /**
   * Counts a wrong password, and locks the account when the run gets too long.
   *
   * The per-minute limit on sign-in is per IP address, so someone guessing at
   * one account from several addresses had no limit at all — and every failure
   * was written to the audit trail and acted on by nothing. The count is
   * incremented in the database, not read and written back, so two guesses
   * arriving together cannot both be counted as the first.
   */
  private async countFailure(userId: string, organizationId: string, meta: RequestMeta) {
    const { threshold, minutes } = this.config.loginLock;
    const counted = await this.prisma.db.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (counted.failedLoginCount < threshold) return;

    const lockedUntil = new Date(Date.now() + minutes * 60_000);
    // The count restarts with the lock, so an expired lock gives a fresh run
    // rather than re-locking on the very next mistake.
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { lockedUntil, failedLoginCount: 0 },
    });
    await this.audit.record({
      organizationId,
      userId,
      action: AuditAction.ACCOUNT_LOCKED,
      entityType: 'user',
      entityId: userId,
      after: { failures: counted.failedLoginCount, minutes },
      ipAddress: meta.ipAddress,
      deviceInfo: meta.userAgent,
    });
  }

  /**
   * The refusal while locked, naming how long is left.
   *
   * Saying the account is locked does tell a guesser the account exists — but
   * only after they have already found it and failed on it repeatedly, and the
   * alternative is the real owner typing the right password and being told it
   * is wrong for a quarter of an hour.
   */
  private static locked(until: Date): AppError {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    return new AppError(ApiErrorCode.ACCOUNT_LOCKED, 'Account temporarily locked', {
      details: { minutes },
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
