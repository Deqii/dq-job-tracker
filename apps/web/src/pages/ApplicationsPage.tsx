import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { IconBriefcase, IconCalendar, IconClose, IconDownload, IconMapPin, IconPlus, IconSearch } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { NativeSelect } from '../components/Select';
import { PageLoader, Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { TagChip } from '../components/TagChip';
import { downloadExport, useApplications } from '../hooks/useApplications';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useTags } from '../hooks/useTags';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS, STATUS_ORDER, formatDate } from '../lib/utils';
import { ApplicationStatus } from '../types';
import type { ApplicationFilters } from '../types';

function FilterReset({ onReset, active }: { onReset: () => void; active: boolean }) {
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
    >
      <IconClose className="h-3.5 w-3.5" />
      Clear filters
    </button>
  );
}

export function ApplicationsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ApplicationStatus>('');
  const [tag, setTag] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const debouncedSearch = useDebouncedValue(search, 300);

  const filters: ApplicationFilters = useMemo(
    () => ({ search: debouncedSearch, status, tag, from, to }),
    [debouncedSearch, status, tag, from, to],
  );

  const { data: applications = [], isLoading, isError, error } = useApplications(filters);
  const { data: tags = [] } = useTags();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const hasActiveFilters = Boolean(debouncedSearch || status || tag || from || to);

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      await downloadExport(filters);
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Applications"
        subtitle={`${applications.length} ${applications.length === 1 ? 'application' : 'applications'} ${
          hasActiveFilters ? 'match your filters' : 'on record'
        }`}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? <Spinner className="h-4 w-4" /> : <IconDownload className="h-4 w-4" />}
              Export .xlsx
            </button>
            <Link to="/applications/new" className="btn btn-primary btn-md">
              <IconPlus className="h-4 w-4" />
              New application
            </Link>
          </>
        }
      />

      <div className="card mb-6 space-y-3 p-4">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by company or role…"
            aria-label="Search applications"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="statusFilter" className="label">Status</label>
            <NativeSelect<ApplicationStatus>
              value={status}
              onChange={setStatus}
              placeholder="Any status"
              options={STATUS_ORDER.map((value) => ({ value, label: STATUS_LABELS[value] }))}
              selectProps={{ id: 'statusFilter' }}
            />
          </div>
          <div>
            <label htmlFor="tagFilter" className="label">Tag</label>
            <NativeSelect
              value={tag}
              onChange={setTag}
              placeholder="Any tag"
              options={tags.map((t) => ({ value: t.name, label: t.name }))}
              selectProps={{ id: 'tagFilter' }}
            />
          </div>
          <div>
            <label htmlFor="fromDate" className="label">Applied from</label>
            <input
              id="fromDate"
              type="date"
              className="input"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="toDate" className="label">Applied to</label>
            <input
              id="toDate"
              type="date"
              className="input"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
        <FilterReset
          active={hasActiveFilters}
          onReset={() => {
            setSearch('');
            setStatus('');
            setTag('');
            setFrom('');
            setTo('');
          }}
        />
      </div>

      {exportError ? <ErrorMessage message={exportError} className="mb-4" /> : null}

      {isLoading ? <PageLoader label="Loading applications…" /> : null}

      {!isLoading && isError ? (
        <ErrorMessage message={getErrorMessage(error)} />
      ) : null}

      {!isLoading && !isError && applications.length === 0 ? (
        <EmptyState
          icon={<IconBriefcase className="h-10 w-10" />}
          title={hasActiveFilters ? 'No applications match' : 'No applications yet'}
          description={
            hasActiveFilters
              ? 'Try widening your search or clearing the filters.'
              : 'Log your first application — it only takes about a minute.'
          }
          action={
            !hasActiveFilters ? (
              <Link to="/applications/new" className="btn btn-primary btn-md">
                <IconPlus className="h-4 w-4" />
                Log an application
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {!isLoading && !isError && applications.length > 0 ? (
        <ul className="space-y-3">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                to={`/applications/${application.id}`}
                className="card block p-4 transition hover:border-brand-300 hover:shadow-md sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="truncate text-base font-semibold text-slate-900">
                        {application.roleTitle}
                      </h3>
                      <span className="text-sm text-slate-500">at {application.company?.name}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <IconCalendar className="h-4 w-4" />
                        Applied {formatDate(application.appliedAt)}
                      </span>
                      {application.location ? (
                        <span className="inline-flex items-center gap-1.5">
                          <IconMapPin className="h-4 w-4" />
                          {application.location}
                          {application.isRemote ? (
                            <span className="text-xs text-slate-400">· Remote</span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                    {application.tags && application.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {application.tags.map((t) => (
                          <TagChip key={t.id} name={t.name} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <StatusBadge status={application.currentStatus} className="shrink-0" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}