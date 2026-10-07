import { ApplicationStatus, Prisma } from '@prisma/client';

import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import type {
  ApplicationCreateInput,
  ApplicationFilters,
  ApplicationUpdateInput,
  StatusChangeInput,
} from '../schemas';
import { resolveTagNames, type TagDto } from './tag.service';

export interface CompanyRef {
  id: string;
  name: string;
}

export interface StatusHistoryDto {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  changedAt: Date;
}

export interface ApplicationDto {
  id: string;
  userId: string;
  companyId: string;
  roleTitle: string;
  jobDescription: string;
  postingUrl: string | null;
  location: string | null;
  isRemote: boolean;
  salaryRange: string | null;
  resumeVersion: string | null;
  currentStatus: ApplicationStatus;
  appliedAt: Date;
  createdAt: Date;
  company?: CompanyRef;
  tags?: TagDto[];
  statusHistory?: StatusHistoryDto[];
}

export const applicationInclude = {
  company: { select: { id: true, name: true } },
  tags: {
    orderBy: { tag: { name: 'asc' } },
    select: { tag: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ApplicationInclude;

const applicationDetailInclude = {
  ...applicationInclude,
  statusHistory: { orderBy: { changedAt: 'asc' } },
} satisfies Prisma.ApplicationInclude;

type ApplicationRecord = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;
type ApplicationDetailRecord = Prisma.ApplicationGetPayload<{ include: typeof applicationDetailInclude }>;

export async function listApplications(
  userId: string,
  filters: ApplicationFilters,
): Promise<ApplicationDto[]> {
  const apps = await prisma.application.findMany({
    where: buildWhereClause(userId, filters),
    include: applicationInclude,
    orderBy: [{ appliedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
  return apps.map(toDto);
}

export async function getApplication(userId: string, applicationId: string): Promise<ApplicationDto> {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: applicationDetailInclude,
  });
  if (!app) {
    throw notFound('Application not found');
  }
  return toDto(app);
}

export async function createApplication(
  userId: string,
  input: ApplicationCreateInput,
): Promise<ApplicationDto> {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirst({
      where: { id: input.companyId, userId },
      select: { id: true },
    });
    if (!company) {
      throw notFound('Company not found');
    }

    const app = await tx.application.create({
      data: {
        userId,
        companyId: input.companyId,
        roleTitle: input.roleTitle,
        // The job description snapshot is captured once at creation time and never touched again.
        jobDescription: input.jobDescription,
        postingUrl: nullableOrUndefined(input.postingUrl),
        location: nullableOrUndefined(input.location),
        isRemote: input.isRemote,
        salaryRange: nullableOrUndefined(input.salaryRange),
        resumeVersion: nullableOrUndefined(input.resumeVersion),
        currentStatus: input.currentStatus,
        appliedAt: input.appliedAt ? new Date(input.appliedAt) : undefined,
      },
      include: applicationInclude,
    });

    if (input.tags.length > 0) {
      const resolved = await resolveTagNames(tx, userId, input.tags);
      await tx.applicationTag.createMany({
        data: resolved.map((tag) => ({ applicationId: app.id, tagId: tag.id })),
      });
    }

    // The initial status is part of the append-only timeline, so the history
    // begins at the same moment the application exists.
    await tx.statusHistory.create({
      data: { applicationId: app.id, status: app.currentStatus },
    });

    return { ...toDto(app), tags: await tagsOf(tx, app.id) };
  });
}

export async function updateApplication(
  userId: string,
  applicationId: string,
  input: ApplicationUpdateInput,
): Promise<ApplicationDto> {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findFirst({
      where: { id: applicationId, userId },
      include: applicationInclude,
    });
    if (!app) {
      throw notFound('Application not found');
    }

    if (input.companyId && input.companyId !== app.companyId) {
      const company = await tx.company.findFirst({
        where: { id: input.companyId, userId },
        select: { id: true },
      });
      if (!company) {
        throw notFound('Company not found');
      }
    }

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        companyId: input.companyId,
        roleTitle: input.roleTitle,
        postingUrl: nullableOrUndefined(input.postingUrl),
        location: nullableOrUndefined(input.location),
        isRemote: input.isRemote,
        salaryRange: nullableOrUndefined(input.salaryRange),
        resumeVersion: nullableOrUndefined(input.resumeVersion),
        appliedAt: input.appliedAt ? new Date(input.appliedAt) : undefined,
      },
      include: applicationInclude,
    });

    let tags = updated.tags || [];
    if (input.tags !== undefined) {
      const resolved = await resolveTagNames(tx, userId, input.tags);
      await tx.applicationTag.deleteMany({ where: { applicationId } });
      if (resolved.length > 0) {
        await tx.applicationTag.createMany({
          data: resolved.map((tag) => ({ applicationId, tagId: tag.id })),
        });
      }
      tags = resolved.map((tag) => ({ tag }));
    }

    return { ...toDto(updated), tags: tags.map((entry) => entry.tag) };
  });
}

export async function deleteApplication(userId: string, applicationId: string): Promise<void> {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    select: { id: true },
  });
  if (!app) {
    throw notFound('Application not found');
  }

  await prisma.$transaction([
    prisma.applicationTag.deleteMany({ where: { applicationId } }),
    prisma.statusHistory.deleteMany({ where: { applicationId } }),
    prisma.application.delete({ where: { id: applicationId } }),
  ]);
}

export async function changeStatus(
  userId: string,
  applicationId: string,
  input: StatusChangeInput,
): Promise<ApplicationDto> {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: applicationDetailInclude,
  });
  if (!app) {
    throw notFound('Application not found');
  }

  const current = app.statusHistory[app.statusHistory.length - 1];
  if (current && current.status === input.status) {
    throw badRequest('The application is already in this status');
  }

  await prisma.$transaction([
    // Append-only history: a new row is written on every status change.
    prisma.statusHistory.create({
      data: { applicationId, status: input.status, note: input.note ?? null },
    }),
    prisma.application.update({
      where: { id: applicationId },
      data: { currentStatus: input.status },
    }),
  ]);

  const refreshed = await prisma.application.findFirstOrThrow({
    where: { id: applicationId, userId },
    include: applicationDetailInclude,
  });
  return toDto(refreshed);
}

export function buildWhereClause(
  userId: string,
  filters: ApplicationFilters,
): Prisma.ApplicationWhereInput {
  const where: Prisma.ApplicationWhereInput = { userId };
  const { search, status, tag, from, to } = filters;

  if (search) {
    where.OR = [
      { roleTitle: { contains: search } },
      { company: { is: { name: { contains: search } } } },
    ];
  }

  if (status) {
    where.currentStatus = status;
  }

  if (tag) {
    where.tags = { some: { tag: { name: tag.trim().toLowerCase() } } };
  }

  if (from || to) {
    where.appliedAt = {
      ...(from ? { gte: parseDateBoundary(from, 'from') } : {}),
      ...(to ? { lte: parseDateBoundary(to, 'to', true) } : {}),
    };
  }

  return where;
}

function parseDateBoundary(value: string, field: 'from' | 'to', endOfDay = false): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw badRequest(`Invalid ${field} date. Use YYYY-MM-DD.`);
  }
  const [year, month, day] = [match[1], match[2], match[3]] as [string, string, string];
  if (endOfDay) {
    return new Date(`${year}-${month}-${day}T23:59:59.999Z`);
  }
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

function nullableOrUndefined(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === '' ? null : value.trim();
}

async function tagsOf(tx: Prisma.TransactionClient, applicationId: string): Promise<TagDto[]> {
  const links = await tx.applicationTag.findMany({
    where: { applicationId },
    select: { tag: { select: { id: true, name: true } } },
    orderBy: { tag: { name: 'asc' } },
  });
  return links.map((link) => link.tag);
}

export function toDto(app: ApplicationRecord | ApplicationDetailRecord): ApplicationDto {
  return {
    id: app.id,
    userId: app.userId,
    companyId: app.companyId,
    roleTitle: app.roleTitle,
    jobDescription: app.jobDescription,
    postingUrl: app.postingUrl,
    location: app.location,
    isRemote: app.isRemote,
    salaryRange: app.salaryRange,
    resumeVersion: app.resumeVersion,
    currentStatus: app.currentStatus,
    appliedAt: app.appliedAt,
    createdAt: app.createdAt,
    company: app.company,
    tags: (app.tags ?? []).map((entry) => entry.tag),
    statusHistory: 'statusHistory' in app ? app.statusHistory : undefined,
  };
}