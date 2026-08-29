import { Injectable } from '@nestjs/common';

import type { ContactView, Paginated } from '@cheque-flow/shared-types';
import type { Prisma } from '@cheque-flow/database';
import type {
  CreateContactInput,
  ListContactsQuery,
  UpdateContactInput,
} from '@cheque-flow/validation';

import { AppError } from '../../common/errors/app-error';
import type { RequestUser } from '../../common/types/request-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService, type AuditContext } from '../audit/audit.service';

type ContactRow = Prisma.ContactGetPayload<Record<string, never>>;

function toView(contact: ContactRow): ContactView {
  return {
    id: contact.id,
    type: contact.type,
    name: contact.name,
    companyName: contact.companyName,
    phone: contact.phone,
    email: contact.email,
    taxNumber: contact.taxNumber,
    address: contact.address,
    notes: contact.notes,
    isActive: contact.isActive,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, query: ListContactsQuery): Promise<Paginated<ContactView>> {
    const where: Prisma.ContactWhereInput = {
      organizationId: user.organizationId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { companyName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await this.prisma.db.$transaction([
      this.prisma.db.contact.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.db.contact.count({ where }),
    ]);

    return {
      data: rows.map(toView),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        hasNextPage: skip + rows.length < total,
      },
    };
  }

  async findById(user: RequestUser, id: string): Promise<ContactView> {
    const contact = await this.prisma.db.contact.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!contact) throw AppError.notFound('Contact', id);
    return toView(contact);
  }

  async create(
    user: RequestUser,
    input: CreateContactInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<ContactView> {
    const contact = await this.prisma.db.contact.create({
      data: { ...input, organizationId: user.organizationId },
    });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CONTACT_CREATED,
      entityType: 'contact',
      entityId: contact.id,
      after: { name: contact.name, type: contact.type },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });

    return toView(contact);
  }

  async update(
    user: RequestUser,
    id: string,
    input: UpdateContactInput,
    auditMeta: Partial<AuditContext> = {},
  ): Promise<ContactView> {
    const existing = await this.prisma.db.contact.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) throw AppError.notFound('Contact', id);

    const contact = await this.prisma.db.contact.update({ where: { id }, data: input });

    await this.audit.record({
      organizationId: user.organizationId,
      userId: user.id,
      action: AuditAction.CONTACT_UPDATED,
      entityType: 'contact',
      entityId: id,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: contact.name, isActive: contact.isActive },
      ipAddress: auditMeta.ipAddress ?? null,
      deviceInfo: auditMeta.deviceInfo ?? null,
    });

    return toView(contact);
  }
}
