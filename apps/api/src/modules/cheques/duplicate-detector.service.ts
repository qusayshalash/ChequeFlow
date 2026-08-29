import { Injectable } from '@nestjs/common';

import { ApiErrorCode, type DuplicateChequeMatch } from '@cheque-flow/shared-types';
import { moneyToString, toMoney, type Prisma } from '@cheque-flow/database';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { toIsoDate } from './cheque.mapper';

export interface BusinessKeyInput {
  organizationId: string;
  bankId: string | null;
  chequeNumber: string;
  amount: string;
  dueDate: string;
  /** Excluded from the search — used when re-checking an existing cheque. */
  excludeChequeId?: string;
}

/**
 * Detects cheques that have already been recorded.
 *
 * Two independent checks are run:
 *  1. the business key (organization + bank + number + amount + due date);
 *  2. the SHA-256 hash of an uploaded image.
 *
 * Neither is a database unique constraint: a legitimate re-issue can share a
 * number, so the decision to block or continue belongs to the caller.
 */
@Injectable()
export class DuplicateDetectorService {
  constructor(private readonly prisma: PrismaService) {}

  async findByBusinessKey(input: BusinessKeyInput): Promise<DuplicateChequeMatch[]> {
    const where: Prisma.ChequeWhereInput = {
      organizationId: input.organizationId,
      chequeNumber: input.chequeNumber,
      amount: toMoney(input.amount),
      dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
      deletedAt: null,
      ...(input.bankId ? { bankId: input.bankId } : {}),
      ...(input.excludeChequeId ? { id: { not: input.excludeChequeId } } : {}),
    };

    const matches = await this.prisma.db.cheque.findMany({
      where,
      select: { id: true, chequeNumber: true, amount: true, dueDate: true, status: true },
      take: 5,
    });

    return matches.map((match) => ({
      chequeId: match.id,
      chequeNumber: match.chequeNumber,
      amount: moneyToString(match.amount),
      dueDate: toIsoDate(match.dueDate) ?? '',
      status: match.status,
      reason: 'BUSINESS_KEY' as const,
    }));
  }

  async findByImageHash(
    organizationId: string,
    imageHash: string,
    excludeChequeId?: string,
  ): Promise<DuplicateChequeMatch[]> {
    const images = await this.prisma.db.chequeImage.findMany({
      where: {
        imageHash,
        cheque: {
          organizationId,
          deletedAt: null,
          ...(excludeChequeId ? { id: { not: excludeChequeId } } : {}),
        },
      },
      select: {
        cheque: {
          select: { id: true, chequeNumber: true, amount: true, dueDate: true, status: true },
        },
      },
      take: 5,
    });

    return images.map(({ cheque }) => ({
      chequeId: cheque.id,
      chequeNumber: cheque.chequeNumber,
      amount: moneyToString(cheque.amount),
      dueDate: toIsoDate(cheque.dueDate) ?? '',
      status: cheque.status,
      reason: 'IMAGE_HASH' as const,
    }));
  }

  /** Throws DUPLICATE_CHEQUE when matches exist and the caller did not override. */
  static assertNoDuplicates(matches: DuplicateChequeMatch[], allowDuplicate: boolean): void {
    if (allowDuplicate || matches.length === 0) return;
    const first = matches[0];
    throw new AppError(ApiErrorCode.DUPLICATE_CHEQUE, 'Duplicate cheque detected', {
      details: {
        reason: first?.reason ?? 'BUSINESS_KEY',
        existingChequeId: first?.chequeId ?? null,
        matches: matches.length,
      },
    });
  }
}
