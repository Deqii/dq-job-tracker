import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApplicationDetailPage } from '../pages/ApplicationDetailPage';
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
const patchMock = vi.mocked(api.patch);
const postMock = vi.mocked(api.post);

const application: Application = {
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
  currentStatus: ApplicationStatus.APPLIED,
  appliedAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-10-01T10:00:00.000Z',
  company: { id: 'co-1', name: 'Acme', website: null, industry: null, notes: null, createdAt: '2026-09-01T00:00:00.000Z' },
  tags: [{ id: 't1', name: 'frontend' }, { id: 't2', name: 'urgent' }],
  statusHistory: [
    { id: 'sh1', status: ApplicationStatus.APPLIED, note: 'Applied', changedAt: '2026-10-01T10:00:00.000Z' },
    { id: 'sh2', status: ApplicationStatus.ASSESSMENT, note: null, changedAt: '2026-10-05T14:00:00.000Z' },
  ],
};

function renderDetail(id = 'app-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/applications/${id}`]}>
        <Routes>
          <Route path="/applications/:id" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ApplicationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The hooks read `data` off the axios response, so every URL needs its own
    // payload rather than one object returned for all of them.
    getMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/applications/')) return { data: application } as never;
      return { data: [] } as never;
    });
    patchMock.mockResolvedValue({ data: application } as never);
    postMock.mockResolvedValue({ data: application } as never);
  });

  it('shows tags section and save/cancel only when dirty', async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole('button', { name: /Remove tag frontend/i });
    expect(screen.queryByRole('button', { name: /save tags/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Remove tag frontend/i }));
    expect(screen.getByRole('button', { name: /save tags/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('saves tags by sending exactly { tags } to PATCH /api/applications/:id', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole('button', { name: 'Remove tag frontend' });
    await user.click(screen.getByRole('button', { name: 'Remove tag frontend' }));
    await user.click(screen.getByRole('button', { name: /save tags/i }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    // The API replaces the whole tag set, so the body is the full selection and
    // nothing else: no other field may ride along with it.
    expect(patchMock).toHaveBeenCalledWith('/api/applications/app-1', { tags: ['urgent'] });
    const body = patchMock.mock.calls[0]?.[1] as { tags?: string[] };
    expect(Object.keys(body)).toEqual(['tags']);
  });

  it('keeps the edited tags on screen and re-enables Save/Cancel when the save fails', async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValueOnce(new Error('Tags could not be saved'));
    renderDetail();

    await screen.findByRole('button', { name: 'Remove tag frontend' });
    await user.click(screen.getByRole('button', { name: 'Remove tag frontend' }));

    const save = screen.getByRole('button', { name: /save tags/i });
    const cancel = screen.getByRole('button', { name: /cancel/i });
    await user.click(save);

    await screen.findByRole('alert');

    // The edit survives the failure, so the user can retry or discard it.
    expect(screen.getByRole('button', { name: 'Remove tag urgent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove tag frontend' })).not.toBeInTheDocument();
    expect(save).toBeEnabled();
    expect(cancel).toBeEnabled();
  });

  it('sends { status, note } to POST /api/applications/:id/status and keeps both when the change fails', async () => {
    const user = userEvent.setup();
    renderDetail();

    const statusSelect = await screen.findByRole('combobox', { name: 'New status' });
    const noteInput = screen.getByLabelText(/note \(optional\)/i);

    await user.selectOptions(statusSelect, ApplicationStatus.INTERVIEW);
    await user.type(noteInput, 'Next round on Thursday');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith('/api/applications/app-1/status', {
      status: ApplicationStatus.INTERVIEW,
      note: 'Next round on Thursday',
    });

    // Now the same change, but the API refuses it.
    postMock.mockRejectedValueOnce(new Error('Status could not be changed'));
    await user.selectOptions(statusSelect, ApplicationStatus.INTERVIEW);
    await user.type(noteInput, 'Second round on Friday');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await screen.findByRole('alert');
    expect(postMock).toHaveBeenLastCalledWith('/api/applications/app-1/status', {
      status: ApplicationStatus.INTERVIEW,
      note: 'Second round on Friday',
    });
    // A failed change must not clear the form.
    expect(statusSelect).toHaveValue(ApplicationStatus.INTERVIEW);
    expect(noteInput).toHaveValue('Second round on Friday');
    expect(screen.getByRole('button', { name: /update/i })).toBeEnabled();
  });
});
