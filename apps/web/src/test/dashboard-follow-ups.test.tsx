import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DashboardPage } from '../pages/DashboardPage';
import { ApplicationStatus } from '../types';
import type { DashboardCounts, DashboardFollowUps } from '../types';

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
  [ApplicationStatus.APPLIED]: 2,
  [ApplicationStatus.ASSESSMENT]: 0,
  [ApplicationStatus.INTERVIEW]: 0,
  [ApplicationStatus.OFFER]: 0,
  [ApplicationStatus.REJECTED]: 0,
  [ApplicationStatus.WITHDRAWN]: 0,
};

function dashboard(followUps?: DashboardFollowUps) {
  return {
    counts,
    total: 2,
    recentActivity: [],
    ...(followUps ? { followUps } : {}),
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

describe('Dashboard needs follow-up card', () => {
  it('renders each follow-up with a link, the waiting time, and the company', async () => {
    getMock.mockResolvedValue({
      data: dashboard({
        count: 5,
        items: [
          {
            id: 'app-1',
            roleTitle: 'Backend Engineer',
            companyName: 'Acme Inc',
            appliedAt: '2026-09-01T00:00:00.000Z',
            daysWaiting: 38,
          },
          {
            id: 'app-2',
            roleTitle: 'Platform Engineer',
            companyName: 'Globex',
            appliedAt: '2026-09-20T00:00:00.000Z',
            daysWaiting: 19,
          },
        ],
      }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Needs follow-up')).toBeInTheDocument());

    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText(/Acme Inc/)).toBeInTheDocument();
    expect(screen.getByText('waiting 38 days')).toBeInTheDocument();
    expect(screen.getByText('waiting 19 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Backend Engineer/ })).toHaveAttribute(
      'href',
      '/applications/app-1',
    );
    expect(screen.getByRole('link', { name: /Platform Engineer/ })).toHaveAttribute(
      'href',
      '/applications/app-2',
    );
  });

  it('shows the empty state when nothing needs a follow-up', async () => {
    getMock.mockResolvedValue({ data: dashboard({ count: 0, items: [] }) });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Nothing to follow up on yet.')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/waiting \d+ days/)).not.toBeInTheDocument();
  });
});
