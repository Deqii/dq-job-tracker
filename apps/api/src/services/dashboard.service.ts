import { ApplicationStatus, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { applicationInclude, toDto, type ApplicationDto } from './application.service';

const STATUS_KEYS: ApplicationStatus[] = [
  ApplicationStatus.WISHLIST,
  ApplicationStatus.APPLIED,
  ApplicationStatus.ASSESSMENT,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

type RecentRecord = Prisma.ApplicationGetPayload<{ include: typeof applicationInclude }>;

export interface DashboardDto {
  counts: Record<ApplicationStatus, number>;
  total: number;
  successRate: number;
  recentActivity: ApplicationDto[];
}

export async function getDashboard(userId: string): Promise<DashboardDto> {
  const grouped = await prisma.application.groupBy({
    by: ['currentStatus'],
    where: { userId },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(STATUS_KEYS.map((status) => [status, 0])) as Record<
    ApplicationStatus,
    number
  >;

  for (const row of grouped) {
    counts[row.currentStatus] = row._count._all;
  }

  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

  const successCount = counts[ApplicationStatus.INTERVIEW] + counts[ApplicationStatus.OFFER];
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

  const recent = await prisma.application.findMany({
    where: { userId },
    include: applicationInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 6,
  });

  return {
    counts,
    total,
    successRate,
    recentActivity: recent.map((app: RecentRecord) => toDto(app)),
  };
}