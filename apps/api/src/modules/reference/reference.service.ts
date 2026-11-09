import { Injectable } from '@nestjs/common';

import {
  ApiErrorCode,
  type BankSettingsView,
  type BankView,
  type BranchView,
  type LocationView,
  foldBankName,
} from '@cheque-flow/shared-types';
import type { CreateBankInput, UpdateBankInput } from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';

/**
 * Reference data: branches, banks and storage locations.
 *
 * Banks are the shared reference list (no organization) plus each
 * organization's own additions, which only that organization sees and edits.
 */
@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The banks this organization can draw cheques on: reference plus its own. */
  static visibleBanks(organizationId: string) {
    return { OR: [{ organizationId: null }, { organizationId }], deletedAt: null };
  }

  async listBranches(user: RequestUser): Promise<BranchView[]> {
    const branches = await this.prisma.db.branch.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
    });
    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      phone: branch.phone,
      isActive: branch.isActive,
    }));
  }

  /** The banks offered in the pickers: visible to this organization and not hidden. */
  async listBanks(user: RequestUser, country?: string): Promise<BankView[]> {
    const banks = await this.prisma.db.bank.findMany({
      where: {
        ...ReferenceService.visibleBanks(user.organizationId),
        isActive: true,
        ...(country ? { country } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return banks.map((bank) => ({
      id: bank.id,
      country: bank.country,
      name: bank.name,
      code: bank.code,
      logoUrl: bank.logoUrl,
    }));
  }

  /** Every bank this organization sees, hidden ones included, for the settings page. */
  async listBanksForSettings(user: RequestUser): Promise<BankSettingsView[]> {
    const [banks, counts] = await Promise.all([
      this.prisma.db.bank.findMany({
        where: ReferenceService.visibleBanks(user.organizationId),
        orderBy: [{ organizationId: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
      }),
      this.prisma.db.cheque.groupBy({
        by: ['bankId'],
        where: { organizationId: user.organizationId, deletedAt: null, bankId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countByBank = new Map(counts.map((row) => [row.bankId, row._count._all]));
    return banks.map((bank) => ({
      id: bank.id,
      country: bank.country,
      name: bank.name,
      code: bank.code,
      logoUrl: bank.logoUrl,
      isReference: bank.organizationId === null,
      isActive: bank.isActive,
      chequeCount: countByBank.get(bank.id) ?? 0,
    }));
  }

  async createBank(
    user: RequestUser,
    input: CreateBankInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<BankSettingsView> {
    const organization = await this.prisma.db.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
      select: { country: true },
    });
    const country = input.country ?? organization.country;
    await this.assertNameFree(user.organizationId, input.name);

    // A code is made up when none is given; bank codes are a filing detail
    // most people never see.
    const code = input.code ?? `B${Date.now().toString(36).toUpperCase()}`;
    const clash = await this.prisma.db.bank.findFirst({
      where: { ...ReferenceService.visibleBanks(user.organizationId), country, code },
      select: { id: true },
    });
    if (clash) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'A bank with this code exists', {
        fieldErrors: [{ path: 'code', message: 'validation.bank.codeTaken' }],
      });
    }

    const bank = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.bank.create({
        data: { organizationId: user.organizationId, country, code, name: input.name },
      });
      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.BANK_CREATED,
        entityType: 'bank',
        entityId: created.id,
        after: { name: created.name, code: created.code, country: created.country },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });
      return created;
    });

    return {
      id: bank.id,
      country: bank.country,
      name: bank.name,
      code: bank.code,
      logoUrl: bank.logoUrl,
      isReference: false,
      isActive: bank.isActive,
      chequeCount: 0,
    };
  }

  async updateBank(
    user: RequestUser,
    id: string,
    input: UpdateBankInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<BankSettingsView> {
    const existing = await this.prisma.db.bank.findFirst({
      where: { id, ...ReferenceService.visibleBanks(user.organizationId) },
    });
    if (!existing) throw AppError.notFound('Bank', id);
    // Shared by every organization on the server: one of them renaming or
    // hiding it would change it for all the others.
    if (existing.organizationId === null) {
      throw AppError.forbidden('Reference banks are shared and cannot be changed');
    }
    if (input.name !== undefined && input.name !== existing.name) {
      await this.assertNameFree(user.organizationId, input.name, id);
    }

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const row = await tx.bank.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.BANK_UPDATED,
        entityType: 'bank',
        entityId: id,
        before: { name: existing.name, isActive: existing.isActive },
        after: { name: row.name, isActive: row.isActive },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });
      return row;
    });

    const chequeCount = await this.prisma.db.cheque.count({
      where: { organizationId: user.organizationId, deletedAt: null, bankId: id },
    });
    return {
      id: updated.id,
      country: updated.country,
      name: updated.name,
      code: updated.code,
      logoUrl: updated.logoUrl,
      isReference: false,
      isActive: updated.isActive,
      chequeCount,
    };
  }

  /**
   * Deletes one of this organization's own banks, softly, if no cheque has
   * ever been drawn on it. One that has, deleted cheques included, would leave
   * those cheques naming a bank nobody can find; it can be hidden instead.
   */
  async deleteBank(
    user: RequestUser,
    id: string,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<void> {
    const existing = await this.prisma.db.bank.findFirst({
      where: { id, ...ReferenceService.visibleBanks(user.organizationId) },
    });
    if (!existing) throw AppError.notFound('Bank', id);
    if (existing.organizationId === null) {
      throw AppError.forbidden('Reference banks are shared and cannot be changed');
    }

    await this.prisma.db.$transaction(async (tx) => {
      const cheques = await tx.cheque.count({ where: { bankId: id } });
      if (cheques > 0) {
        throw new AppError(ApiErrorCode.CONFLICT, 'Bank has cheques', {
          details: { reason: 'BANK_IN_USE', cheques },
        });
      }
      await tx.bank.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.recordWithin(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: AuditAction.BANK_DELETED,
        entityType: 'bank',
        entityId: id,
        before: { name: existing.name, code: existing.code },
        ipAddress: auditMeta.ipAddress ?? null,
        deviceInfo: auditMeta.deviceInfo ?? null,
      });
    });
  }

  /**
   * Two banks of one name in a picker cannot be told apart, and in Arabic
   * "one name" is wider than equal strings: see {@link foldBankName}.
   */
  private async assertNameFree(organizationId: string, name: string, exceptId?: string) {
    const folded = foldBankName(name);
    const visible = await this.prisma.db.bank.findMany({
      where: {
        ...ReferenceService.visibleBanks(organizationId),
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
    });
    const taken = visible.find((bank) => foldBankName(bank.name) === folded);
    if (taken) {
      throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'A bank with this name exists', {
        details: { existingName: taken.name },
        fieldErrors: [{ path: 'name', message: 'validation.bank.nameTaken' }],
      });
    }
  }

  async listLocations(user: RequestUser, branchId?: string): Promise<LocationView[]> {
    const locations = await this.prisma.db.location.findMany({
      where: {
        organizationId: user.organizationId,
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return locations.map((location) => ({
      id: location.id,
      branchId: location.branchId,
      type: location.type,
      name: location.name,
      description: location.description,
      isActive: location.isActive,
    }));
  }
}
