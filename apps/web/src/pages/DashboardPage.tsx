import { Link } from 'react-router-dom';

import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { IconBriefcase, IconPlus } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { PageLoader } from '../components/Spinner';
import { TagChip } from '../components/TagChip';
import { emptyCounts, responseRateOf, useDashboard } from '../hooks/useDashboard';
import { getErrorMessage } from '../lib/api';
import { STATUS_LABELS, STATUS_ORDER, STATUS_STYLES, formatDate, formatPercent, timeAgo } from '../lib/utils';
import { ApplicationStatus } from '../types';

export function DashboardPage() {
  const { data, isLoading, isError, error } = useDashboard();

  if (isLoading) return <PageLoader label="Loading your dashboard…" />;

  if (isError || !data) {
    return <ErrorMessage message={`Could not load the dashboard: ${getErrorMessage(error)}`} />;
  }

  const counts = data.counts ?? emptyCounts();
  const total = data.total ?? Object.values(counts).reduce((sum, count) => sum + count, 0);
  const responseRate = responseRateOf(counts, total);
  const recent = data.recentActivity ?? [];
  const tagStats = data.tagStats ?? [];
  const followUps = data.followUps ?? { count: 0, items: [] };

  const inProgress =
    counts[ApplicationStatus.ASSESSMENT] + counts[ApplicationStatus.INTERVIEW];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="A snapshot of your job search at a glance" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total applications" value={total} icon={<IconBriefcase className="h-4 w-4" />} />
        <StatCard
          label="Response rate"
          value={formatPercent(responseRate ?? 0)}
          hint={responseRate === null ? 'No applications to measure yet' : 'Interview + offer stage'}
        />
        <StatCard
          label="In progress"
          value={inProgress}
          hint={`${counts[ApplicationStatus.ASSESSMENT]} assessment · ${counts[ApplicationStatus.INTERVIEW]} interview`}
        />
        <StatCard label="Offers received" value={counts[ApplicationStatus.OFFER]} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Pipeline breakdown</h2>
            <div className="space-y-3">
              {STATUS_ORDER.map((status) => {
                const count = counts[status] ?? 0;
                const percentage = total > 0 ? (count / total) * 100 : 0;
                const style = STATUS_STYLES[status];
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                        <span className={`h-2 w-2 rounded-full ${style.bar}`} aria-hidden="true" />
                        {STATUS_LABELS[status]}
                      </span>
                      <span className="text-slate-500">
                        {count}
                        <span className="ml-1 text-xs text-slate-500">({Math.round(percentage)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${style.bar}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">By tag</h2>
            {tagStats.length === 0 ? (
              <p className="text-sm text-slate-500">
                Add tags to your applications to compare sources
              </p>
            ) : (
              <ul className="space-y-3">
                {tagStats.map((stat) => {
                  const percentage =
                    stat.total > 0 ? Math.round((stat.responded / stat.total) * 100) : 0;
                  return (
                    <li key={stat.name} className="flex items-center justify-between gap-3">
                      <TagChip name={stat.name} />
                      <span className="text-sm text-slate-600">
                        {stat.total} application{stat.total === 1 ? '' : 's'}
                        <span className="ml-2 text-xs text-slate-500">
                          {stat.responded} responded ({percentage}%)
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Needs follow-up</h2>
              <span className="text-sm font-medium text-slate-500">{followUps.count}</span>
            </div>
            {followUps.items.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing to follow up on yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {followUps.items.map((application) => (
                  <li key={application.id}>
                    <Link
                      to={`/applications/${application.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{application.roleTitle}</p>
                        <p className="truncate text-xs text-slate-500">
                          {application.companyName} · {formatDate(application.appliedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        waiting {application.daysWaiting} days
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
              <Link
                to="/applications"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <EmptyState
                icon={<IconBriefcase className="h-8 w-8" />}
                title="Nothing here yet"
                description="Log your first application to start building your search history."
                action={
                  <Link to="/applications/new" className="btn btn-primary btn-sm">
                    <IconPlus className="h-4 w-4" />
                    Log an application
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((application) => (
                  <li key={application.id}>
                    <Link
                      to={`/applications/${application.id}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{application.roleTitle}</p>
                        <p className="truncate text-xs text-slate-500">
                          {application.company?.name} · {formatDate(application.appliedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs text-slate-500 sm:inline">
                          {timeAgo(application.createdAt)}
                        </span>
                        <StatusBadge status={application.currentStatus} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}