import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  IconArrowLeft,
  IconBriefcase,
  IconExternalLink,
  IconEdit,
  IconPlus,
  IconTrash,
} from '../components/Icons';
import { PageLoader } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { useCompanies, useDeleteCompany } from '../hooks/useCompanies';
import { useApplications } from '../hooks/useApplications';
import { getErrorMessage } from '../lib/api';
import { formatDate } from '../lib/utils';

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: companies = [], isLoading, isError, error } = useCompanies();
  const { data: applications = [] } = useApplications();
  const deleteCompany = useDeleteCompany();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const company = companies.find((c) => c.id === id);

  if (isLoading) return <PageLoader label="Loading company…" />;

  if (isError || !company) {
    return (
      <div>
        <Link
          to="/companies"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back to companies
        </Link>
        <ErrorMessage message={getErrorMessage(error)} />
      </div>
    );
  }

  const companyApplications = applications
    .filter((application) => application.companyId === company.id)
    .sort(
      (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
    );

  const handleDelete = async () => {
    await deleteCompany.mutateAsync(company.id);
    navigate('/companies', { replace: true });
  };

  return (
    <div>
      <Link
        to="/companies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <IconArrowLeft className="h-4 w-4" />
        Back to companies
      </Link>

      <div className="card mb-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{company.name}</h1>
              {company.industry ? (
                <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{company.industry}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Added {formatDate(company.createdAt)} · {companyApplications.length}{' '}
              {companyApplications.length === 1 ? 'application' : 'applications'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {company.website ? (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn-secondary btn-sm"
              >
                <IconExternalLink className="h-4 w-4" />
                Website
              </a>
            ) : null}
            <Link to={`/companies/${company.id}/edit`} className="btn btn-secondary btn-sm">
              <IconEdit className="h-4 w-4" />
              Edit
            </Link>
            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmDelete(true)}>
              <IconTrash className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
        {company.notes ? (
          <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm text-slate-600">
            {company.notes}
          </p>
        ) : null}
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Applications</h2>
          <Link
            to="/applications/new"
            className="btn btn-primary btn-sm"
            state={{ companyId: company.id }}
          >
            <IconPlus className="h-4 w-4" />
            Add application
          </Link>
        </div>
        {companyApplications.length === 0 ? (
          <EmptyState
            icon={<IconBriefcase className="h-8 w-8" />}
            title="No applications for this company"
            description="Log your first application and it will show up here."
            action={
              <Link to="/applications/new" className="btn btn-primary btn-sm" state={{ companyId: company.id }}>
                <IconPlus className="h-4 w-4" />
                Log an application
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {companyApplications.map((application) => (
              <li key={application.id}>
                <Link
                  to={`/applications/${application.id}`}
                  className="card flex items-center justify-between gap-3 p-4 transition hover:border-brand-300 hover:shadow-md sm:p-5"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-900">{application.roleTitle}</h3>
                    <p className="mt-1 text-sm text-slate-500">Applied {formatDate(application.appliedAt)}</p>
                  </div>
                  <StatusBadge status={application.currentStatus} className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete company?"
        message={`Are you sure you want to permanently delete "${company.name}"? Applications at this company will not be removed.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}