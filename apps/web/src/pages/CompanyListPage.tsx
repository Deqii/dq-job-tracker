import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { IconBuilding, IconClose, IconEdit, IconExternalLink, IconPlus, IconSearch, IconTrash } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { PageLoader } from '../components/Spinner';
import { useCompanies, useDeleteCompany } from '../hooks/useCompanies';
import { getErrorMessage } from '../lib/api';
import { formatDate } from '../lib/utils';

export function CompanyListPage() {
  const { data: companies = [], isLoading, isError, error } = useCompanies();
  const deleteCompany = useDeleteCompany();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name));
  const pendingCompany = sorted.find((company) => company.id === pendingDelete) ?? null;

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;
  const filtered = isSearching
    ? sorted.filter((company) => company.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : sorted;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={
          isSearching
            ? `${filtered.length} of ${companies.length} companies`
            : `${companies.length} ${companies.length === 1 ? 'company' : 'companies'} tracked`
        }
        actions={
          <Link to="/companies/new" className="btn btn-primary btn-md">
            <IconPlus className="h-4 w-4" />
            New company
          </Link>
        }
      />

      {isLoading ? <PageLoader label="Loading companies…" /> : null}
      {!isLoading && isError ? <ErrorMessage message={getErrorMessage(error)} /> : null}

      {!isLoading && !isError && companies.length === 0 ? (
        <EmptyState
          icon={<IconBuilding className="h-10 w-10" />}
          title="No companies yet"
          description="Add the companies you’ve applied to, or create one on the fly while logging an application."
          action={
            <Link to="/companies/new" className="btn btn-primary btn-md">
              <IconPlus className="h-4 w-4" />
              Add a company
            </Link>
          }
        />
      ) : null}

      {!isLoading && !isError && companies.length > 0 ? (
        <div className="card mb-6 p-4">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9 pr-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('');
              }}
              placeholder="Search companies..."
              aria-label="Search companies"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear search"
              >
                <IconClose className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isLoading && !isError && companies.length > 0 && filtered.length === 0 ? (
        <EmptyState
          icon={<IconBuilding className="h-10 w-10" />}
          title={`No companies match "${trimmedQuery}"`}
          action={
            <button type="button" className="btn btn-secondary btn-md" onClick={() => setQuery('')}>
              Clear
            </button>
          }
        />
      ) : null}

      {!isLoading && !isError && filtered.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((company) => (
            <li key={company.id}>
              <div className="card flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/companies/${company.id}`}
                      className="block truncate text-base font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {company.name}
                    </Link>
                    {company.industry ? (
                      <p className="mt-0.5 text-xs text-slate-500">{company.industry}</p>
                    ) : null}
                  </div>
                  <span className="badge bg-slate-100 text-slate-600 ring-slate-200">
                    {company.applicationCount ?? 0}{' '}
                    {(company.applicationCount ?? 0) === 1 ? 'application' : 'applications'}
                  </span>
                </div>
                {company.notes ? (
                  <p className="mt-3 line-clamp-2 text-xs text-slate-500">{company.notes}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">Added {formatDate(company.createdAt)}</span>
                  <div className="flex gap-1">
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-600"
                        aria-label={`Visit ${company.name} website`}
                        title="Visit website"
                      >
                        <IconExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                    <Link
                      to={`/companies/${company.id}/edit`}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label={`Edit ${company.name}`}
                      title="Edit company"
                    >
                      <IconEdit className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(company.id)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Delete ${company.name}`}
                      title="Delete company"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingCompany)}
        onClose={() => setPendingDelete(null)}
        title="Delete company?"
        message={`Are you sure you want to permanently delete "${pendingCompany?.name ?? ''}"? This cannot be undone.`}
        onConfirm={async () => {
          if (pendingDelete) await deleteCompany.mutateAsync(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}