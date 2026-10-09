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

export interface TagStatDto {
  name: string;
  total: number;
  responded: number;
}

export interface DashboardDto {
  counts: Record<ApplicationStatus, number>;
  total: number;
  successRate: number;
  recentActivity: ApplicationDto[];
  tagStats: TagStatDto[];
}

const TAG_STATS_LIMIT = 8;

function isResponded(status: ApplicationStatus): boolean {
  return status === ApplicationStatus.INTERVIEW || status === ApplicationStatus.OFFER;
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

  // Both relations are scoped to the caller so neither a foreign application
  // nor a foreign tag can ever surface in the aggregation.
  const tagLinks = await prisma.applicationTag.findMany({
    where: { application: { userId }, tag: { userId } },
    select: {
      tag: { select: { name: true } },
      application: { select: { currentStatus: true } },
    },
  });

  const tagAggregates = new Map<string, TagStatDto>();
  for (const link of tagLinks) {
    const entry = tagAggregates.get(link.tag.name) ?? {
      name: link.tag.name,
      total: 0,
      responded: 0,
    };
    entry.total += 1;
    if (isResponded(link.application.currentStatus)) {
      entry.responded += 1;
    }
    tagAggregates.set(link.tag.name, entry);
  }

  const tagStats = [...tagAggregates.values()]
    .sort((a, b) => b.total - a.total || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, TAG_STATS_LIMIT);

  return {
    counts,
    total,
    successRate,
    recentActivity: recent.map((app: RecentRecord) => toDto(app)),
    tagStats,
  };
}