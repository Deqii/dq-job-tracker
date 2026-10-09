import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { IconBriefcase, IconCalendar, IconClose, IconDownload, IconMapPin, IconPlus, IconSearch } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { NativeSelect } from '../components/Select';
import { PageLoader, Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { TagChip } from '../components/TagChip';
import { downloadExport, useApplications, useUpdateStatus } from '../hooks/useApplications';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useTags } from '../hooks/useTags';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS, STATUS_ORDER, formatDate } from '../lib/utils';
import { ApplicationStatus } from '../types';
import type { Application, ApplicationFilters } from '../types';

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
                            <span className="text-xs text-slate-500">· Remote</span>
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
                  <StatusBadgeMenu application={application} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
function StatusBadgeMenu({ application }: { application: Application }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateStatus = useUpdateStatus();

  const current = application.currentStatus;
  const options = STATUS_ORDER.filter((s) => s !== current);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const items = menuRef.current?.querySelectorAll('button[role="menuitem"]');
        if (items && items.length > 0) {
          (items[0] as HTMLButtonElement).focus();
        }
      }
    };
    const onClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  const handleSelect = async (status: ApplicationStatus) => {
    setError('');
    try {
      await updateStatus.mutateAsync({ id: application.id, input: { status } });
      setOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="relative shrink-0">
      <StatusBadge
        ref={btnRef}
        status={current}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (updateStatus.isPending) return;
          setOpen((v) => !v);
        }}
        disabled={updateStatus.isPending}
        aria-haspopup="menu" aria-expanded={open}
        className={updateStatus.isPending ? 'opacity-60' : ''}
      />
      {open && !updateStatus.isPending ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {options.map((status, idx) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleSelect(status);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const items = Array.from(menuRef.current?.querySelectorAll('button[role="menuitem"]') || []);
                  const next = items[(idx + 1) % items.length] as HTMLButtonElement | undefined;
                  next?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const items = Array.from(menuRef.current?.querySelectorAll('button[role="menuitem"]') || []);
                  const prev = items[(idx - 1 + items.length) % items.length] as HTMLButtonElement | undefined;
                  prev?.focus();
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void handleSelect(status);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setOpen(false);
                  btnRef.current?.focus();
                }
              }}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
