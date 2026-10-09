import { render, screen, waitFor } from '@testing-library/react';
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
    getMock.mockResolvedValue({
      data: dashboard([
        { name: 'linkedin', total: 3, responded: 1 },
        { name: 'email', total: 2, responded: 2 },
      ]),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('By tag')).toBeInTheDocument());
    expect(screen.getByText('#linkedin')).toBeInTheDocument();
    expect(screen.getByText('3 applications')).toBeInTheDocument();
    expect(screen.getByText('1 responded (33%)')).toBeInTheDocument();
    expect(screen.getByText('#email')).toBeInTheDocument();
    expect(screen.getByText('2 applications')).toBeInTheDocument();
    expect(screen.getByText('2 responded (100%)')).toBeInTheDocument();
  });

  it('shows the empty state when the dashboard carries no tags', async () => {
    getMock.mockResolvedValue({ data: dashboard() });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Add tags to your applications to compare sources'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('#linkedin')).not.toBeInTheDocument();
  });
});
