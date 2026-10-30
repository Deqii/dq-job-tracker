import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DashboardPage } from '../pages/DashboardPage';
import { ApplicationStatus } from '../types';
import type { DashboardCounts, TagStat } from '../types';

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
  [ApplicationStatus.ASSESSMENT]: 0,
  [ApplicationStatus.INTERVIEW]: 1,
  [ApplicationStatus.OFFER]: 1,
  [ApplicationStatus.REJECTED]: 0,
  [ApplicationStatus.WITHDRAWN]: 0,
};

function dashboard(tagStats?: TagStat[]) {
  return {
    counts,
    total: 3,
    recentActivity: [],
    ...(tagStats ? { tagStats } : {}),
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

describe('Dashboard by tag card', () => {
  it('renders one row per tag with the total and the responded share', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/api/applications') return { data: [] };
      return {
        data: dashboard([
          { name: 'linkedin', total: 3, responded: 1 },
          { name: 'email', total: 2, responded: 2 },
        ]),
      };
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Sources')).toBeInTheDocument());
    const linkedin = screen.getByText('linkedin').closest('div')?.parentElement as HTMLElement;
    expect(within(linkedin).getByText('3')).toBeInTheDocument();
    expect(within(linkedin).getByText('applications')).toBeInTheDocument();
    expect(screen.getByText('1 interview (33.3%)')).toBeInTheDocument();
    const email = screen.getByText('email').closest('div')?.parentElement as HTMLElement;
    expect(within(email).getByText('2')).toBeInTheDocument();
    expect(within(email).getByText('applications')).toBeInTheDocument();
    expect(screen.getByText('2 interviews (100.0%)')).toBeInTheDocument();
    expect(screen.queryByText('#linkedin')).not.toBeInTheDocument();
    expect(screen.queryByText('#email')).not.toBeInTheDocument();
  });

  it('shows the empty state when the dashboard carries no tags', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/api/applications') return { data: [] };
      return { data: dashboard() };
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Add tags to your applications to compare sources'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('#linkedin')).not.toBeInTheDocument();
  });
});
