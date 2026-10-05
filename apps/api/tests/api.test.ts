import { ApplicationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

vi.mock('../src/services/auth.service', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
}));

vi.mock('../src/services/company.service', () => ({
  listCompanies: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  deleteCompany: vi.fn(),
}));

vi.mock('../src/services/application.service', () => ({
  listApplications: vi.fn(),
  getApplication: vi.fn(),
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
  changeStatus: vi.fn(),
  buildWhereClause: vi.fn(),
  toDto: vi.fn(),
  applicationInclude: {},
}));

vi.mock('../src/services/tag.service', () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
}));

vi.mock('../src/services/dashboard.service', () => ({
  getDashboard: vi.fn(),
}));

vi.mock('../src/services/export.service', () => ({
  writeApplicationsWorkbook: vi.fn(),
}));

import { app } from '../src/app';
import { createCompany, deleteCompany, listCompanies, updateCompany } from '../src/services/company.service';
import {
  changeStatus,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  updateApplication,
} from '../src/services/application.service';
import { loginUser, registerUser } from '../src/services/auth.service';
import { getDashboard } from '../src/services/dashboard.service';
import { createTag, listTags } from '../src/services/tag.service';
import { writeApplicationsWorkbook } from '../src/services/export.service';

const api = request(app);
const USER_ID = 'user-1';
const token = jwt.sign({ sub: USER_ID }, 'test-secret');
const authHeader = { Authorization: `Bearer ${token}` };

const companyDto = {
  id: 'company-1',
  userId: USER_ID,
  name: 'Acme Inc',
  website: null,
  industry: null,
  notes: null,
  createdAt: new Date(),
  applicationCount: 0,
};

const applicationDto = {
  id: 'app-1',
  userId: USER_ID,
  companyId: 'company-1',
  roleTitle: 'Engineer',
  jobDescription: 'Original JD snapshot',
  postingUrl: null,
  location: 'Remote',
  isRemote: true,
  salaryRange: null,
  resumeVersion: null,
  currentStatus: ApplicationStatus.APPLIED,
  appliedAt: new Date(),
  createdAt: new Date(),
  company: { id: 'company-1', name: 'Acme Inc' },
  tags: [{ id: 'tag-1', name: 'remote' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth routes', () => {
  it('registers a user and returns a token', async () => {
    vi.mocked(registerUser).mockResolvedValue({
      token: 'jwt-token',
      user: { id: 'u1-uuid', email: 'me@example.com', createdAt: new Date() },
    });

    const res = await api
      .post('/api/auth/register')
      .send({ email: 'me@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe('jwt-token');
    expect(res.body.user.email).toBe('me@example.com');
  });

  it('returns 400 with field errors on invalid registration', async () => {
    const res = await api.post('/api/auth/register').send({ email: 'nope', password: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.email).toBeDefined();
    expect(res.body.errors.password).toBeDefined();
  });

  it('logs in an existing user', async () => {
    vi.mocked(loginUser).mockResolvedValue({
      token: 'jwt-token',
      user: { id: 'u1-uuid', email: 'me@example.com', createdAt: new Date() },
    });

    const res = await api
      .post('/api/auth/login')
      .send({ email: 'me@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(vi.mocked(loginUser)).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'password123',
    });
  });
});

describe('auth middleware', () => {
  it('rejects requests without a token', async () => {
    const res = await api.get('/api/applications');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('rejects a malformed token', async () => {
    const res = await api.get('/api/applications').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});

describe('company routes', () => {
  it('lists companies scoped to the authenticated user', async () => {
    vi.mocked(listCompanies).mockResolvedValue([companyDto]);
    const res = await api.get('/api/companies').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Acme Inc');
    expect(vi.mocked(listCompanies)).toHaveBeenCalledWith(USER_ID);
  });

  it('creates a company', async () => {
    vi.mocked(createCompany).mockResolvedValue(companyDto);
    const res = await api
      .post('/api/companies')
      .set(authHeader)
      .send({ name: 'Acme Inc', website: '' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('company-1');
  });

  it('updates a company', async () => {
    vi.mocked(updateCompany).mockResolvedValue({ ...companyDto, website: 'https://acme.dev' });
    const res = await api
      .patch('/api/companies/company-1')
      .set(authHeader)
      .send({ website: 'https://acme.dev' });
    expect(res.status).toBe(200);
  });

  it('deletes a company with 204', async () => {
    vi.mocked(deleteCompany).mockResolvedValue(undefined);
    const res = await api.delete('/api/companies/company-1').set(authHeader);
    expect(res.status).toBe(204);
  });
});

describe('application routes', () => {
  it('lists applications with filters passed through', async () => {
    vi.mocked(listApplications).mockResolvedValue([applicationDto]);
    const res = await api
      .get('/api/applications')
      .set(authHeader)
      .query({ status: 'APPLIED', tag: 'remote', from: '2026-01-01' });

    expect(res.status).toBe(200);
    expect(res.body[0].roleTitle).toBe('Engineer');
    expect(vi.mocked(listApplications)).toHaveBeenCalledWith(USER_ID, {
      search: undefined,
      status: 'APPLIED',
      tag: 'remote',
      from: '2026-01-01',
      to: undefined,
    });
  });

  it('creates an application', async () => {
    vi.mocked(createApplication).mockResolvedValue(applicationDto);
    const res = await api.post('/api/applications').set(authHeader).send({
      companyId: 'company-1',
      roleTitle: 'Engineer',
      jobDescription: 'Original JD snapshot',
      tags: ['remote'],
    });
    expect(res.status).toBe(201);
    expect(res.body.jobDescription).toBe('Original JD snapshot');
    expect(vi.mocked(createApplication)).toHaveBeenCalledWith(USER_ID, expect.anything());
  });

  it('returns a single application', async () => {
    vi.mocked(getApplication).mockResolvedValue(applicationDto);
    const res = await api.get('/api/applications/app-1').set(authHeader);
    expect(res.status).toBe(200);
    expect(vi.mocked(getApplication)).toHaveBeenCalledWith(USER_ID, 'app-1');
  });

  it('updates an application without touching jobDescription', async () => {
    vi.mocked(updateApplication).mockResolvedValue({
      ...applicationDto,
      postingUrl: 'https://boards.example.com/1',
    });
    const res = await api
      .patch('/api/applications/app-1')
      .set(authHeader)
      .send({ postingUrl: 'https://boards.example.com/1' });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateApplication)).toHaveBeenCalledWith(USER_ID, 'app-1', {
      postingUrl: 'https://boards.example.com/1',
    });
  });

  it('changes status through the dedicated endpoint', async () => {
    vi.mocked(changeStatus).mockResolvedValue({
      ...applicationDto,
      currentStatus: ApplicationStatus.INTERVIEW,
    });
    const res = await api
      .post('/api/applications/app-1/status')
      .set(authHeader)
      .send({ status: 'INTERVIEW', note: 'Round 1' });
    expect(res.status).toBe(200);
    expect(vi.mocked(changeStatus)).toHaveBeenCalledWith(USER_ID, 'app-1', {
      status: 'INTERVIEW',
      note: 'Round 1',
    });
  });

  it('rejects an invalid status change', async () => {
    const res = await api
      .post('/api/applications/app-1/status')
      .set(authHeader)
      .send({ status: 'NOPE' });
    expect(res.status).toBe(400);
    expect(res.body.errors.status).toBeDefined();
  });

  it('deletes an application with 204', async () => {
    vi.mocked(deleteApplication).mockResolvedValue(undefined);
    const res = await api.delete('/api/applications/app-1').set(authHeader);
    expect(res.status).toBe(204);
  });

  it('exports an .xlsx with the active filters (export is not treated as an id)', async () => {
    vi.mocked(listApplications).mockResolvedValue([applicationDto]);
    vi.mocked(writeApplicationsWorkbook).mockImplementation((_apps, res) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.status(200).end();
      return Promise.resolve();
    });

    const res = await api
      .get('/api/applications/export')
      .set(authHeader)
      .query({ status: 'APPLIED' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats');
    expect(vi.mocked(writeApplicationsWorkbook)).toHaveBeenCalled();
    expect(vi.mocked(getApplication)).not.toHaveBeenCalled();
  });
});

describe('tag and dashboard routes', () => {
  it('lists tags', async () => {
    vi.mocked(listTags).mockResolvedValue([{ id: 'tag-1', name: 'remote' }]);
    const res = await api.get('/api/tags').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'tag-1', name: 'remote' }]);
  });

  it('creates a tag (normalized by the service)', async () => {
    vi.mocked(createTag).mockResolvedValue({ id: 'tag-1', name: 'remote' });
    const res = await api.post('/api/tags').set(authHeader).send({ name: 'Remote' });
    expect(res.status).toBe(201);
    expect(vi.mocked(createTag)).toHaveBeenCalledWith(USER_ID, 'Remote');
  });

  it('returns dashboard aggregates', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      counts: {
        WISHLIST: 0,
        APPLIED: 1,
        ASSESSMENT: 0,
        INTERVIEW: 0,
        OFFER: 0,
        REJECTED: 0,
        WITHDRAWN: 0,
      },
      total: 1,
      successRate: 0,
      recentActivity: [],
    });
    const res = await api.get('/api/dashboard').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(vi.mocked(getDashboard)).toHaveBeenCalledWith(USER_ID);
  });
});

describe('unknown routes', () => {
  it('returns 404 for an unknown API path', async () => {
    const res = await api.get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});