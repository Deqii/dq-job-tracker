import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { CompanyListPage } from '../pages/CompanyListPage';
import type { Company } from '../types';

vi.mock('../lib/api', () => {
  const get = vi.fn();
  const del = vi.fn();
  return {
    api: { get, delete: del },
    getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
  };
});

const { api } = await import('../lib/api');
const getMock = vi.mocked(api.get);

const companies: Company[] = [
  {
    id: 'co-1',
    name: 'Acme',
    website: null,
    industry: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    applicationCount: 1,
  },
  {
    id: 'co-2',
    name: 'Globex',
    website: null,
    industry: null,
    notes: null,
    createdAt: '2026-09-02T00:00:00.000Z',
    applicationCount: 2,
  },
  {
    id: 'co-3',
    name: 'Initech',
    website: null,
    industry: null,
    notes: null,
    createdAt: '2026-09-03T00:00:00.000Z',
    applicationCount: 0,
  },
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CompanyListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const searchBox = () => screen.getByRole('textbox', { name: 'Search companies' });

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockReset();
  getMock.mockResolvedValue({ data: companies });
});

describe('Companies search', () => {
  it('filters the list by company name case-insensitively', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());

    await user.type(searchBox(), 'ACME');

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Globex')).not.toBeInTheDocument();
    expect(screen.queryByText('Initech')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches and Clear restores the list', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());

    await user.type(searchBox(), 'zzz');

    expect(screen.getByText('No companies match "zzz"')).toBeInTheDocument();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Initech')).toBeInTheDocument();
  });

  it('shows the match count in the subtitle while searching', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());

    await user.type(searchBox(), 'ACME');

    expect(screen.getByText('1 of 3 companies')).toBeInTheDocument();
  });
});
