import { ApplicationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const groupBy = vi.fn();
const count = vi.fn();
const applicationTagFindMany = vi.fn();

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    application: {
      findMany: (...args: unknown[]) => findMany(...args),
      groupBy: (...args: unknown[]) => groupBy(...args),
      count: (...args: unknown[]) => count(...args),
    },
    applicationTag: {
      findMany: (...args: unknown[]) => applicationTagFindMany(...args),
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
    count.mockResolvedValue(0);
    applicationTagFindMany.mockResolvedValue([]);
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

    expect(findMany).toHaveBeenCalledTimes(2);
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

const OTHER_USER = 'user-2';

interface TagLink {
  applicationId: string;
  applicationUserId: string;
  currentStatus: ApplicationStatus;
  tagName: string;
  tagUserId: string;
}

describe('getDashboard tag stats', () => {
  const links: TagLink[] = [];

  function addTag(
    applicationId: string,
    tagName: string,
    currentStatus: ApplicationStatus,
    userId = USER_ID,
  ) {
    links.push({
      applicationId,
      applicationUserId: userId,
      currentStatus,
      tagName,
      tagUserId: userId,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    links.length = 0;
    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    // Mirrors the real query's relation filters: a link is only visible when
    // both its application and its tag belong to the calling user.
    applicationTagFindMany.mockImplementation(
      async (args: { where: { application?: { userId?: string }; tag?: { userId?: string } } }) => {
        const applicationUserId = args.where.application?.userId;
        const tagUserId = args.where.tag?.userId;
        return links
          .filter(
            (link) =>
              (applicationUserId === undefined || link.applicationUserId === applicationUserId) &&
              (tagUserId === undefined || link.tagUserId === tagUserId),
          )
          .map((link) => ({
            tag: { name: link.tagName },
            application: { currentStatus: link.currentStatus },
          }));
      },
    );
  });

  it('counts each application once per tag and treats Interview and Offer as responded', async () => {
    addTag('app-1', 'linkedin', ApplicationStatus.INTERVIEW);
    addTag('app-1', 'email', ApplicationStatus.INTERVIEW);
    addTag('app-2', 'email', ApplicationStatus.OFFER);
    addTag('app-3', 'email', ApplicationStatus.REJECTED);
    addTag('app-4', 'linkedin', ApplicationStatus.APPLIED);

    const { tagStats } = await getDashboard(USER_ID);

    expect(tagStats).toEqual([
      { name: 'email', total: 3, responded: 2 },
      { name: 'linkedin', total: 2, responded: 1 },
    ]);
  });

  it('sorts by total descending, then by name ascending', async () => {
    addTag('a1', 'linkedin', ApplicationStatus.INTERVIEW);
    addTag('a2', 'linkedin', ApplicationStatus.APPLIED);
    addTag('a3', 'linkedin', ApplicationStatus.APPLIED);
    addTag('a4', 'email', ApplicationStatus.OFFER);
    addTag('a5', 'email', ApplicationStatus.APPLIED);
    addTag('a6', 'referral', ApplicationStatus.APPLIED);
    addTag('a7', 'jobboard', ApplicationStatus.APPLIED);

    const { tagStats } = await getDashboard(USER_ID);

    expect(tagStats).toEqual([
      { name: 'linkedin', total: 3, responded: 1 },
      { name: 'email', total: 2, responded: 1 },
      { name: 'jobboard', total: 1, responded: 0 },
      { name: 'referral', total: 1, responded: 0 },
    ]);
  });

  it('caps the list at the 8 tags with the highest totals', async () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    names.forEach((name, index) => {
      for (let i = 0; i <= index; i += 1) {
        addTag(`${name}-${i}`, name, ApplicationStatus.APPLIED);
      }
    });

    const { tagStats } = await getDashboard(USER_ID);

    expect(tagStats).toHaveLength(8);
    expect(tagStats.map((stat) => stat.name)).toEqual(['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c']);
  });

  it("never includes another user's applications or tags", async () => {
    addTag('mine-1', 'linkedin', ApplicationStatus.INTERVIEW);
    addTag('other-app', 'linkedin', ApplicationStatus.OFFER, OTHER_USER);
    links.push({
      applicationId: 'mine-2',
      applicationUserId: USER_ID,
      currentStatus: ApplicationStatus.OFFER,
      tagName: 'foreign-tag',
      tagUserId: OTHER_USER,
    });

    const { tagStats } = await getDashboard(USER_ID);

    expect(tagStats).toEqual([{ name: 'linkedin', total: 1, responded: 1 }]);
  });
});

interface FollowUpApplication {
  id: string;
  userId: string;
  roleTitle: string;
  currentStatus: ApplicationStatus;
  appliedAt: Date;
  companyName: string;
}

interface FollowUpWhere {
  userId?: string;
  currentStatus?: ApplicationStatus;
  appliedAt?: { lte?: Date };
}

type FollowUpOrder = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];

function sortFollowUps(
  rows: FollowUpApplication[],
  orderBy: FollowUpOrder,
): FollowUpApplication[] {
  const entries = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((clause) =>
    Object.entries(clause),
  );
  return [...rows].sort((a, b) => {
    for (const [field, direction] of entries) {
      const aValue: string | number = field === 'id' ? a.id : a.appliedAt.getTime();
      const bValue: string | number = field === 'id' ? b.id : b.appliedAt.getTime();
      let delta = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        delta = aValue - bValue;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        delta = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
      if (delta !== 0) return direction === 'desc' ? -delta : delta;
    }
    return 0;
  });
}

describe('getDashboard follow-ups', () => {
  const NOW = new Date('2026-10-09T12:00:00.000Z');

  function daysAgo(days: number): Date {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  }

  function application(
    id: string,
    overrides: Partial<FollowUpApplication> = {},
  ): FollowUpApplication {
    return {
      id,
      userId: USER_ID,
      roleTitle: `Role ${id}`,
      currentStatus: ApplicationStatus.APPLIED,
      appliedAt: daysAgo(20),
      companyName: `Company ${id}`,
      ...overrides,
    };
  }

  function matches(row: FollowUpApplication, where: FollowUpWhere): boolean {
    if (where.userId !== undefined && row.userId !== where.userId) return false;
    if (where.currentStatus !== undefined && row.currentStatus !== where.currentStatus) {
      return false;
    }
    const lte = where.appliedAt?.lte;
    if (lte !== undefined && row.appliedAt.getTime() > lte.getTime()) return false;
    return true;
  }

  function installFake(rows: FollowUpApplication[]) {
    findMany.mockImplementation(
      async (args: { where: FollowUpWhere; orderBy: FollowUpOrder; take?: number }) => {
        if (args.where.appliedAt === undefined) return [];
        return sortFollowUps(
          rows.filter((row) => matches(row, args.where)),
          args.orderBy,
        )
          .slice(0, args.take)
          .map((row) => ({
            id: row.id,
            roleTitle: row.roleTitle,
            appliedAt: row.appliedAt,
            company: { name: row.companyName },
          }));
      },
    );
    count.mockImplementation(
      async (args: { where: FollowUpWhere }) =>
        rows.filter((row) => matches(row, args.where)).length,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    groupBy.mockResolvedValue([]);
    applicationTagFindMany.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  it('includes an application at the 14-day boundary and excludes one at 13 days', async () => {
    installFake([
      application('at-boundary', { appliedAt: daysAgo(14) }),
      application('too-fresh', { appliedAt: daysAgo(13) }),
    ]);

    const { followUps } = await getDashboard(USER_ID, NOW);

    expect(followUps.items.map((item) => item.id)).toEqual(['at-boundary']);
    expect(followUps.items[0].daysWaiting).toBe(14);
    expect(followUps.count).toBe(1);
  });

  it('never includes applications that are not in APPLIED status', async () => {
    installFake([
      application('applied', { appliedAt: daysAgo(20) }),
      application('interview', {
        appliedAt: daysAgo(30),
        currentStatus: ApplicationStatus.INTERVIEW,
      }),
      application('offer', { appliedAt: daysAgo(30), currentStatus: ApplicationStatus.OFFER }),
      application('rejected', {
        appliedAt: daysAgo(30),
        currentStatus: ApplicationStatus.REJECTED,
      }),
      application('withdrawn', {
        appliedAt: daysAgo(30),
        currentStatus: ApplicationStatus.WITHDRAWN,
      }),
    ]);

    const { followUps } = await getDashboard(USER_ID, NOW);

    expect(followUps.items.map((item) => item.id)).toEqual(['applied']);
    expect(followUps.count).toBe(1);
  });

  it('orders longest-waiting first with an id tie-break, caps at 5, and counts the total', async () => {
    installFake([
      application('g', { appliedAt: daysAgo(40) }),
      application('a', { appliedAt: daysAgo(30) }),
      application('b', { appliedAt: daysAgo(30) }),
      application('c', { appliedAt: daysAgo(28) }),
      application('e', { appliedAt: daysAgo(25) }),
      application('d', { appliedAt: daysAgo(20) }),
      application('f', { appliedAt: daysAgo(15) }),
    ]);

    const { followUps } = await getDashboard(USER_ID, NOW);

    expect(followUps.items.map((item) => item.id)).toEqual(['g', 'a', 'b', 'c', 'e']);
    expect(followUps.items).toHaveLength(5);
    expect(followUps.count).toBe(7);
  });

  it("never includes another user's applications", async () => {
    installFake([
      application('mine', { appliedAt: daysAgo(20) }),
      application('other', { appliedAt: daysAgo(30), userId: OTHER_USER }),
    ]);

    const { followUps } = await getDashboard(USER_ID, NOW);

    expect(followUps.items.map((item) => item.id)).toEqual(['mine']);
    expect(followUps.count).toBe(1);
  });
});