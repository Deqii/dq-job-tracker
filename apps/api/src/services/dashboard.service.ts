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

export interface FollowUpDto {
  id: string;
  roleTitle: string;
  companyName: string;
  appliedAt: Date;
  daysWaiting: number;
}

export interface FollowUpsDto {
  count: number;
  items: FollowUpDto[];
}

export interface DashboardDto {
  counts: Record<ApplicationStatus, number>;
  total: number;
  successRate: number;
  recentActivity: ApplicationDto[];
  tagStats: TagStatDto[];
  followUps: FollowUpsDto;
}

const TAG_STATS_LIMIT = 8;
const FOLLOW_UPS_LIMIT = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const FOLLOW_UP_AFTER_DAYS = 14;

function isResponded(status: ApplicationStatus): boolean {
  return status === ApplicationStatus.INTERVIEW || status === ApplicationStatus.OFFER;
}

function daysWaitingSince(appliedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - appliedAt.getTime()) / MS_PER_DAY);
}

export async function getDashboard(userId: string, now: Date = new Date()): Promise<DashboardDto> {
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

  const followUpWhere = {
    userId,
    currentStatus: ApplicationStatus.APPLIED,
    appliedAt: { lte: new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * MS_PER_DAY) },
  };

  const [followUpRows, followUpCount] = await Promise.all([
    prisma.application.findMany({
      where: followUpWhere,
      select: {
        id: true,
        roleTitle: true,
        appliedAt: true,
        company: { select: { name: true } },
      },
      orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }],
      take: FOLLOW_UPS_LIMIT,
    }),
    prisma.application.count({ where: followUpWhere }),
  ]);

  const followUps: FollowUpsDto = {
    count: followUpCount,
    items: followUpRows.map((app) => ({
      id: app.id,
      roleTitle: app.roleTitle,
      companyName: app.company.name,
      appliedAt: app.appliedAt,
      daysWaiting: daysWaitingSince(app.appliedAt, now),
    })),
  };

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
    followUps,
  };
}