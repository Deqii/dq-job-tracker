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
  notes: null,
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

  it('removes a tag immediately through PATCH and has no separate save control', async () => {
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole('button', { name: /Remove tag frontend/i });
    expect(screen.queryByRole('button', { name: /save tags/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Remove tag frontend/i }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
  });

  it('saves tags by sending exactly { tags } to PATCH /api/applications/:id', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole('button', { name: 'Remove tag frontend' });
    await user.click(screen.getByRole('button', { name: 'Remove tag frontend' }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    // The API replaces the whole tag set, so the body is the full selection and
    // nothing else: no other field may ride along with it.
    expect(patchMock).toHaveBeenCalledWith('/api/applications/app-1', { tags: ['urgent'] });
    const body = patchMock.mock.calls[0]?.[1] as { tags?: string[] };
    expect(Object.keys(body)).toEqual(['tags']);
  });

  it('restores the previous tags and shows an alert when the save fails', async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValueOnce(new Error('Tags could not be saved'));
    renderDetail();

    await screen.findByRole('button', { name: 'Remove tag frontend' });
    await user.click(screen.getByRole('button', { name: 'Remove tag frontend' }));

    await screen.findByRole('alert');

    // The failed edit is rolled back, so the screen shows the persisted set.
    expect(screen.getByRole('alert')).toHaveTextContent('Tags could not be saved');
    expect(screen.getByRole('button', { name: 'Remove tag frontend' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove tag urgent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove tag frontend' })).toBeEnabled();
    expect(screen.getByLabelText('Add a tag')).toBeEnabled();
  });

  it('sends { status, note } to POST /api/applications/:id/status and keeps both when the change fails', async () => {
    const user = userEvent.setup();
    renderDetail();

    const interview = await screen.findByRole('button', { name: 'Interview' });
    const noteInput = screen.getByLabelText(/note \(optional\)/i);

    await user.click(interview);
    await user.type(noteInput, 'Next round on Thursday');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith('/api/applications/app-1/status', {
      status: ApplicationStatus.INTERVIEW,
      note: 'Next round on Thursday',
    });

    // Now the same change, but the API refuses it.
    postMock.mockRejectedValueOnce(new Error('Status could not be changed'));
    await user.click(interview);
    await user.type(noteInput, 'Second round on Friday');
    await user.click(screen.getByRole('button', { name: /update/i }));

    await screen.findByRole('alert');
    expect(postMock).toHaveBeenLastCalledWith('/api/applications/app-1/status', {
      status: ApplicationStatus.INTERVIEW,
      note: 'Second round on Friday',
    });
    // A failed change must not clear the form.
    expect(interview).toHaveAttribute('aria-pressed', 'true');
    expect(noteInput).toHaveValue('Second round on Friday');
    expect(screen.getByRole('button', { name: /update/i })).toBeEnabled();
  });

  it('saves notes by sending exactly { notes } to PATCH /api/applications/:id', async () => {
    const user = userEvent.setup();
    renderDetail();

    const textarea = await screen.findByPlaceholderText(
      'Interviewer names, prep notes, anything to remember…',
    );
    await user.type(textarea, 'Ask about the on-call rotation');
    await user.click(screen.getByRole('button', { name: /save notes/i }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    // Only the notes field travels: no other application field may ride along.
    expect(patchMock).toHaveBeenCalledWith('/api/applications/app-1', {
      notes: 'Ask about the on-call rotation',
    });
    const body = patchMock.mock.calls[0]?.[1] as { notes?: string };
    expect(Object.keys(body)).toEqual(['notes']);
  });

  it('keeps the typed notes on screen and re-enables Save when the save fails', async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValueOnce(new Error('Notes could not be saved'));
    renderDetail();

    const textarea = await screen.findByPlaceholderText(
      'Interviewer names, prep notes, anything to remember…',
    );
    await user.type(textarea, 'Draft that must survive a failure');
    const save = screen.getByRole('button', { name: /save notes/i });
    await user.click(save);

    await screen.findByRole('alert');
    // The failure keeps the text, so the user can retry.
    expect(screen.getByRole('alert')).toHaveTextContent('Notes could not be saved');
    expect(textarea).toHaveValue('Draft that must survive a failure');
    expect(save).toBeEnabled();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });
});
