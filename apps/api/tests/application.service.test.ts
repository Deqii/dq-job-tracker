import { ApplicationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const companyFindFirst = vi.fn();
const applicationCreate = vi.fn();
const applicationTagCreateMany = vi.fn();
const applicationTagFindMany = vi.fn();
const statusHistoryCreate = vi.fn();
const tagUpsert = vi.fn();

/**
 * The tag store honours the [userId, name] uniqueness the real schema enforces,
 * so a tag belonging to another user can never be resolved or attached.
 */
const tagStore = new Map<string, { id: string; userId: string; name: string }>();
let tagSeq = 0;

const tx = {
  company: { findFirst: companyFindFirst },
  application: { create: applicationCreate },
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
const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
  transactionClients.push(tx);
  return fn(tx);
});

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...(args as [])),
  },
}));

import { createApplication } from '../src/services/application.service';
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