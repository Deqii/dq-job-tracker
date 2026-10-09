import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '../hooks/AuthProvider';
import { CompanyListPage } from '../pages/CompanyListPage';
import { Layout } from '../components/Layout';

vi.mock('../lib/api', () => {
  const get = vi.fn();
  const del = vi.fn();
  return {
    api: { get, delete: del },
    getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : 'error'),
    getStoredAuth: () => ({ token: null, user: null }),
    storeAuth: vi.fn(),
    clearStoredAuth: vi.fn(),
  };
});

const { api } = await import('../lib/api');
const getMock = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('icon-only buttons expose accessible names', () => {
  it('the logout button exposes its accessible name', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />} path="/" />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('company card icon actions include the company name', async () => {
    getMock.mockResolvedValue({
      data: [
        {
          id: 'co-1',
          name: 'Acme',
          website: 'https://acme.test',
          industry: null,
          notes: null,
          createdAt: '2026-09-20T10:00:00.000Z',
          applicationCount: 2,
        },
      ],
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CompanyListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Delete Acme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Acme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Visit Acme website' })).toBeInTheDocument();
  });
});
