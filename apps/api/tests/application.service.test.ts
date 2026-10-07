import { ApplicationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const companyFindFirst = vi.hoisted(() => vi.fn());
const applicationCreate = vi.hoisted(() => vi.fn());
const applicationFindMany = vi.hoisted(() => vi.fn());
const applicationFindFirst = vi.hoisted(() => vi.fn());
const applicationFindFirstOrThrow = vi.hoisted(() => vi.fn());
const applicationUpdate = vi.hoisted(() => vi.fn());
const applicationDelete = vi.hoisted(() => vi.fn());
const applicationTagCreateMany = vi.fn();
const applicationTagFindMany = vi.fn();
const statusHistoryCreate = vi.hoisted(() => vi.fn());
const tagUpsert = vi.fn();

/**
 * The tag store honours the [userId, name] uniqueness the real schema enforces,
 * so a tag belonging to another user can never be resolved or attached.
 */
const tagStore = new Map<string, { id: string; userId: string; name: string }>();
let tagSeq = 0;

const tx = {
  company: { findFirst: companyFindFirst },
  application: {
    create: applicationCreate,
    findMany: applicationFindMany,
    findFirst: applicationFindFirst,
    update: applicationUpdate,
    delete: applicationDelete,
  },
  applicationTag: { createMany: applicationTagCreateMany, findMany: applicationTagFindMany },
  statusHistory: { create: statusHistoryCreate },
  tag: {
    upsert: async (args: {
      where: { userId_name: { userId: string; name: string } };
      create: { userId: string; name: string };
    }) => {
      tagUpsert(args);
      const key = `${args.where.userId_name.userId}:${args.where.userId_name.name}`;
      const existing = tagStore.get(key);
      if (existing) return existing;
      tagSeq += 1;
      const created = { id: `tag-${tagSeq}`, ...args.create };
      tagStore.set(key, created);
      return created;
    },
  },
};

const transactionClients: unknown[] = [];
const transaction = vi.fn(async (fn: unknown) => {
  // Prisma's two $transaction forms: an array of operations, or a callback.
  if (Array.isArray(fn)) {
    return Promise.all(fn);
  }
  transactionClients.push(tx);
  return (fn as (client: typeof tx) => Promise<unknown>)(tx);
});

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...(args as [])),
    application: {
      findMany: applicationFindMany,
      findFirst: applicationFindFirst,
      findFirstOrThrow: applicationFindFirstOrThrow,
      create: applicationCreate,
      update: applicationUpdate,
      delete: applicationDelete,
    },
    statusHistory: { create: statusHistoryCreate },
  },
}));

import { changeStatus, createApplication, listApplications } from '../src/services/application.service';
import type { ApplicationCreateInput } from '../src/schemas';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';

function input(overrides: Partial<ApplicationCreateInput> = {}): ApplicationCreateInput {
  return {
    companyId: 'company-1',
    roleTitle: 'Staff Engineer',
    jobDescription: 'Original JD snapshot',
    isRemote: false,
    currentStatus: ApplicationStatus.APPLIED,
    tags: [],
    ...overrides,
  };
}

function createdApplication() {
  return {
    id: 'app-1',
    userId: USER_ID,
    companyId: 'company-1',
    roleTitle: 'Staff Engineer',
    jobDescription: 'Original JD snapshot',
    postingUrl: null,
    location: null,
    isRemote: false,
    salaryRange: null,
    resumeVersion: null,
    currentStatus: ApplicationStatus.APPLIED,
    appliedAt: new Date('2026-09-29T00:00:00.000Z'),
    createdAt: new Date('2026-09-29T00:00:00.000Z'),
    company: { id: 'company-1', name: 'Globex' },
    tags: [],
  };
}

describe('createApplication tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tagStore.clear();
    tagSeq = 0;
    transactionClients.length = 0;
    companyFindFirst.mockResolvedValue({ id: 'company-1' });
    applicationCreate.mockResolvedValue(createdApplication());
    applicationFindMany.mockResolvedValue([]);
    applicationFindFirst.mockResolvedValue(null);
    applicationUpdate.mockResolvedValue({});
    applicationDelete.mockResolvedValue({});
    applicationTagCreateMany.mockResolvedValue({ count: 0 });
    statusHistoryCreate.mockResolvedValue({});
    applicationTagFindMany.mockResolvedValue([]);
  });

  it('attaches the selected tags and returns them on the created application', async () => {
    applicationTagFindMany.mockResolvedValue([
      { tag: { id: 'tag-1', name: 'referral' } },
      { tag: { id: 'tag-2', name: 'remote' } },
    ]);

    const created = await createApplication(USER_ID, input({ tags: ['referral', 'remote'] }));

    expect(applicationTagCreateMany).toHaveBeenCalledWith({
      data: [
        { applicationId: 'app-1', tagId: 'tag-1' },
        { applicationId: 'app-1', tagId: 'tag-2' },
      ],
    });
    expect(created.tags).toEqual([
      { id: 'tag-1', name: 'referral' },
      { id: 'tag-2', name: 'remote' },
    ]);
  });

  it('runs the create, the tag links and the first history row in one transaction', async () => {
    await createApplication(USER_ID, input({ tags: ['referral'] }));

    expect(transaction).toHaveBeenCalledTimes(1);
    // The work ran inside the transaction, so a failure cannot leave a
    // half-created application with dangling tag links.
    expect(transactionClients).toEqual([tx]);
    expect(statusHistoryCreate).toHaveBeenCalledWith({
      data: { applicationId: 'app-1', status: ApplicationStatus.APPLIED },
    });
  });

  it('normalizes casing and whitespace and dedupes before writing links', async () => {
    await createApplication(USER_ID, input({ tags: ['  Referral ', 'referral', 'REFERRAL'] }));

    // One upsert for the single normalized name, and one link row.
    expect(tagUpsert).toHaveBeenCalledTimes(1);
    expect(tagUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_name: { userId: USER_ID, name: 'referral' } },
      }),
    );
    expect(applicationTagCreateMany).toHaveBeenCalledWith({
      data: [{ applicationId: 'app-1', tagId: 'tag-1' }],
    });
  });

  it('creates a tag that does not exist yet rather than rejecting it', async () => {
    await createApplication(USER_ID, input({ tags: ['brand-new'] }));

    expect(tagUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: USER_ID, name: 'brand-new' },
      }),
    );
    expect(applicationTagCreateMany).toHaveBeenCalledWith({
      data: [{ applicationId: 'app-1', tagId: 'tag-1' }],
    });
  });

  it('never resolves or attaches a tag belonging to another user', async () => {
    tagStore.set(`${OTHER_USER_ID}:referral`, { id: 'tag-other', userId: OTHER_USER_ID, name: 'referral' });

    const created = await createApplication(USER_ID, input({ tags: ['referral'] }));

    // The lookup is keyed by [userId, name], so the other user's row is invisible.
    for (const args of tagUpsert.mock.calls) {
      expect((args[0] as { where: { userId_name: { userId: string } } }).where.userId_name.userId).toBe(
        USER_ID,
      );
    }
    const linked = applicationTagCreateMany.mock.calls[0]?.[0] as { data: Array<{ tagId: string }> };
    expect(linked.data.map((row) => row.tagId)).not.toContain('tag-other');
    expect(created.tags).toEqual([]);
  });

  it('skips the tag write entirely when no tags are selected', async () => {
    const created = await createApplication(USER_ID, input({ tags: [] }));

    expect(tagUpsert).not.toHaveBeenCalled();
    expect(applicationTagCreateMany).not.toHaveBeenCalled();
    expect(created.tags).toEqual([]);
  });
});

describe('listApplications ordering', () => {
  const db: Array<{
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
    company: { id: string; name: string };
    tags: unknown[];
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    db.length = 0;
    applicationFindMany.mockImplementation(async (args: unknown) => {
      const where = args?.where ?? {};
      const userId = where.userId;
      let results = db.filter((row) => row.userId === userId);
      const orderBy = Array.isArray(args?.orderBy) ? args.orderBy : args?.orderBy ? [args.orderBy] : [];
      results = [...results].sort((a, b) => {
        for (const order of orderBy) {
          const keys = Object.keys(order);
          for (const key of keys) {
            const dir = (order as Record<string, unknown>)[key];
            const av = (a as Record<string, unknown>)[key];
            const bv = (b as Record<string, unknown>)[key];
            let cmp = 0;
            if (av instanceof Date && bv instanceof Date) {
              cmp = av.getTime() - bv.getTime();
            } else if (typeof av === 'string' && typeof bv === 'string') {
              cmp = av.localeCompare(bv);
            } else {
              cmp = av < bv ? -1 : av > bv ? 1 : 0;
            }
            if (cmp !== 0) {
              return dir === 'desc' ? -cmp : cmp;
            }
          }
        }
        return 0;
      });
      return results;
    });
  });

  it('a) rows sharing one appliedAt come back newest-first by createdAt', async () => {
    const sameAppliedAt = new Date('2026-10-01T00:00:00.000Z');
    db.push(
      {
        id: 'app-old',
        userId: USER_ID,
        companyId: 'c1',
        roleTitle: 'Eng',
        jobDescription: 'jd',
        postingUrl: null,
        location: null,
        isRemote: false,
        salaryRange: null,
        resumeVersion: null,
        currentStatus: ApplicationStatus.APPLIED,
        appliedAt: sameAppliedAt,
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
        company: { id: 'c1', name: 'C' },
        tags: [],
      },
      {
        id: 'app-new',
        userId: USER_ID,
        companyId: 'c1',
        roleTitle: 'Eng',
        jobDescription: 'jd',
        postingUrl: null,
        location: null,
        isRemote: false,
        salaryRange: null,
        resumeVersion: null,
        currentStatus: ApplicationStatus.APPLIED,
        appliedAt: sameAppliedAt,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        company: { id: 'c1', name: 'C' },
        tags: [],
      },
    );
    const result = await listApplications(USER_ID, {});
    expect(result.map((r) => r.id)).toEqual(['app-new', 'app-old']);
  });

  it('b) rows sharing appliedAt and createdAt tie-break on id desc, in a fixed expected order', async () => {
    const sameAppliedAt = new Date('2026-10-01T00:00:00.000Z');
    const sameCreatedAt = new Date('2026-10-01T10:00:00.000Z');
    db.push(
      { id: 'app-b', userId: USER_ID, companyId: 'c1', roleTitle: 'Eng', jobDescription: 'jd', postingUrl: null, location: null, isRemote: false, salaryRange: null, resumeVersion: null, currentStatus: ApplicationStatus.APPLIED, appliedAt: sameAppliedAt, createdAt: sameCreatedAt, company: { id: 'c1', name: 'C' }, tags: [] },
      { id: 'app-a', userId: USER_ID, companyId: 'c1', roleTitle: 'Eng', jobDescription: 'jd', postingUrl: null, location: null, isRemote: false, salaryRange: null, resumeVersion: null, currentStatus: ApplicationStatus.APPLIED, appliedAt: sameAppliedAt, createdAt: sameCreatedAt, company: { id: 'c1', name: 'C' }, tags: [] },
      { id: 'app-c', userId: USER_ID, companyId: 'c1', roleTitle: 'Eng', jobDescription: 'jd', postingUrl: null, location: null, isRemote: false, salaryRange: null, resumeVersion: null, currentStatus: ApplicationStatus.APPLIED, appliedAt: sameAppliedAt, createdAt: sameCreatedAt, company: { id: 'c1', name: 'C' }, tags: [] },
    );
    const result1 = await listApplications(USER_ID, {});
    const result2 = await listApplications(USER_ID, {});
    expect(result1).toEqual(result2);
    expect(result1.map((r) => r.id)).toEqual(['app-c', 'app-b', 'app-a']);
  });

  it('c) rows with different appliedAt still sort by appliedAt desc first', async () => {
    db.push(
      { id: 'app-old-date-newer-created', userId: USER_ID, companyId: 'c1', roleTitle: 'Eng', jobDescription: 'jd', postingUrl: null, location: null, isRemote: false, salaryRange: null, resumeVersion: null, currentStatus: ApplicationStatus.APPLIED, appliedAt: new Date('2026-09-01T00:00:00.000Z'), createdAt: new Date('2026-10-15T00:00:00.000Z'), company: { id: 'c1', name: 'C' }, tags: [] },
      { id: 'app-new-date-older-created', userId: USER_ID, companyId: 'c1', roleTitle: 'Eng', jobDescription: 'jd', postingUrl: null, location: null, isRemote: false, salaryRange: null, resumeVersion: null, currentStatus: ApplicationStatus.APPLIED, appliedAt: new Date('2026-10-01T00:00:00.000Z'), createdAt: new Date('2026-09-15T00:00:00.000Z'), company: { id: 'c1', name: 'C' }, tags: [] },
    );
    const result = await listApplications(USER_ID, {});
    expect(result.map((r) => r.id)).toEqual(['app-new-date-older-created', 'app-old-date-newer-created']);
  });

  it('d) another user\'s rows never appear', async () => {
    db.push(
      { id: 'app-other', userId: OTHER_USER_ID, companyId: 'c1', roleTitle: 'Eng', jobDescription: 'jd', postingUrl: null, location: null, isRemote: false, salaryRange: null, resumeVersion: null, currentStatus: ApplicationStatus.APPLIED, appliedAt: new Date('2026-10-01T00:00:00.000Z'), createdAt: new Date('2026-10-01T10:00:00.000Z'), company: { id: 'c1', name: 'C' }, tags: [] },
      { id: 'app-mine', userId: USER_ID, companyId: 'c1', roleTitle: 'Eng', jobDescription: 'jd', postingUrl: null, location: null, isRemote: false, salaryRange: null, resumeVersion: null, currentStatus: ApplicationStatus.APPLIED, appliedAt: new Date('2026-10-01T00:00:00.000Z'), createdAt: new Date('2026-10-01T10:00:00.000Z'), company: { id: 'c1', name: 'C' }, tags: [] },
    );
    const result = await listApplications(USER_ID, {});
    expect(result.map((r) => r.id)).toEqual(['app-mine']);
  });
});

interface ChangeStatusRow {
  id: string;
  userId: string;
  currentStatus: ApplicationStatus;
  statusHistory: Array<{
    id: string;
    status: ApplicationStatus;
    note: string | null;
    changedAt: Date;
  }>;
}

describe('changeStatus', () => {
  const db: ChangeStatusRow[] = [];

  function seed(overrides: Partial<ChangeStatusRow> = {}): ChangeStatusRow {
    return {
      id: 'app-1',
      userId: USER_ID,
      currentStatus: ApplicationStatus.APPLIED,
      statusHistory: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.length = 0;
    const findRow = async (args: unknown) => {
      const where = (args as { where?: { id?: string; userId?: string } }).where ?? {};
      const row = db.find((entry) => entry.id === where.id && entry.userId === where.userId);
      if (!row) return null;
      return {
        ...row,
        companyId: 'company-1',
        roleTitle: 'Staff Engineer',
        jobDescription: 'Original JD snapshot',
        postingUrl: null,
        location: null,
        isRemote: false,
        salaryRange: null,
        resumeVersion: null,
        appliedAt: new Date('2026-09-29T00:00:00.000Z'),
        createdAt: new Date('2026-09-29T00:00:00.000Z'),
        company: { id: 'company-1', name: 'Globex' },
        tags: [],
      };
    };
    applicationFindFirst.mockImplementation(findRow);
    applicationFindFirstOrThrow.mockImplementation(findRow);
    applicationUpdate.mockResolvedValue({});
    statusHistoryCreate.mockResolvedValue({});
  });

  it('rejects a request equal to currentStatus even when statusHistory is empty, and creates no history row', async () => {
    db.push(seed({ currentStatus: ApplicationStatus.ASSESSMENT, statusHistory: [] }));

    await expect(
      changeStatus(USER_ID, 'app-1', { status: ApplicationStatus.ASSESSMENT }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'The application is already in this status',
    });

    expect(statusHistoryCreate).not.toHaveBeenCalled();
    expect(applicationUpdate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns not found for another user\'s application and writes nothing', async () => {
    db.push(seed({ userId: OTHER_USER_ID, currentStatus: ApplicationStatus.APPLIED }));

    await expect(
      changeStatus(USER_ID, 'app-1', { status: ApplicationStatus.INTERVIEW, note: 'On it' }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Application not found' });

    expect(statusHistoryCreate).not.toHaveBeenCalled();
    expect(applicationUpdate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});