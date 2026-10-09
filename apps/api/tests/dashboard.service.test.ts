import { ApplicationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const groupBy = vi.fn();
const applicationTagFindMany = vi.fn();

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    application: {
      findMany: (...args: unknown[]) => findMany(...args),
      groupBy: (...args: unknown[]) => groupBy(...args),
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