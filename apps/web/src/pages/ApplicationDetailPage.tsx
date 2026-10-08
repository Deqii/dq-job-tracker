import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import {
  IconArrowLeft,
  IconBriefcase,
  IconCalendar,
  IconClock,
  IconEdit,
  IconExternalLink,
  IconFileText,
  IconMapPin,
  IconMoney,
  IconTrash,
} from '../components/Icons';
import { PageLoader } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { StatusSelector } from '../components/StatusSelector';
import { StatusTimeline } from '../components/StatusTimeline';
import { useApplication, useDeleteApplication, useUpdateApplication } from '../hooks/useApplications';
import { getErrorMessage } from '../lib/api';
import { formatDateTime, formatDate, timeAgo } from '../lib/utils';
import { TagInput } from '../components/TagInput';

function InfoRow({
  icon,
  label,
  value,
  link,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  link?: string | null;
  title?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer noopener"
            title={title ?? undefined}
            className="inline-flex max-w-full items-center gap-1 break-all text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {value}
            <IconExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <p className="text-sm font-medium text-slate-800">{value}</p>
        )}
      </div>
    </div>
  );
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: application, isLoading, isError, error } = useApplication(id ?? '');
  const deleteApplication = useDeleteApplication();
  const updateApplication = useUpdateApplication();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagsEdit, setTagsEdit] = useState<string[]>([]);
  const [isTagsDirty, setIsTagsDirty] = useState(false);
  const [tagsError, setTagsError] = useState('');
  const [notesEdit, setNotesEdit] = useState('');
  const [isNotesDirty, setIsNotesDirty] = useState(false);
  const [notesError, setNotesError] = useState('');

  useEffect(() => {
    if (application) {
      setTagsEdit(application.tags?.map((t) => t.name) ?? []);
      setIsTagsDirty(false);
      setTagsError('');
      setNotesEdit(application.notes ?? '');
      setIsNotesDirty(false);
      setNotesError('');
    }
  }, [application, application?.id]);

  if (isLoading) return <PageLoader label="Loading application…" />;

  if (isError || !application) {
    return (
      <div className="space-y-4">
        <Link
          to="/applications"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <IconArrowLeft className="h-4 w-4" />
          Back to applications
        </Link>
        <ErrorMessage message={`Could not load this application: ${getErrorMessage(error)}`} />
      </div>
    );
  }

  const handleDelete = async () => {
    if (!application) return;
    await deleteApplication.mutateAsync(application.id);
    navigate('/applications', { replace: true });
  };

  const tags = (application.tags ?? []).map((t) => t.name);
  const history = application.statusHistory ?? [];

  const handleTagsChange = (next: string[]) => {
    setTagsEdit(next);
    setIsTagsDirty(JSON.stringify([...next].sort()) !== JSON.stringify([...tags].sort()));
  };

  const handleSaveTags = async () => {
    setTagsError('');
    try {
      await updateApplication.mutateAsync({ id: application.id, input: { tags: tagsEdit } });
      setIsTagsDirty(false);
    } catch (err) {
      setTagsError(getErrorMessage(err));
    }
  };

  const handleCancelTags = () => {
    setTagsEdit(tags);
    setIsTagsDirty(false);
    setTagsError('');
  };

  const savedNotes = application.notes ?? '';

  const handleNotesChange = (next: string) => {
    setNotesEdit(next);
    setIsNotesDirty(next !== savedNotes);
  };

  const handleSaveNotes = async () => {
    setNotesError('');
    const value = notesEdit.trim();
    try {
      await updateApplication.mutateAsync({ id: application.id, input: { notes: value } });
      setNotesEdit(value);
      setIsNotesDirty(false);
    } catch (err) {
      setNotesError(getErrorMessage(err));
    }
  };

  const handleCancelNotes = () => {
    setNotesEdit(savedNotes);
    setIsNotesDirty(false);
    setNotesError('');
  };

  return (
    <div>
      <Link
        to="/applications"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <IconArrowLeft className="h-4 w-4" />
        Back to applications
      </Link>

      <div className="card mb-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{application.roleTitle}</h1>
              <StatusBadge status={application.currentStatus} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {application.company ? (
                <Link
                  to={`/companies/${application.company.id}`}
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {application.company.name}
                </Link>
              ) : (
                'Company'
              )}
            </p>
            {tags.length > 0 || isTagsDirty || tagsEdit.length > 0 ? (
              <div className="mt-3 space-y-2">
                <TagInput value={tagsEdit} onChange={handleTagsChange} />
                {isTagsDirty ? (
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn btn-primary btn-xs" onClick={handleSaveTags} disabled={updateApplication.isPending}>
                      Save tags
                    </button>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={handleCancelTags} disabled={updateApplication.isPending}>
                      Cancel
                    </button>
                  </div>
                ) : null}
                {tagsError ? <ErrorMessage message={tagsError} /> : null}
              </div>
            ) : (
              <div className="mt-3">
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setTagsEdit([]); setIsTagsDirty(true); }}>
                  Add tag
                </button>
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Link to={`/applications/${application.id}/edit`} className="btn btn-secondary btn-sm">
              <IconEdit className="h-4 w-4" />
              Edit
            </Link>
            <button
              type="button"
              className="btn btn-danger-ghost btn-sm"
              onClick={() => setConfirmDelete(true)}
            >
              <IconTrash className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow icon={<IconCalendar className="h-4 w-4" />} label="Applied" value={formatDate(application.appliedAt)} />
          <InfoRow icon={<IconClock className="h-4 w-4" />} label="Created" value={formatDateTime(application.createdAt)} />
          <InfoRow icon={<IconMapPin className="h-4 w-4" />} label="Location" value={application.location} />
          <InfoRow
            icon={<IconBriefcase className="h-4 w-4" />}
            label="Remote"
            value={application.isRemote ? 'Yes' : 'No'}
          />
          <InfoRow icon={<IconMoney className="h-4 w-4" />} label="Salary range" value={application.salaryRange} />
          <InfoRow icon={<IconFileText className="h-4 w-4" />} label="Resume version" value={application.resumeVersion} />
          <InfoRow
            icon={<IconExternalLink className="h-4 w-4" />}
            label="Posting"
            value={application.postingUrl}
            link={application.postingUrl}
            title={application.postingUrl}
          />
        </dl>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Update status</h2>
          <StatusSelector applicationId={application.id} />
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Status history</h3>
              {history.length > 0 && history[history.length - 1]?.changedAt ? (
                <span className="text-xs text-slate-400">
                  Last change {timeAgo(history[history.length - 1]?.changedAt ?? '')}
                </span>
              ) : null}
            </div>
            <StatusTimeline history={history} />
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Job description</h2>
            <span className="badge bg-amber-50 text-amber-700 ring-amber-200">Original snapshot</span>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Stored verbatim on the day you applied — never overwritten, even if the listing changed or was
            removed.
          </p>
          <div className="max-h-[560px] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-4">
            {application.jobDescription ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">
                {application.jobDescription}
              </pre>
            ) : (
              <p className="text-sm text-slate-500">No description was captured for this application.</p>
            )}
          </div>
        </section>
      </div>

      <section className="card mt-6 p-5 sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Private to you — whatever you want to recall before the next step.
        </p>
        <textarea
          id="application-notes"
          className="input min-h-[160px] resize-y"
          value={notesEdit}
          onChange={(event) => handleNotesChange(event.target.value)}
          placeholder="Interviewer names, prep notes, anything to remember..."
          disabled={updateApplication.isPending}
        />
        {isNotesDirty ? (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="btn btn-primary btn-xs" onClick={handleSaveNotes} disabled={updateApplication.isPending}>
              Save notes
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={handleCancelNotes} disabled={updateApplication.isPending}>
              Cancel
            </button>
          </div>
        ) : null}
        {notesError ? <div className="mt-3"><ErrorMessage message={notesError} /></div> : null}
      </section>

      {application.statusHistory && application.statusHistory.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No status changes yet"
            description="Move the application forward from the panel above and every change gets recorded here."
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete application?"
        message={`This permanently deletes "${application.roleTitle}" at ${application.company?.name ?? 'the company'}, including its status history and tags. The company record itself is kept.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}