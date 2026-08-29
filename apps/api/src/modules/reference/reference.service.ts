import { Injectable } from '@nestjs/common';

import type { BankView, BranchView, LocationView } from '@cheque-flow/shared-types';

import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';

/** Read-only reference data: branches, banks and storage locations. */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Banks are global reference data, optionally narrowed by country. */
  async listBanks(country?: string): Promise<BankView[]> {
    const banks = await this.prisma.db.bank.findMany({
      where: country ? { country } : {},
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
