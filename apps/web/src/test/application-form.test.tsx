import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

import { CompanyCombobox } from '../components/CompanyCombobox';
import { ApplicationFormPage } from '../pages/ApplicationFormPage';
import { api } from '../lib/api';
import { ApplicationStatus, type Company } from '../types';

const companies: Company[] = [
  {
    id: 'co-acme',
    name: 'Acme Corporation',
    website: null,
    industry: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'co-acacia',
    name: 'Acacia Labs',
    website: null,
    industry: null,
    notes: null,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'co-globex',
    name: 'Globex',
    website: null,
    industry: null,
    notes: null,
    createdAt: '2026-01-03T00:00:00.000Z',
  },
];

const getMock = vi.mocked(api.get);
const postMock = vi.mocked(api.post);

function renderCombobox(props: Partial<React.ComponentProps<typeof CompanyCombobox>> = {}) {
  const onChange = vi.fn();
  const onCreateCompany = vi.fn(async (name: string) => ({
    ...companies[0]!,
    id: 'co-new',
    name,
  }));

  render(
    <CompanyCombobox
      companies={companies}
      value=""
      onChange={onChange}
      onCreateCompany={onCreateCompany}
      {...props}
    />,
  );

  return { onChange, onCreateCompany };
}

describe('CompanyCombobox', () => {
  it('filters existing companies case-insensitively', async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'acme');

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Acme Corporation']);
  });

  it('matches regardless of the casing typed', async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'ACME');

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Acme Corporation']);
  });

  it('offers to create a company when the typed text matches nothing', async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Initech');

    expect(screen.getByRole('option', { name: 'Create "Initech"' })).toBeInTheDocument();
  });

  it('does not offer to create a company that already exists', async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Globex');

    expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Globex' })).toBeInTheDocument();
  });

  it('selects an existing company with the keyboard', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'globex');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('co-globex');
    expect(input).toHaveValue('Globex');
  });

  it('creates a company inline when the create option is chosen', async () => {
    const user = userEvent.setup();
    const { onChange, onCreateCompany } = renderCombobox();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'Initech');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onCreateCompany).toHaveBeenCalledWith('Initech'));
    expect(onChange).toHaveBeenCalledWith('co-new');
    await waitFor(() => expect(input).toHaveValue('Initech'));
  });

  it('closes the list on Escape without selecting', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'glob');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function renderFormPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/applications/new']}>
        <Routes>
          <Route path="/applications/new" element={<ApplicationFormPage />} />
          <Route path="/applications/:id" element={<div>application detail</div>} />
          <Route path="/applications" element={<div>applications list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  const company = screen.getByRole('combobox', { name: 'Company' });
  await user.click(company);
  await user.type(company, 'globex');
  await user.keyboard('{Enter}');

  await user.type(screen.getByLabelText(/role title/i), 'Staff Engineer');
  await user.type(screen.getByLabelText(/job description/i), 'We are hiring a staff engineer.');
}

async function addTag(user: ReturnType<typeof userEvent.setup>, name: string) {
  const tagInput = screen.getByLabelText('Add tag');
  await user.type(tagInput, `${name}{Enter}`);
  await waitFor(() => expect(screen.getByRole('button', { name: `Remove tag ${name}` })).toBeInTheDocument());
}

/** Every per-application field, so a reset or a failure can be checked in full. */
async function fillEveryField(user: ReturnType<typeof userEvent.setup>) {
  await fillRequiredFields(user);

  await user.type(screen.getByLabelText(/posting url/i), 'https://globex.example/job/1');
  await user.type(screen.getByLabelText(/location/i), 'Jakarta');
  await user.type(screen.getByLabelText(/salary range/i), 'Rp 8-12 juta');
  await user.click(screen.getByLabelText(/this role is remote/i));
  await addTag(user, 'referral');
}

describe('ApplicationFormPage quick add', () => {
  // Stands in for the server: a company created inline shows up in the list on
  // the next fetch, which is what the invalidation triggers.
  let serverCompanies: Company[];

  beforeEach(() => {
    vi.clearAllMocks();
    serverCompanies = [...companies];
    // The hooks read `data` off the axios response, so the mock must return the
    // full response shape rather than the payload on its own.
    getMock.mockImplementation(async (url: string) => {
      const data = url === '/api/companies' ? serverCompanies : [];
      return { data } as never;
    });
    postMock.mockImplementation(async (url: string) => {
      if (url === '/api/companies') {
        const created: Company = { ...companies[2]!, id: 'co-initech', name: 'Initech' };
        serverCompanies = [...serverCompanies, created];
        return { data: created } as never;
      }
      return {
        data: { id: 'app-1', roleTitle: 'Staff Engineer', companyId: 'co-globex' },
      } as never;
    });
  });

  it('clears the per-application fields but keeps status, date and resume version', async () => {
    const user = userEvent.setup();
    renderFormPage();

    await screen.findByRole('combobox', { name: 'Company' });
    await fillEveryField(user);

    await user.type(screen.getByLabelText(/resume version/i), 'resume-2026-v2.pdf');
    await user.selectOptions(screen.getByLabelText(/initial status/i), ApplicationStatus.ASSESSMENT);
    const appliedDate = screen.getByLabelText(/applied date/i) as HTMLInputElement;
    await user.clear(appliedDate);
    await user.type(appliedDate, '2026-09-29');

    await user.click(screen.getByRole('button', { name: /save & add another/i }));

    await screen.findByRole('status');

    // Reset
    expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('');
    expect(screen.getByLabelText(/role title/i)).toHaveValue('');
    expect(screen.getByLabelText(/job description/i)).toHaveValue('');
    expect(screen.getByLabelText(/posting url/i)).toHaveValue('');
    expect(screen.getByLabelText(/location/i)).toHaveValue('');
    expect(screen.getByLabelText(/salary range/i)).toHaveValue('');
    expect(screen.getByLabelText(/this role is remote/i)).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Remove tag referral' })).not.toBeInTheDocument();

    // Kept
    expect(screen.getByLabelText(/initial status/i)).toHaveValue(ApplicationStatus.ASSESSMENT);
    expect(screen.getByLabelText(/applied date/i)).toHaveValue('2026-09-29');
    expect(screen.getByLabelText(/resume version/i)).toHaveValue('resume-2026-v2.pdf');
  });

  it('posts the application and stays on the form after "Save & add another"', async () => {
    const user = userEvent.setup();
    renderFormPage();

    await screen.findByRole('combobox', { name: 'Company' });
    await fillRequiredFields(user);

    await user.click(screen.getByRole('button', { name: /save & add another/i }));

    await screen.findByRole('status');
    expect(postMock).toHaveBeenCalledWith(
      '/api/applications',
      expect.objectContaining({ companyId: 'co-globex', roleTitle: 'Staff Engineer' }),
    );
    expect(screen.queryByText('application detail')).not.toBeInTheDocument();
  });

  it('navigates away after a normal save', async () => {
    const user = userEvent.setup();
    renderFormPage();

    await screen.findByRole('combobox', { name: 'Company' });
    await fillRequiredFields(user);

    await user.click(screen.getByRole('button', { name: /save application/i }));

    await screen.findByText('application detail');
  });

  it('creates a company inline, selects it and refreshes the company list', async () => {
    const user = userEvent.setup();
    renderFormPage();

    const company = await screen.findByRole('combobox', { name: 'Company' });
    await user.click(company);
    await user.type(company, 'Initech');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/api/companies', { name: 'Initech' }),
    );
    await waitFor(() => expect(company).toHaveValue('Initech'));

    // The company was POSTed, not matched against the seeded list, and the list
    // query was invalidated so a re-read picks the new company up as an existing
    // option instead of still offering to create it.
    expect(serverCompanies.map((entry) => entry.name)).toContain('Initech');
    await waitFor(() =>
      expect(
        getMock.mock.calls.filter(([url]) => url === '/api/companies').length,
      ).toBeGreaterThan(1),
    );

    await user.clear(company);
    await user.type(company, 'Initech');
    expect(screen.getByRole('option', { name: 'Initech' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Create/ })).not.toBeInTheDocument();
  });

  it('keeps every field and re-enables the buttons when the save fails', async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValueOnce(new Error('boom'));

    renderFormPage();
    await screen.findByRole('combobox', { name: 'Company' });
    await fillEveryField(user);
    await user.type(screen.getByLabelText(/resume version/i), 'resume-2026-v2.pdf');
    await user.selectOptions(screen.getByLabelText(/initial status/i), ApplicationStatus.INTERVIEW);

    const saveAndAddAnother = screen.getByRole('button', { name: /save & add another/i });
    await user.click(saveAndAddAnother);

    await screen.findByRole('alert');

    expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue('Globex');
    expect(screen.getByLabelText(/role title/i)).toHaveValue('Staff Engineer');
    expect(screen.getByLabelText(/job description/i)).toHaveValue(
      'We are hiring a staff engineer.',
    );
    expect(screen.getByLabelText(/posting url/i)).toHaveValue('https://globex.example/job/1');
    expect(screen.getByLabelText(/location/i)).toHaveValue('Jakarta');
    expect(screen.getByLabelText(/salary range/i)).toHaveValue('Rp 8-12 juta');
    expect(screen.getByLabelText(/resume version/i)).toHaveValue('resume-2026-v2.pdf');
    expect(screen.getByLabelText(/this role is remote/i)).toBeChecked();
    expect(screen.getByLabelText(/initial status/i)).toHaveValue(ApplicationStatus.INTERVIEW);
    expect(screen.getByRole('button', { name: 'Remove tag referral' })).toBeInTheDocument();

    // Usable again for a retry.
    expect(saveAndAddAnother).toBeEnabled();
    expect(screen.getByRole('button', { name: /save application/i })).toBeEnabled();
  });

  it('disables both save buttons while the save is in flight', async () => {
    const user = userEvent.setup();
    let releaseSave: (() => void) | undefined;
    postMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSave = () =>
            resolve({ data: { id: 'app-1', roleTitle: 'Staff Engineer', companyId: 'co-globex' } });
        }),
    );

    renderFormPage();
    await screen.findByRole('combobox', { name: 'Company' });
    await fillRequiredFields(user);

    const saveAndAddAnother = screen.getByRole('button', { name: /save & add another/i });
    const saveApplication = screen.getByRole('button', { name: /save application/i });

    await user.click(saveAndAddAnother);

    await waitFor(() => {
      expect(saveAndAddAnother).toBeDisabled();
      expect(saveApplication).toBeDisabled();
    });

    await act(async () => {
      releaseSave?.();
    });

    await screen.findByRole('status');
    expect(saveAndAddAnother).toBeEnabled();
    expect(saveApplication).toBeEnabled();
  });

  it('still requires a company', async () => {
    const user = userEvent.setup();
    renderFormPage();

    await screen.findByRole('combobox', { name: 'Company' });
    await user.type(screen.getByLabelText(/role title/i), 'Staff Engineer');
    await user.type(screen.getByLabelText(/job description/i), 'We are hiring a staff engineer.');

    await user.click(screen.getByRole('button', { name: /save & add another/i }));

    expect(await screen.findByText('Select a company')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalledWith('/api/applications', expect.anything());
  });
});