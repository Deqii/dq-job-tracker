import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
const postMock = vi.mocked(api.post);

const applications: Application[] = [
  {
    id: 'app-1',
    userId: 'user-1',
    companyId: 'co-1',
    roleTitle: 'Engineer',
    jobDescription: 'JD',
    postingUrl: null,
    location: 'Berlin',
    isRemote: false,
    salaryRange: null,
    resumeVersion: null,
    notes: null,
    currentStatus: ApplicationStatus.APPLIED,
    appliedAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    company: { id: 'co-1', name: 'Acme', website: null, industry: null, notes: null, createdAt: '2026-09-01T00:00:00.000Z' },
    tags: [],
    statusHistory: [],
  },
];

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
  postMock.mockReset();
});

describe('Applications list status shortcut', () => {
  it('Selecting a status sends a POST to /api/applications/<id>/status with exactly { status }', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/api/applications') {
        return Promise.resolve({ data: applications });
      }
      if (url === '/api/tags') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
    postMock.mockResolvedValue({ data: { ...applications[0], currentStatus: ApplicationStatus.ASSESSMENT } });

    const user = userEvent.setup();
    renderList();

    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    const badge = screen.getByRole('button', { name: /applied/i });
    await user.click(badge);

    const assessment = await screen.findByRole('menuitem', { name: /assessment/i });
    await user.click(assessment);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/applications/app-1/status', { status: ApplicationStatus.ASSESSMENT });
    });
  });

  it('The current status is not offered in the menu', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/api/applications') {
        return Promise.resolve({ data: applications });
      }
      if (url === '/api/tags') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    const user = userEvent.setup();
    renderList();

    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    const badge = screen.getByRole('button', { name: /applied/i });
    await user.click(badge);

    expect(screen.queryByRole('menuitem', { name: /applied/i })).not.toBeInTheDocument();
  });

  it('Clicking the badge does not navigate to the detail page', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/api/applications') {
        return Promise.resolve({ data: applications });
      }
      if (url === '/api/tags') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
    postMock.mockResolvedValue({ data: { ...applications[0], currentStatus: ApplicationStatus.ASSESSMENT } });

    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/applications']}>
          <Routes>
            <Route path="/applications" element={<ApplicationsPage />} />
            <Route path="/applications/:id" element={<div>detail page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    const badge = screen.getByRole('button', { name: /applied/i });
    await user.click(badge);
    const assessment = await screen.findByRole('menuitem', { name: /assessment/i });
    await user.click(assessment);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/api/applications/app-1/status', { status: ApplicationStatus.ASSESSMENT });
    });
    expect(screen.queryByText('detail page')).not.toBeInTheDocument();
  });

  it('A failed change shows the error and the badge still shows the old status and is enabled again', async () => {
    getMock.mockImplementation((url) => {
      if (url === '/api/applications') {
        return Promise.resolve({ data: applications });
      }
      if (url === '/api/tags') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
    postMock.mockRejectedValue(new Error('Network error'));

    const user = userEvent.setup();
    renderList();

    await waitFor(() => expect(screen.getByText('Engineer')).toBeInTheDocument());

    const badge = screen.getByRole('button', { name: /applied/i });
    await user.click(badge);

    const assessment = await screen.findByRole('menuitem', { name: /assessment/i });
    await user.click(assessment);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /applied/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /applied/i })).toBeEnabled();
  });
});
