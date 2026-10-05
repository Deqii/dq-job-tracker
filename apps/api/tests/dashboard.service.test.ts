import { ApplicationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const groupBy = vi.fn();

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    application: {
      findMany: (...args: unknown[]) => findMany(...args),
      groupBy: (...args: unknown[]) => groupBy(...args),
    },
  },
}));

import { getDashboard } from '../src/services/dashboard.service';

const USER_ID = 'user-1';
const SHARED_APPLIED_AT = new Date('2026-09-29T00:00:00.000Z');

interface Row {
  id: string;
  createdAt: Date;
  appliedAt: Date;
  roleTitle: string;
}

function row(id: string, createdAt: string): Row {
  return {
    id,
    createdAt: new Date(createdAt),
    appliedAt: SHARED_APPLIED_AT,
    roleTitle: `Role ${id}`,
  };
}

function toRecord(application: Row) {
  return {
    ...application,
    userId: USER_ID,
    companyId: 'company-1',
    jobDescription: 'Original JD snapshot',
    postingUrl: null,
    location: null,
    isRemote: false,
    salaryRange: null,
    resumeVersion: null,
    currentStatus: ApplicationStatus.APPLIED,
    company: { id: 'company-1', name: 'Acme Inc' },
    tags: [],
  };
}

type OrderBy = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];

function sortByOrderBy(rows: Row[], orderBy: OrderBy): Row[] {
  const entries = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((clause) =>
    Object.entries(clause),
  );
  const primaryField = entries[0][0];
  const primaryDirection = entries[0][1];
  const secondaryDirection = entries[1]?.[1] ?? 'asc';
  return [...rows].sort((a, b) => {
    const delta = a[primaryField as 'createdAt'].getTime() - b[primaryField as 'createdAt'].getTime();
    if (delta !== 0) return primaryDirection === 'desc' ? -delta : delta;
    const idDelta = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return secondaryDirection === 'desc' ? -idDelta : idDelta;
  });
}

describe('getDashboard recent activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupBy.mockResolvedValue([
      { currentStatus: ApplicationStatus.APPLIED, _count: { _all: 6 } },
    ]);
  });

  it('orders recent activity by full timestamp, newest first, even when appliedAt ties', async () => {
    const rows = [
      row('app-a', '2026-09-29T08:10:00.000Z'),
      row('app-f', '2026-09-29T09:00:00.000Z'),
      row('app-b', '2026-09-29T07:20:00.000Z'),
      row('app-e', '2026-09-29T08:50:00.000Z'),
      row('app-c', '2026-09-29T07:40:00.000Z'),
      row('app-d', '2026-09-29T08:30:00.000Z'),
    ];

    findMany.mockImplementation(async (args: { orderBy: OrderBy; take: number }) => {
      return sortByOrderBy(rows, args.orderBy).slice(0, args.take).map(toRecord);
    });

    const dashboard = await getDashboard(USER_ID);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID });
    expect(dashboard.recentActivity.map((app) => app.id)).toEqual([
      'app-f',
      'app-e',
      'app-d',
      'app-a',
      'app-c',
      'app-b',
    ]);
    expect(dashboard.recentActivity.map((app) => app.createdAt.getTime())).toEqual([
      ...dashboard.recentActivity.map((app) => app.createdAt.getTime()),
    ].sort((a, b) => b - a));
  });

  it('breaks identical createdAt ties on id descending so the order is stable', async () => {
    const tieTime = new Date('2026-09-29T08:00:00.000Z');
    const rows = [
      { ...row('app-a', tieTime.toISOString()), createdAt: tieTime },
      { ...row('app-c', tieTime.toISOString()), createdAt: tieTime },
      { ...row('app-b', tieTime.toISOString()), createdAt: tieTime },
    ];

    findMany.mockImplementation(async (args: { orderBy: OrderBy; take: number }) => {
      return sortByOrderBy(rows, args.orderBy).slice(0, args.take).map(toRecord);
    });

    const first = await getDashboard(USER_ID);
    const second = await getDashboard(USER_ID);

    expect(first.recentActivity.map((app) => app.id)).toEqual(['app-c', 'app-b', 'app-a']);
    expect(second.recentActivity.map((app) => app.id)).toEqual(first.recentActivity.map((app) => app.id));
  });
});