import { describe, expect, it } from 'vitest';

import { ApplicationStatus } from '@prisma/client';

import {
  applicationCreateSchema,
  applicationUpdateSchema,
  companyCreateSchema,
  companyUpdateSchema,
  loginSchema,
  registerSchema,
  statusChangeSchema,
  tagCreateSchema,
  validateBody,
} from '../src/schemas';

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    const input = validateBody(registerSchema, {
      email: 'Me@Example.COM ',
      password: 'password123',
    });
    expect(input.email).toBe('me@example.com');
  });

  it('rejects a short password', () => {
    expect(() => validateBody(registerSchema, { email: 'a@b.co', password: 'short' })).toThrow(
      'Validation failed',
    );
  });

  it('rejects an invalid email', () => {
    expect(() => validateBody(registerSchema, { email: 'nope', password: 'password123' })).toThrow(
      'Validation failed',
    );
  });
});

describe('loginSchema', () => {
  it('accepts a valid login', () => {
    const input = validateBody(loginSchema, { email: 'a@b.co', password: 'anything' });
    expect(input.email).toBe('a@b.co');
  });
});

describe('applicationCreateSchema', () => {
  it('defaults currentStatus to APPLIED and allows an empty appliedAt', () => {
    const input = validateBody(applicationCreateSchema, {
      companyId: 'c1',
      roleTitle: 'Engineer',
      jobDescription: 'Full JD',
      appliedAt: '',
      tags: ['Remote', 'remote', '  React '],
    });
    expect(input.currentStatus).toBe(ApplicationStatus.APPLIED);
    expect(input.appliedAt).toBe('');
    expect(input.isRemote).toBe(false);
    expect(new Set(input.tags)).toEqual(new Set(['Remote', 'remote', 'React']));
  });

  it('defaults tags to an empty list so creating without tags stays valid', () => {
    const input = validateBody(applicationCreateSchema, {
      companyId: 'c1',
      roleTitle: 'Engineer',
      jobDescription: 'Full JD',
    });
    expect(input.tags).toEqual([]);
  });

  it('trims each tag name but keeps casing so the service can normalize', () => {
    const input = validateBody(applicationCreateSchema, {
      companyId: 'c1',
      roleTitle: 'Engineer',
      jobDescription: 'Full JD',
      tags: ['  Remote  ', 'Reactive'],
    });
    expect(input.tags).toEqual(['Remote', 'Reactive']);
  });

  it('rejects a blank tag name and an over-long one', () => {
    const base = { companyId: 'c1', roleTitle: 'Engineer', jobDescription: 'Full JD' };
    expect(() => validateBody(applicationCreateSchema, { ...base, tags: ['  '] })).toThrow(
      'Validation failed',
    );
    expect(() => validateBody(applicationCreateSchema, { ...base, tags: ['x'.repeat(51)] })).toThrow(
      'Validation failed',
    );
  });

  it('rejects more than 30 tags', () => {
    const tags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
    expect(() =>
      validateBody(applicationCreateSchema, {
        companyId: 'c1',
        roleTitle: 'Engineer',
        jobDescription: 'Full JD',
        tags,
      }),
    ).toThrow('Validation failed');
  });

  it('rejects a missing jobDescription', () => {
    expect(() =>
      validateBody(applicationCreateSchema, { companyId: 'c1', roleTitle: 'Engineer' }),
    ).toThrow('Validation failed');
  });

  it('rejects an invalid status', () => {
    expect(() =>
      validateBody(applicationCreateSchema, {
        companyId: 'c1',
        roleTitle: 'Engineer',
        jobDescription: 'JD',
        currentStatus: 'ON_FIRE',
      }),
    ).toThrow('Validation failed');
  });

  it('trims notes, stores an empty string as null and rejects over 10000 characters', () => {
    const base = { companyId: 'c1', roleTitle: 'Engineer', jobDescription: 'Full JD' };
    expect(validateBody(applicationCreateSchema, { ...base, notes: '  call Jane  ' }).notes).toBe(
      'call Jane',
    );
    expect(validateBody(applicationCreateSchema, { ...base, notes: '' }).notes).toBeNull();
    expect(() =>
      validateBody(applicationCreateSchema, { ...base, notes: 'x'.repeat(10_001) }),
    ).toThrow('Validation failed');
  });
});

describe('applicationUpdateSchema', () => {
  it('must NOT accept jobDescription so snapshots are immutable', () => {
    const result = applicationUpdateSchema.safeParse({
      roleTitle: 'Senior Engineer',
      jobDescription: 'Someone tried to overwrite the snapshot',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('jobDescription');
    }
  });

  it('accepts tag replacement', () => {
    const result = applicationUpdateSchema.safeParse({ tags: ['new', 'tags'] });
    expect(result.success).toBe(true);
  });

  it('leaves tags undefined when omitted so an update never wipes them', () => {
    // The service only replaces the tag set when tags is present, so an update
    // that does not mention tags must leave the existing links untouched.
    const result = applicationUpdateSchema.safeParse({ postingUrl: 'https://example.com/1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toBeUndefined();
    }
  });

  it('accepts an explicitly empty tag list to clear every tag', () => {
    const result = applicationUpdateSchema.safeParse({ tags: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it('rejects a blank tag name and more than 30 tags', () => {
    expect(applicationUpdateSchema.safeParse({ tags: ['  '] }).success).toBe(false);
    const tags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
    expect(applicationUpdateSchema.safeParse({ tags }).success).toBe(false);
  });

  it('trims notes, stores an empty string or null as a clear and rejects over 10000 characters', () => {
    expect(applicationUpdateSchema.parse({ notes: '  call Jane  ' }).notes).toBe('call Jane');
    expect(applicationUpdateSchema.parse({ notes: '' }).notes).toBeNull();
    expect(applicationUpdateSchema.parse({ notes: null }).notes).toBeNull();
    expect(applicationUpdateSchema.safeParse({ notes: 'x'.repeat(10_001) }).success).toBe(false);
  });
});

describe('company schemas', () => {
  it('coerces empty optional strings through create schema', () => {
    const input = validateBody(companyCreateSchema, {
      name: 'Acme',
      website: '',
      industry: ' ',
    });
    expect(input.name).toBe('Acme');
    expect(input.website).toBe('');
  });

  it('allows a partial update', () => {
    const result = companyUpdateSchema.safeParse({ website: 'https://acme.dev' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty company name', () => {
    expect(() => validateBody(companyCreateSchema, { name: ' ' })).toThrow('Validation failed');
  });
});

describe('statusChangeSchema', () => {
  it('requires a known status', () => {
    expect(() => validateBody(statusChangeSchema, { status: 'BOSS' })).toThrow('Validation failed');
  });

  it('accepts a status with an optional note', () => {
    const input = validateBody(statusChangeSchema, {
      status: ApplicationStatus.INTERVIEW,
      note: 'Round 1',
    });
    expect(input.note).toBe('Round 1');
  });
});

describe('tagCreateSchema', () => {
  it('rejects tags with forbidden characters', () => {
    expect(() => validateBody(tagCreateSchema, { name: 'Remote #2!' })).toThrow(
      'Validation failed',
    );
    expect(() => validateBody(tagCreateSchema, { name: 'Remote-2+' })).not.toThrow();
  });
});