import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApplicationsPage } from '../pages/ApplicationsPage';
import { ApplicationStatus, type Application } from '../types';

vi.mock('../lib/api', () => {
  const get = vi.fn();
  const patch = vi.fn();
  const post = vi.fn();
  return {
    api: { get, patch, post },
    getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
  };
});

const { api } = await import('../lib/api');
const getMock = vi.mocked(api.get);

function makeApplication(
  id: string,
  roleTitle: string,
  status: ApplicationStatus,
  tag: string,
  day: number,
): Application {
  return {
    id,
    userId: 'user-1',
    companyId: `co-${id}`,
    roleTitle,
    jobDescription: 'JD',
    postingUrl: null,
    location: 'Berlin',
    isRemote: false,
    salaryRange: null,
    resumeVersion: null,
    notes: null,
    currentStatus: status,
    appliedAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    createdAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    company: { id: `co-${id}`, name: `Company ${id}`, website: null, industry: null, notes: null, createdAt: '2026-09-01T00:00:00.000Z' },
    tags: [{ id: `tag-${tag}`, name: tag }],
    statusHistory: [{ id: `hist-${id}`, status, note: null, changedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z` }],
  };
}

const applications: Application[] = [
  makeApplication('app-1', 'Engineer', ApplicationStatus.APPLIED, 'linkedin', 7),
  makeApplication('app-2', 'Designer', ApplicationStatus.APPLIED, 'email', 6),
  makeApplication('app-3', 'Developer', ApplicationStatus.APPLIED, 'linkedin', 5),
  makeApplication('app-4', 'Manager', ApplicationStatus.APPLIED, 'linkedin', 4),
  makeApplication('app-5', 'Analyst', ApplicationStatus.APPLIED, 'email', 3),
  makeApplication('app-6', 'Architect', ApplicationStatus.APPLIED, 'linkedin', 2),
  makeApplication('app-7', 'Tester', ApplicationStatus.APPLIED, 'linkedin', 1),
  makeApplication('app-8', 'Interviewer', ApplicationStatus.INTERVIEW, 'linkedin', 1),
];

const tags = [
  { id: 'tag-linkedin', name: 'linkedin' },
  { id: 'tag-email', name: 'email' },
];

function mockApi(override?: (url: string) => Application[] | undefined) {
  getMock.mockImplementation((url) => {
    const custom = override?.(url);
    if (custom) return Promise.resolve({ data: custom });
    if (url === '/api/applications') return Promise.resolve({ data: applications });
    if (url === '/api/tags') return Promise.resolve({ data: tags });
    return Promise.resolve({ data: [] });
  });
}

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockReset();
});

describe('Applications list', () => {
  it('renders each application as a link to its detail page', async () => {
    mockApi();
    renderList();

    const link = await screen.findByRole('link', { name: /Engineer/ });
    expect(link).toHaveAttribute('href', '/applications/app-1');
  });

  it('no longer offers the old inline status shortcut on list cards', async () => {
    mockApi();
    renderList();

    await screen.findByRole('link', { name: /Engineer/ });
    expect(screen.queryByRole('button', { name: /^applied$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('filters cards from a source chip without changing the other chip counts', async () => {
    mockApi();
    const user = userEvent.setup();
    renderList();

    await screen.findByRole('link', { name: /Engineer/ });
    expect(screen.getByRole('button', { name: /#linkedin/ })).toHaveTextContent('6');

    await user.click(screen.getByRole('button', { name: /#email/ }));

    expect(await screen.findByRole('link', { name: /Designer/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Analyst/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Engineer/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /#linkedin/ })).toHaveTextContent('6');
  });

  it('shows the remaining applied cards when "Show more" is clicked', async () => {
    mockApi();
    const user = userEvent.setup();
    renderList();

    await screen.findByRole('link', { name: /Engineer/ });
    expect(screen.queryByRole('link', { name: /Architect/ })).not.toBeInTheDocument();

    const more = screen.getByRole('button', { name: /Show 2 more/i });
    await user.click(more);

    expect(await screen.findByRole('link', { name: /Architect/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tester/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show .* more/i })).not.toBeInTheDocument();
  });

  it('sends the debounced search query and shows only matching cards', async () => {
    mockApi((url) => (url.includes('search=Designer') ? [applications[1]!] : undefined));
    const user = userEvent.setup();
    renderList();

    await screen.findByRole('link', { name: /Engineer/ });
    await user.type(screen.getByLabelText('Search companies, roles, notes'), 'Designer');

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith('/api/applications?search=Designer');
    });

    expect(await screen.findByRole('link', { name: /Designer/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Engineer/ })).not.toBeInTheDocument();
  });
});
