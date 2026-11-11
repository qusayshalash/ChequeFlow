import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ChequeStatus,
  todayIn,
  type PublicStatementView,
  type StatementLinkView,
} from '@cheque-flow/shared-types';
import { moneyToString } from '@cheque-flow/database';
import type { CreateStatementLinkInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';

/** Cheques a contact is never shown: typed in and unconfirmed, or cancelled. */
const NOT_SHOWN: ChequeStatus[] = [
  ChequeStatus.DRAFT,
  ChequeStatus.PENDING_REVIEW,
  ChequeStatus.CANCELLED,
];

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Links that show one contact its own statement, without an account.
 *
 * The token is 32 random bytes, handed out once and never stored: only its
 * SHA-256 is kept, so a copy of the database hands out no working link. A link
 * ends on its own, can be revoked, and every view is counted.
 *
 * The public read takes the organization from the link, never from the
 * request, and returns a narrow view: the balances, and the contact's own
 * cheques described by their part in the account.
 */
@Injectable()
export class StatementLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: RequestUser,
    contactId: string,
    input: CreateStatementLinkInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<StatementLinkView & { token: string }> {
    // Within this organization, or not at all.
    await this.contacts.findById(user, contactId);

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + input.days * 86_400_000);

    const link = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.statementLink.create({
        data: {
          organizationId: user.organizationId,
          contactId,
          tokenHash: hash(token),
          createdBy: user.id,
          expiresAt,
        },
      });
      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.STATEMENT_LINK_CREATED,
        entityType: 'statement_link',
        entityId: created.id,
        after: { contactId, days: input.days, expiresAt: expiresAt.toISOString() },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });
      return created;
    });

    return { ...StatementLinksService.view(link), token };
  }

  async list(user: RequestUser, contactId: string): Promise<StatementLinkView[]> {
    await this.contacts.findById(user, contactId);
    const links = await this.prisma.db.statementLink.findMany({
      where: { organizationId: user.organizationId, contactId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return links.map((link) => StatementLinksService.view(link));
  }

  async revoke(
    user: RequestUser,
    contactId: string,
    linkId: string,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<StatementLinkView> {
    const link = await this.prisma.db.statementLink.findFirst({
      where: { id: linkId, organizationId: user.organizationId, contactId },
    });
    if (!link) throw AppError.notFound('StatementLink', linkId);
    if (link.revokedAt) return StatementLinksService.view(link);

    const revoked = await this.prisma.db.$transaction(async (tx) => {
      const updated = await tx.statementLink.update({
        where: { id: linkId },
        data: { revokedAt: new Date() },
      });
      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.STATEMENT_LINK_REVOKED,
        entityType: 'statement_link',
        entityId: linkId,
        before: { contactId },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });
      return updated;
    });
    return StatementLinksService.view(revoked);
  }

  /**
   * The statement behind a token, for whoever holds it.
   *
   * Unknown, expired and revoked all answer the same "not found": telling a
   * stranger which of the three it was would tell them a link once existed.
   */
  async read(token: string): Promise<PublicStatementView> {
    const link =
      token.length >= 32 && token.length <= 64
        ? await this.prisma.db.statementLink.findUnique({
            where: { tokenHash: hash(token) },
            include: {
              organization: { select: { name: true, timezone: true } },
              contact: { select: { id: true, name: true } },
            },
          })
        : null;
    const now = new Date();
    // A deleted contact takes its links with it (the foreign key cascades).
    if (!link || link.revokedAt !== null || link.expiresAt <= now) {
      throw AppError.notFound('Statement');
    }

    // The balances come from the contact page's own calculation, so the two
    // cannot disagree. It needs only the organization and its time zone; the
    // reader has no account, so this stands in for one, with no permissions.
    const reader: RequestUser = {
      id: link.createdBy ?? link.id,
      organizationId: link.organizationId,
      branchId: null,
      email: '',
      name: '',
      roles: [],
      permissions: [],
      timeZone: link.organization.timezone,
    };
    // Limit 0: only the per-currency balances are wanted from it.
    const statement = await this.contacts.statement(reader, link.contactId, 0);

    const cheques = await this.prisma.db.cheque.findMany({
      where: {
        organizationId: link.organizationId,
        deletedAt: null,
        status: { notIn: NOT_SHOWN },
        OR: [{ originalSourceId: link.contactId }, { currentRecipientId: link.contactId }],
      },
      select: {
        chequeNumber: true,
        amount: true,
        currency: true,
        dueDate: true,
        status: true,
        originalSourceId: true,
        bank: { select: { name: true } },
      },
      orderBy: { dueDate: 'desc' },
      take: 2000,
    });

    await this.prisma.db.statementLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: now },
    });

    return {
      organizationName: link.organization.name,
      contactName: link.contact.name,
      issuedOn: todayIn(link.organization.timezone),
      expiresAt: link.expiresAt.toISOString(),
      currencies: statement.currencies.map((entry) => ({
        currency: entry.currency,
        net: entry.net,
        pending: entry.pending,
        collected: entry.collected,
        bounced: entry.bounced,
        returned: entry.returned,
      })),
      cheques: cheques.map((cheque) => ({
        chequeNumber: cheque.chequeNumber,
        amount: moneyToString(cheque.amount),
        currency: cheque.currency,
        dueDate: cheque.dueDate.toISOString().slice(0, 10),
        status: cheque.status,
        bankName: cheque.bank?.name ?? null,
        part: cheque.originalSourceId === link.contactId ? 'FROM_THEM' : 'TO_THEM',
      })),
    };
  }

  private static view(link: {
    id: string;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    viewCount: number;
    lastViewedAt: Date | null;
  }): StatementLinkView {
    return {
      id: link.id,
      createdAt: link.createdAt.toISOString(),
      expiresAt: link.expiresAt.toISOString(),
      revokedAt: link.revokedAt?.toISOString() ?? null,
      viewCount: link.viewCount,
      lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
    };
  }
}
