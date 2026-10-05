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