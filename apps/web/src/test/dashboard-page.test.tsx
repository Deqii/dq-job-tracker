import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DashboardPage } from '../pages/DashboardPage';
import { ApplicationStatus } from '../types';
import type { Application, DashboardCounts } from '../types';

vi.mock('../lib/api', () => {
  const get = vi.fn();
  return {
    api: { get },
    getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
  };
});

vi.mock('../hooks/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'tio@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
  }),
}));

const { api } = await import('../lib/api');
const getMock = vi.mocked(api.get);

const counts: DashboardCounts = {
  [ApplicationStatus.WISHLIST]: 0,
  [ApplicationStatus.APPLIED]: 1,
  [ApplicationStatus.ASSESSMENT]: 1,
  [ApplicationStatus.INTERVIEW]: 1,
  [ApplicationStatus.OFFER]: 1,
  [ApplicationStatus.REJECTED]: 1,
  [ApplicationStatus.WITHDRAWN]: 0,
};

const interviewApplication: Application = {
  id: 'app-interview',
  userId: 'user-1',
  companyId: 'company-1',
  roleTitle: 'Fullstack Programmer',
  jobDescription: 'Snapshot',
  postingUrl: null,
  location: 'Jakarta',
  isRemote: false,
  salaryRange: '4-5 juta',
  resumeVersion: null,
  notes: null,
  currentStatus: ApplicationStatus.INTERVIEW,
  appliedAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-10-09T01:51:00.000Z',
  company: { id: 'company-1', name: 'Gatra Hitra Wisana', website: null, industry: null, notes: null, createdAt: '2026-09-01T00:00:00.000Z' },
  statusHistory: [
    { id: 'h1', status: ApplicationStatus.APPLIED, note: null, changedAt: '2026-10-09T01:48:00.000Z' },
    { id: 'h2', status: ApplicationStatus.INTERVIEW, note: null, changedAt: '2026-10-09T01:51:00.000Z' },
  ],
};

function dashboard() {
  return {
    counts,
    total: 6,
    recentActivity: [interviewApplication],
    tagStats: [{ name: 'linkedin', total: 4, responded: 1 }],
    followUps: {
      count: 1,
      items: [
        {
          id: 'app-followup',
          roleTitle: 'Front-End Developer',
          companyName: 'Hire Feed',
          appliedAt: '2026-09-16T02:00:00.000Z',
          daysWaiting: 23,
        },
      ],
    },
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockReset();
});

describe('Dashboard page', () => {
  it('derives the response and interview rates from the counts', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/api/applications') return { data: [interviewApplication] };
      return { data: dashboard() };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Response rate')).toBeInTheDocument());
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('33.3%')).toBeInTheDocument();
    expect(screen.getByText('4 of 6 replied (any answer)')).toBeInTheDocument();
    expect(screen.getByText('2 of 6 reached interview')).toBeInTheDocument();
    expect(screen.getByText('2 are in progress.')).toBeInTheDocument();
  });

  it('shows the active interview and flags a future applied date', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/api/applications') return { data: [interviewApplication] };
      return { data: dashboard() };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Interview in progress')).toBeInTheDocument());
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set schedule' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Write notes' })).toHaveAttribute(
      'href',
      '/applications/app-interview',
    );
    expect(screen.getByText('Future date, please check')).toBeInTheDocument();
    expect(screen.getByText('1 interview (25.0%)')).toBeInTheDocument();
  });
});
